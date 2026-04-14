/**
 * GSC Indexing — soumission sitemap + vérification d'indexation automatique
 *
 * Utilise l'API Google Search Console (Webmasters v3) pour :
 * 1. Soumettre/notifier un sitemap après publication
 * 2. Vérifier le statut d'indexation d'une URL via URL Inspection API
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidGscToken } from "@/lib/gsc-utils";
import { logger } from "@/lib/logger";

// ── Types ───────────────────────────────────────────────────────────────────────

export type IndexationStatus = {
  url: string;
  indexed: boolean | null;
  verdict: string;
  coverage: string;
  last_crawl?: string | null;
  crawled_as?: string | null;
  robots_txt_state?: string | null;
};

export type IndexationCheckResult = {
  results: IndexationStatus[];
  checked_at: string;
};

// ── Soumission de sitemap via GSC API ───────────────────────────────────────────

/**
 * Soumet le sitemap d'un site à Google Search Console.
 * Cela notifie Google qu'un nouveau contenu est disponible.
 *
 * API: PUT /webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}
 */
export async function submitSitemap(
  token: string,
  gscSiteUrl: string,
  sitemapUrl?: string,
): Promise<{ success: boolean; sitemapUrl: string; error?: string }> {
  // Déduire l'URL du sitemap si non fournie
  const siteBase = gscSiteUrl.replace(/\/$/, "");
  const sitemap = sitemapUrl || `${siteBase}/sitemap.xml`;

  const encoded = encodeURIComponent(gscSiteUrl);
  const feedpath = encodeURIComponent(sitemap);

  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encoded}/sitemaps/${feedpath}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.ok || res.status === 204) {
      logger.info(`[gsc-indexing] Sitemap soumis: ${sitemap}`);
      return { success: true, sitemapUrl: sitemap };
    }

    const errText = await res.text();
    logger.warn(`[gsc-indexing] Échec soumission sitemap (${res.status}): ${errText}`);
    return { success: false, sitemapUrl: sitemap, error: errText };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    logger.warn(`[gsc-indexing] Exception soumission sitemap: ${msg}`);
    return { success: false, sitemapUrl: sitemap, error: msg };
  }
}

// ── Vérification d'indexation via URL Inspection API ────────────────────────────

/**
 * Vérifie le statut d'indexation d'une URL via l'API URL Inspection.
 * Retourne des détails enrichis (last crawl, crawled as, robots.txt).
 */
export async function inspectUrl(
  token: string,
  gscSiteUrl: string,
  url: string,
): Promise<IndexationStatus> {
  try {
    const res = await fetch(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inspectionUrl: url,
          siteUrl: gscSiteUrl,
        }),
      },
    );

    if (!res.ok) {
      return { url, indexed: null, verdict: "ERROR", coverage: `HTTP ${res.status}` };
    }

    const data = await res.json() as {
      inspectionResult?: {
        indexStatusResult?: {
          verdict: string;
          coverageState: string;
          lastCrawlTime?: string;
          crawledAs?: string;
          robotsTxtState?: string;
        };
      };
    };

    const idx = data.inspectionResult?.indexStatusResult;
    return {
      url,
      indexed: idx?.verdict === "PASS",
      verdict: idx?.verdict ?? "UNKNOWN",
      coverage: idx?.coverageState ?? "—",
      last_crawl: idx?.lastCrawlTime ?? null,
      crawled_as: idx?.crawledAs ?? null,
      robots_txt_state: idx?.robotsTxtState ?? null,
    };
  } catch {
    return { url, indexed: null, verdict: "ERROR", coverage: "Exception" };
  }
}

/**
 * Vérifie le statut d'indexation de plusieurs URLs (par batch de 5).
 */
export async function inspectUrls(
  token: string,
  gscSiteUrl: string,
  urls: string[],
): Promise<IndexationStatus[]> {
  const BATCH_SIZE = 5;
  const results: IndexationStatus[] = [];

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(url => inspectUrl(token, gscSiteUrl, url)),
    );
    results.push(...batchResults);

    // Pause entre les batches pour respecter les rate limits
    if (i + BATCH_SIZE < urls.length) {
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return results;
}

// ── Soumission sitemap automatique post-publication ─────────────────────────────

/**
 * Après une publication, soumet le sitemap au GSC pour accélérer la découverte.
 * Utilise les credentials GSC du site si disponibles.
 */
export async function notifyGoogleAfterPublish(
  supabase: SupabaseClient,
  userId: string,
  publishedUrl: string,
): Promise<{ sitemap_submitted: boolean; error?: string }> {
  try {
    const { data: site } = await supabase
      .from("sites")
      .select("gsc_site_url, google_access_token, google_refresh_token, google_token_expiry, site_url")
      .eq("user_id", userId)
      .single();

    if (!site?.gsc_site_url || !site?.google_access_token) {
      return { sitemap_submitted: false, error: "GSC non connecté" };
    }

    const token = await getValidGscToken(supabase, userId, site);
    if (!token) {
      return { sitemap_submitted: false, error: "Token GSC invalide" };
    }

    // Soumettre le sitemap
    const sitemapResult = await submitSitemap(token, site.gsc_site_url);

    logger.info(`[gsc-indexing] Post-publication notify: sitemap=${sitemapResult.success} pour ${publishedUrl}`);

    return {
      sitemap_submitted: sitemapResult.success,
      error: sitemapResult.error,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    logger.warn(`[gsc-indexing] notifyGoogleAfterPublish failed: ${msg}`);
    return { sitemap_submitted: false, error: msg };
  }
}

// ── Auto-check indexation pour les publications récentes ────────────────────────

/**
 * Vérifie l'indexation des publications récentes qui n'ont pas encore été
 * confirmées comme indexées. Appelé par le cron.
 *
 * Logique :
 * - Récupère les publications des 7 derniers jours
 * - Filtre celles pas encore marquées "indexed" dans le cache
 * - Vérifie via URL Inspection API
 * - Met à jour le cache indexation_cache dans la table sites
 */
export async function autoCheckRecentIndexation(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ checked: number; newly_indexed: number; not_indexed: string[] }> {
  const { data: site } = await supabase
    .from("sites")
    .select("id, gsc_site_url, google_access_token, google_refresh_token, google_token_expiry, indexation_cache")
    .eq("user_id", userId)
    .single();

  if (!site?.gsc_site_url || !site?.google_access_token) {
    return { checked: 0, newly_indexed: 0, not_indexed: [] };
  }

  const token = await getValidGscToken(supabase, userId, site);
  if (!token) return { checked: 0, newly_indexed: 0, not_indexed: [] };

  // Publications des 7 derniers jours
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentPubs } = await supabase
    .from("publications")
    .select("wordpress_url, published_at")
    .eq("user_id", userId)
    .gte("published_at", sevenDaysAgo.toISOString())
    .not("wordpress_url", "is", null);

  if (!recentPubs || recentPubs.length === 0) {
    return { checked: 0, newly_indexed: 0, not_indexed: [] };
  }

  // Filtrer les URLs déjà confirmées indexées
  const cache = (site.indexation_cache as { results?: Record<string, IndexationStatus> } | null)?.results ?? {};
  const urlsToCheck = recentPubs
    .map(p => p.wordpress_url as string)
    .filter(url => url.startsWith("http") && cache[url]?.indexed !== true);

  if (urlsToCheck.length === 0) {
    return { checked: 0, newly_indexed: 0, not_indexed: [] };
  }

  // Limiter à 10 URLs par run pour ne pas exploser les quotas
  const batch = urlsToCheck.slice(0, 10);
  const results = await inspectUrls(token, site.gsc_site_url, batch);

  // Mettre à jour le cache
  const updatedCache = { ...cache };
  let newlyIndexed = 0;
  const notIndexed: string[] = [];

  for (const r of results) {
    updatedCache[r.url] = {
      indexed: r.indexed,
      verdict: r.verdict,
      coverage: r.coverage,
      last_crawl: r.last_crawl,
      crawled_as: r.crawled_as,
      robots_txt_state: r.robots_txt_state,
    } as IndexationStatus;

    if (r.indexed === true && cache[r.url]?.indexed !== true) {
      newlyIndexed++;
    }
    if (r.indexed === false) {
      notIndexed.push(r.url);
    }
  }

  await supabase
    .from("sites")
    .update({
      indexation_cache: {
        results: updatedCache,
        updated_at: new Date().toISOString(),
      },
    })
    .eq("user_id", userId);

  logger.info(`[gsc-indexing] Auto-check: ${batch.length} vérifiées, ${newlyIndexed} nouvellement indexées, ${notIndexed.length} non indexées`);

  return { checked: batch.length, newly_indexed: newlyIndexed, not_indexed: notIndexed };
}
