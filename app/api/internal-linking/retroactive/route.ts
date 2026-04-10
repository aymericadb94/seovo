/**
 * Retroactive Internal Linking API
 *
 * After a new page is published, scans existing CMS articles and injects
 * links pointing TO the new page where contextually relevant.
 *
 * Uses AI to find natural insertion points, then cms-update to apply changes.
 * Safety: snapshots are saved before any modification.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { listCmsPosts, updateCmsPost, injectLinks, type CmsCredentials, type LinkInjection } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { getValidAccessToken } from "@/lib/google";
import { fetchGscData, type GscPageRow } from "@/lib/seo-events";
import { assessRisk, getModificationHistory } from "@/lib/seo-risk";

export const maxDuration = 120;

type RetroactiveResult = {
  updated_pages: { title: string; url: string; links_added: number }[];
  skipped: number;
  errors: string[];
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "retroactive-linking", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const { keyword, title, url } = await request.json() as {
      keyword: string;
      title: string;
      url: string;
    };

    if (!keyword?.trim() || !url?.trim()) {
      return Response.json({ error: "keyword et url requis" }, { status: 400 });
    }

    // Fetch site config
    const { data: site } = await supabase
      .from("sites")
      .select("id, site_url, cms, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key, gsc_site_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const creds: CmsCredentials = {
      cms: site.cms,
      site_url: site.site_url,
      wp_username: site.wp_username,
      wp_app_password: site.wp_app_password,
      shopify_api_key: site.shopify_api_key,
      shopify_store_url: site.shopify_store_url,
      wix_api_key: site.wix_api_key,
      wix_site_id: site.wix_site_id,
      custom_api_url: site.custom_api_url,
      custom_api_key: site.custom_api_key,
    };

    // Fetch all CMS posts (increased limit for larger sites)
    const cmsPosts = await listCmsPosts(creds, 200);
    if (cmsPosts.length === 0) {
      return Response.json({ result: { updated_pages: [], skipped: 0, errors: ["Aucun article CMS trouvé"] } });
    }

    // Fetch GSC page authority data if available
    let gscPages: GscPageRow[] = [];
    if (site.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const gsc = await fetchGscData(token, site.gsc_site_url, 30);
          if (gsc) gscPages = gsc.pages;
        }
      } catch { /* non-fatal — works without GSC */ }
    }

    // Build authority map: normalized URL → GSC metrics
    const authorityMap = new Map<string, GscPageRow>();
    for (const p of gscPages) {
      authorityMap.set(p.url.replace(/\/$/, "").toLowerCase(), p);
    }

    // Fetch cocoon for cluster context
    const { data: cocoonRow } = await supabase
      .from("semantic_cocoons")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    type CocoonCluster = { name: string; pillar: { keyword: string }; support_pages?: { keyword: string }[]; pages?: { keyword: string }[] };
    const cocoonData = cocoonRow?.data as { clusters?: CocoonCluster[] } | null;

    // Fetch publications for keyword metadata
    const { data: pubs } = await supabase
      .from("publications")
      .select("keyword, wordpress_url")
      .eq("user_id", user.id);
    const pubByUrl = new Map<string, string>();
    for (const pub of pubs ?? []) {
      if (pub.wordpress_url) {
        pubByUrl.set(pub.wordpress_url.replace(/\/$/, "").toLowerCase(), pub.keyword);
      }
    }

    // Find the cluster of the new page
    let newPageCluster: string | null = null;
    if (cocoonData?.clusters) {
      for (const c of cocoonData.clusters) {
        const allKws = [c.pillar?.keyword, ...(c.support_pages?.map(sp => sp.keyword) ?? []), ...(c.pages?.map(pg => pg.keyword) ?? [])].filter(Boolean);
        if (allKws.some(k => k?.toLowerCase() === keyword.toLowerCase())) {
          newPageCluster = c.name;
          break;
        }
      }
    }

    // Filter: only articles that DON'T already link to the new page
    const normalizedNewUrl = url.replace(/\/$/, "").toLowerCase();
    const candidates = cmsPosts.filter(p => {
      const postUrl = p.url.replace(/\/$/, "").toLowerCase();
      if (postUrl === normalizedNewUrl) return false;
      if (p.content.toLowerCase().includes(normalizedNewUrl)) return false;
      return true;
    });

    if (candidates.length === 0) {
      return Response.json({ result: { updated_pages: [], skipped: cmsPosts.length, errors: [] } });
    }

    // Build candidate summaries with cluster info
    const candidateSummaries = candidates.slice(0, 40).map((p, i) => {
      let cluster = "non classé";
      if (cocoonData?.clusters) {
        for (const c of cocoonData.clusters) {
          const allKws = [c.pillar?.keyword, ...(c.support_pages?.map(sp => sp.keyword) ?? []), ...(c.pages?.map(pg => pg.keyword) ?? [])].filter(Boolean);
          const postText = p.title.toLowerCase();
          if (allKws.some(k => postText.includes(k?.toLowerCase() ?? ""))) {
            cluster = c.name;
            break;
          }
        }
      }
      const summary = p.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
      const gscInfo = authorityMap.get(p.url.replace(/\/$/, "").toLowerCase());
      const authority = gscInfo
        ? ` | GSC: ${gscInfo.clicks} clics, ${gscInfo.impressions} impressions, pos ${gscInfo.position}`
        : "";
      const pubKeyword = pubByUrl.get(p.url.replace(/\/$/, "").toLowerCase());
      const kwInfo = pubKeyword ? ` | mot-clé: "${pubKeyword}"` : "";
      return `${i + 1}. [ID:${p.id}] "${p.title}" (cluster: ${cluster}${kwInfo}${authority}) — ${summary}`;
    }).join("\n");

    const aiResult = await aiCall(
      { task: "retroactive_linking" },
      {
        messages: [{
          role: "user",
          content: `Tu es un expert SEO spécialisé en optimisation de maillage interne.

MISSION : Améliorer le maillage du site en trouvant les meilleurs articles existants où insérer un lien vers une NOUVELLE page publiée.

NOUVELLE PAGE :
- Titre : "${title}"
- Mot-clé : "${keyword}"
- URL : ${url}
- Cluster : ${newPageCluster ?? "non classé"}

ARTICLES EXISTANTS (candidats) :
${candidateSummaries}

OBJECTIF :
- Chaque page doit recevoir au moins 2 liens entrants
- Prioriser le même cluster (${newPageCluster ?? "non classé"})
- Créer des connexions logiques et sémantiquement pertinentes
${gscPages.length > 0 ? "- PRIORISER les articles avec une forte autorité GSC (beaucoup de clics/impressions, bonne position) comme sources de liens — un lien depuis une page à forte autorité transmet plus de \"jus SEO\"" : ""}

RÈGLES STRICTES :
1. Sélectionner 2-4 articles maximum (pas de spam).
2. PRIORISER : ${gscPages.length > 0 ? "forte autorité GSC >" : ""} même cluster > forte pertinence sémantique > complémentarité thématique.
3. Ancre de 2-5 mots, naturelle, qui existe dans le texte ou s'y intègre fluidement.
4. L'ancre ne doit PAS être le mot-clé exact "${keyword}" (risque de sur-optimisation).
5. NE PAS sélectionner d'articles sans rapport sémantique, même s'ils sont dans le même cluster.

INTERDIT :
- Forcer des liens dans des articles non pertinents
- Créer des ancres artificielles type "cliquez ici"
- Sélectionner plus de 4 articles

FORMAT JSON uniquement :
[
  {
    "post_id": "L'ID de l'article (le nombre après ID:)",
    "anchor": "Le texte d'ancre à utiliser (2-5 mots)",
    "reason": "pertinence sémantique — 1 phrase"
  }
]

Si aucun article n'est pertinent, retourne [].`
        }],
      }
    );

    const suggestions = parseAiJson<{ post_id: string; anchor: string; reason: string }[]>(aiResult.text);
    if (!suggestions || suggestions.length === 0) {
      return Response.json({ result: { updated_pages: [], skipped: candidates.length, errors: [] } });
    }

    // Apply links to CMS
    const result: RetroactiveResult = { updated_pages: [], skipped: 0, errors: [] };

    for (const suggestion of suggestions.slice(0, 8)) {
      const post = candidates.find(p => String(p.id) === String(suggestion.post_id));
      if (!post) {
        result.skipped++;
        continue;
      }

      // Risk assessment: skip if modifying this page is too risky
      const gscInfo = authorityMap.get(post.url.replace(/\/$/, "").toLowerCase());
      const history = await getModificationHistory(supabase, user.id, post.url);
      const riskResult = assessRisk({
        action_type: "add_internal_links",
        target_url: post.url,
        target_title: post.title,
        keyword: keyword,
        position: gscInfo?.position ?? null,
        impressions: gscInfo?.impressions ?? 0,
        clicks: gscInfo?.clicks ?? 0,
        ctr: gscInfo?.ctr ?? 0,
        is_homepage: false,
        is_pillar: false,
        content_length: post.content.replace(/<[^>]+>/g, " ").split(/\s+/).length,
        existing_internal_links: (post.content.match(/<a\s/gi) ?? []).length,
        links_to_add: 1,
      }, history);

      if (riskResult.risk_score >= 70) {
        logger.warn("Retroactive link skipped (high risk)", { context: "retroactive-linking", userId: user.id, error: new Error(`Risk ${riskResult.risk_score} for ${post.url}`) });
        result.skipped++;
        continue;
      }

      const injection: LinkInjection = {
        anchor: suggestion.anchor,
        target_url: url,
        target_title: title,
      };

      const { html: updatedHtml, injected } = injectLinks(post.content, [injection], post.url, 1);

      if (injected === 0) {
        result.skipped++;
        continue;
      }

      // Update CMS with snapshot
      const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
      const updateResult = await updateCmsPost(
        creds,
        post.id,
        { content: updatedHtml },
        { blog_id: blogId, supabase, userId: user.id, actionType: "retroactive_linking" }
      );

      if (updateResult.success) {
        result.updated_pages.push({
          title: post.title,
          url: post.url,
          links_added: injected,
        });
      } else {
        result.errors.push(`${post.title}: ${updateResult.error}`);
        logger.warn("Retroactive link injection failed", { context: "retroactive-linking", userId: user.id, error: new Error(updateResult.error ?? "unknown") });
      }
    }

    return Response.json({ result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
