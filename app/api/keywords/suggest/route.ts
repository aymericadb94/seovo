/**
 * Smart Keyword Suggestions API v2
 *
 * Returns keywords scored and prioritized from:
 * 1. GSC data (real search performance — position, impressions, CTR)
 * 2. Roadmap (strategic planning)
 * 3. Cocoon (semantic structure)
 * 4. Site keywords (fallback)
 *
 * Each keyword gets a composite SEO score (0-100) based on:
 * - GSC opportunity (low position + high impressions = gold)
 * - Roadmap priority & phase
 * - Cocoon role (pillar > support)
 * - Strategic alignment
 */

import { createClient } from "@/lib/supabase/server";
import { getValidGscToken, fetchGscQueries } from "@/lib/gsc-utils";
import { listAllCmsContent, type CmsCredentials } from "@/lib/cms-update";

type GscMetrics = {
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

type SuggestedKeyword = {
  keyword: string;
  source: "roadmap" | "cocoon" | "gsc" | "settings";
  role: "pillar" | "support" | "opportunity" | "unknown";
  cluster: string | null;
  phase: number | null;
  priority: "haute" | "moyenne" | "faible";
  reason: string;
  score: number; // 0-100 composite SEO score
  gsc: GscMetrics | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Fetch all data in parallel
    const [siteRes, pubsRes, roadmapRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("keywords, google_access_token, google_refresh_token, google_token_expiry, gsc_site_url, site_url, cms, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("keyword").eq("user_id", user.id),
      supabase.from("roadmaps").select("data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const siteKeywords: string[] = siteRes.data?.keywords ?? [];

    // Published keywords: CMS (source of truth) + DB fallback
    const publishedKeywords = new Set(
      (pubsRes.data ?? []).map(p => p.keyword?.toLowerCase()).filter(Boolean)
    );

    // Enrich with CMS page titles as "published" context
    if (siteRes.data?.cms && siteRes.data?.site_url) {
      try {
        const creds: CmsCredentials = {
          cms: siteRes.data.cms, site_url: siteRes.data.site_url,
          wp_username: siteRes.data.wp_username, wp_app_password: siteRes.data.wp_app_password,
          shopify_api_key: siteRes.data.shopify_api_key, shopify_store_url: siteRes.data.shopify_store_url,
          wix_api_key: siteRes.data.wix_api_key, wix_site_id: siteRes.data.wix_site_id,
          custom_api_url: siteRes.data.custom_api_url, custom_api_key: siteRes.data.custom_api_key,
        };
        const cmsContent = await listAllCmsContent(creds, 200);
        // Add CMS titles (normalized) as published context to avoid suggesting already-covered topics
        for (const p of cmsContent) {
          const titleWords = p.title.toLowerCase().replace(/[^a-zàâäéèêëïîôùûüÿçœæ0-9\s]/g, "").trim();
          if (titleWords.length > 5) publishedKeywords.add(titleWords);
        }
      } catch { /* CMS non-fatal */ }
    }

    // ── Fetch GSC data ───────────────────────────────────────────────────
    let gscQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] = [];
    const site = siteRes.data;
    if (site?.google_access_token && site?.gsc_site_url) {
      const token = await getValidGscToken(supabase, user.id, site);
      if (token) {
        gscQueries = await fetchGscQueries(token, site.gsc_site_url, { days: 30, rowLimit: 200 });
      }
    }

    // Build GSC lookup map (lowercase query → metrics)
    const gscMap = new Map<string, GscMetrics>();
    for (const q of gscQueries) {
      gscMap.set(q.query.toLowerCase(), {
        position: q.position,
        impressions: q.impressions,
        clicks: q.clicks,
        ctr: q.ctr,
      });
    }

    const suggestions: SuggestedKeyword[] = [];
    const seenKeywords = new Set<string>();

    // ── 1. Roadmap keywords ──────────────────────────────────────────────
    type RoadmapArticle = {
      id: number;
      title: string;
      keyword: string;
      role: string;
      cluster?: string;
      priority: number;
    };
    type RoadmapPhase = {
      phase: number;
      label: string;
      ids: number[];
    };

    const roadmapData = roadmapRes.data?.data as { articles?: RoadmapArticle[]; phases?: RoadmapPhase[] } | null;
    const roadmapArticles = roadmapData?.articles ?? [];
    const roadmapPhases = roadmapData?.phases ?? [];

    const articlePhaseMap = new Map<number, number>();
    for (const phase of roadmapPhases) {
      for (const id of phase.ids) {
        articlePhaseMap.set(id, phase.phase);
      }
    }

    for (const article of roadmapArticles) {
      const kw = article.keyword?.trim();
      if (!kw) continue;
      const kwLower = kw.toLowerCase();
      if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;

      const phase = articlePhaseMap.get(article.id) ?? null;
      const isPillar = article.role === "pilier" || article.role === "pillar" || article.role === "cluster";
      const gsc = gscMap.get(kwLower) ?? findFuzzyGsc(kwLower, gscMap);

      const priority: "haute" | "moyenne" | "faible" =
        phase === 1 || article.priority <= 10 ? "haute"
        : phase === 2 || article.priority <= 20 ? "moyenne"
        : "faible";

      seenKeywords.add(kwLower);
      suggestions.push({
        keyword: kw,
        source: "roadmap",
        role: isPillar ? "pillar" : "support",
        cluster: article.cluster ?? null,
        phase,
        priority,
        reason: phase
          ? `Roadmap phase ${phase} — ${article.role}`
          : `Roadmap — ${article.role}`,
        score: computeScore({ source: "roadmap", role: isPillar ? "pillar" : "support", priority, gsc }),
        gsc,
      });
    }

    // ── 2. Cocoon keywords ───────────────────────────────────────────────
    type CocoonCluster = {
      name: string;
      priority: string;
      pillar: { title: string; keyword: string; status: string };
      support_pages: { title: string; keyword: string; status: string }[];
    };

    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];

    for (const cluster of clusters) {
      // Pillar
      const pillarKw = cluster.pillar?.keyword?.trim();
      if (pillarKw && cluster.pillar.status !== "existing") {
        const kwLower = pillarKw.toLowerCase();
        if (!publishedKeywords.has(kwLower) && !seenKeywords.has(kwLower)) {
          const gsc = gscMap.get(kwLower) ?? findFuzzyGsc(kwLower, gscMap);
          const priority: "haute" | "moyenne" | "faible" = cluster.priority === "haute" ? "haute" : "moyenne";
          seenKeywords.add(kwLower);
          suggestions.push({
            keyword: pillarKw,
            source: "cocoon",
            role: "pillar",
            cluster: cluster.name,
            phase: null,
            priority,
            reason: `Page pilier du cluster "${cluster.name}"`,
            score: computeScore({ source: "cocoon", role: "pillar", priority, gsc }),
            gsc,
          });
        }
      }

      // Supports
      for (const sp of cluster.support_pages ?? []) {
        const spKw = sp.keyword?.trim();
        if (!spKw || sp.status === "existing") continue;
        const kwLower = spKw.toLowerCase();
        if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;

        const gsc = gscMap.get(kwLower) ?? findFuzzyGsc(kwLower, gscMap);
        seenKeywords.add(kwLower);
        suggestions.push({
          keyword: spKw,
          source: "cocoon",
          role: "support",
          cluster: cluster.name,
          phase: null,
          priority: "moyenne",
          reason: `Page support du cluster "${cluster.name}"`,
          score: computeScore({ source: "cocoon", role: "support", priority: "moyenne", gsc }),
          gsc,
        });
      }
    }

    // ── 3. GSC-only opportunities (not in roadmap/cocoon but ranking) ────
    for (const q of gscQueries) {
      const kwLower = q.query.toLowerCase();
      if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;
      // Only include keywords with real potential (impressions > 20 OR position < 30)
      if (q.impressions < 20 && q.position > 30) continue;

      seenKeywords.add(kwLower);
      const gsc: GscMetrics = { position: q.position, impressions: q.impressions, clicks: q.clicks, ctr: q.ctr };
      const priority: "haute" | "moyenne" | "faible" =
        q.position <= 20 && q.impressions >= 50 ? "haute"
        : q.position <= 40 || q.impressions >= 30 ? "moyenne"
        : "faible";

      suggestions.push({
        keyword: q.query,
        source: "gsc",
        role: "opportunity",
        cluster: null,
        phase: null,
        priority,
        reason: `GSC : pos ${q.position}, ${q.impressions} imp/mois`,
        score: computeScore({ source: "gsc", role: "opportunity", priority, gsc }),
        gsc,
      });
    }

    // ── 4. Site keywords (fallback) ──────────────────────────────────────
    for (const kw of siteKeywords) {
      const kwLower = kw.toLowerCase();
      if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;

      const gsc = gscMap.get(kwLower) ?? findFuzzyGsc(kwLower, gscMap);
      seenKeywords.add(kwLower);
      suggestions.push({
        keyword: kw,
        source: "settings",
        role: "unknown",
        cluster: null,
        phase: null,
        priority: "faible",
        reason: "Mot-clé configuré",
        score: computeScore({ source: "settings", role: "unknown", priority: "faible", gsc }),
        gsc,
      });
    }

    // ── Sort by score DESC ──────────────────────────────────────────────
    suggestions.sort((a, b) => b.score - a.score);

    return Response.json({
      suggestions,
      stats: {
        total: suggestions.length,
        from_roadmap: suggestions.filter(s => s.source === "roadmap").length,
        from_cocoon: suggestions.filter(s => s.source === "cocoon").length,
        from_gsc: suggestions.filter(s => s.source === "gsc").length,
        from_settings: suggestions.filter(s => s.source === "settings").length,
        already_published: publishedKeywords.size,
        has_gsc: gscQueries.length > 0,
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

// ── Scoring ────────────────────────────────────────────────────────────────

function computeScore(params: {
  source: string;
  role: string;
  priority: "haute" | "moyenne" | "faible";
  gsc: GscMetrics | null;
}): number {
  let score = 0;

  // Source weight (max 25)
  const sourceWeights: Record<string, number> = { roadmap: 25, cocoon: 20, gsc: 15, settings: 5 };
  score += sourceWeights[params.source] ?? 0;

  // Role weight (max 15)
  const roleWeights: Record<string, number> = { pillar: 15, support: 8, opportunity: 10, unknown: 0 };
  score += roleWeights[params.role] ?? 0;

  // Priority weight (max 20)
  const priWeights: Record<string, number> = { haute: 20, moyenne: 12, faible: 4 };
  score += priWeights[params.priority] ?? 0;

  // GSC opportunity bonus (max 40)
  if (params.gsc) {
    const g = params.gsc;
    // Position score: closer to 1 = better (pages 11-20 = sweet spot for quick wins)
    if (g.position <= 10) score += 15; // already top 10 — maintain
    else if (g.position <= 20) score += 25; // striking distance — huge opportunity
    else if (g.position <= 30) score += 18; // reachable with good content
    else if (g.position <= 50) score += 10; // possible with effort

    // Impressions score: more impressions = more potential traffic
    if (g.impressions >= 500) score += 15;
    else if (g.impressions >= 100) score += 10;
    else if (g.impressions >= 30) score += 5;
  }

  return Math.min(100, score);
}

// ── Fuzzy GSC match ────────────────────────────────────────────────────────

function findFuzzyGsc(keyword: string, gscMap: Map<string, GscMetrics>): GscMetrics | null {
  // Try to find a GSC query that contains the keyword or vice versa
  const words = keyword.split(/\s+/).filter(w => w.length > 3);
  if (words.length === 0) return null;

  let bestMatch: GscMetrics | null = null;
  let bestScore = 0;

  for (const [query, metrics] of gscMap) {
    // Count how many keyword words appear in the GSC query
    const matchCount = words.filter(w => query.includes(w)).length;
    const matchRatio = matchCount / words.length;

    if (matchRatio >= 0.6 && matchCount > bestScore) {
      bestMatch = metrics;
      bestScore = matchCount;
    }
  }

  return bestMatch;
}
