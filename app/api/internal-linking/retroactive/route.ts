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
      .select("id, site_url, cms, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
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

    // Fetch all CMS posts
    const cmsPosts = await listCmsPosts(creds, 50);
    if (cmsPosts.length === 0) {
      return Response.json({ result: { updated_pages: [], skipped: 0, errors: ["Aucun article CMS trouvé"] } });
    }

    // Filter: only articles that DON'T already link to the new page
    const normalizedNewUrl = url.replace(/\/$/, "").toLowerCase();
    const candidates = cmsPosts.filter(p => {
      const postUrl = p.url.replace(/\/$/, "").toLowerCase();
      if (postUrl === normalizedNewUrl) return false; // Skip the new page itself
      if (p.content.toLowerCase().includes(normalizedNewUrl)) return false; // Already links to it
      return true;
    });

    if (candidates.length === 0) {
      return Response.json({ result: { updated_pages: [], skipped: cmsPosts.length, errors: [] } });
    }

    // Ask AI to find the best articles + anchor texts for retroactive links
    const candidateSummaries = candidates.slice(0, 20).map((p, i) =>
      `${i + 1}. [ID:${p.id}] "${p.title}" — ${p.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`
    ).join("\n");

    const aiResult = await aiCall(
      { task: "retroactive_linking" },
      {
        messages: [{
          role: "user",
          content: `Tu es un expert SEO senior spécialisé en maillage interne.

MISSION : Trouver dans quels articles existants il serait naturel et stratégique d'insérer un lien vers une NOUVELLE page publiée.

NOUVELLE PAGE :
- Titre : "${title}"
- Mot-clé : "${keyword}"
- URL : ${url}

ARTICLES EXISTANTS (candidats) :
${candidateSummaries}

RÈGLES :
1. Sélectionne 2-5 articles maximum parmi les candidats.
2. Ne sélectionne que ceux où le sujet de la nouvelle page est naturellement mentionné ou pertinent.
3. Pour chaque article sélectionné, propose une ancre de 2-5 mots qui existe DÉJÀ dans le texte de l'article ou qui pourrait s'y intégrer naturellement.
4. L'ancre ne doit PAS être le mot-clé exact de la nouvelle page (risque de sur-optimisation).
5. Priorise les articles thématiquement proches.

FORMAT JSON uniquement :
[
  {
    "post_id": "L'ID de l'article (le nombre après ID:)",
    "anchor": "Le texte d'ancre à utiliser (2-5 mots)",
    "reason": "Pourquoi ce lien est pertinent (1 phrase)"
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

    for (const suggestion of suggestions.slice(0, 5)) {
      const post = candidates.find(p => String(p.id) === String(suggestion.post_id));
      if (!post) {
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
