/**
 * Internal Linking Engine
 *
 * Shared functions for internal linking, usable by both API routes and cron.
 * Two operations:
 * 1. Outgoing: Insert links FROM the new article TO existing pages
 * 2. Retroactive: Insert links FROM existing articles TO the new page
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { listCmsPosts, updateCmsPost, injectLinks, type CmsCredentials, type LinkInjection } from "@/lib/cms-update";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

type Publication = { title: string; keyword: string; wordpress_url: string | null };

export type LinkingResult = {
  outgoing: { content: string; links_added: number };
  retroactive: { updated_pages: { title: string; url: string; links_added: number }[]; errors: string[] };
};

// ── Outgoing: links FROM new article TO existing pages ─────────────────────

export async function addOutgoingLinks(
  content: string,
  keyword: string,
  title: string,
  publications: Publication[],
  language: string = "fr"
): Promise<{ content: string; links_added: number }> {
  // Build target pages (published with URLs, not the current article)
  const targets = publications
    .filter(p => p.wordpress_url && p.keyword?.toLowerCase() !== keyword.toLowerCase())
    .map(p => ({ title: p.title, keyword: p.keyword, url: p.wordpress_url! }));

  if (targets.length === 0) {
    return { content, links_added: 0 };
  }

  try {
    const aiResult = await aiCall(
      { task: "cron_outgoing_linking" },
      {
        messages: [{
          role: "user",
          content: `Tu es un expert SEO. Insère 2-4 liens internes naturels dans cet article.

ARTICLE : "${title}" (mot-clé : "${keyword}")
LANGUE : ${language}

PAGES CIBLES DISPONIBLES :
${targets.slice(0, 15).map((p, i) => `${i + 1}. "${p.title}" (${p.keyword}) → ${p.url}`).join("\n")}

CONTENU HTML :
${content.slice(0, 10000)}

RÈGLES :
- Insère les liens DANS des phrases existantes (pas de phrases ajoutées)
- Ancres naturelles de 2-5 mots, jamais le mot-clé exact de la cible
- Max 1 lien par paragraphe
- Pas de lien dans l'intro ou la conclusion
- URLs RÉELLES de la liste uniquement

FORMAT JSON :
{
  "updated_content": "Le HTML avec les liens <a href='url' title='titre'>ancre</a> insérés",
  "links_count": 3
}`
        }],
      }
    );

    const parsed = parseAiJson<{ updated_content: string; links_count: number }>(aiResult.text);
    if (parsed?.updated_content) {
      return { content: parsed.updated_content, links_added: parsed.links_count ?? 0 };
    }
  } catch (err) {
    logger.warn("Outgoing linking failed", { context: "linking-engine", error: err });
  }

  return { content, links_added: 0 };
}

// ── Retroactive: links FROM existing articles TO the new page ──────────────

export async function addRetroactiveLinks(
  supabase: SupabaseClient,
  userId: string,
  creds: CmsCredentials,
  newPage: { keyword: string; title: string; url: string }
): Promise<{ updated_pages: { title: string; url: string; links_added: number }[]; errors: string[] }> {
  const result: { updated_pages: { title: string; url: string; links_added: number }[]; errors: string[] } = {
    updated_pages: [],
    errors: [],
  };

  try {
    const cmsPosts = await listCmsPosts(creds, 50);
    if (cmsPosts.length === 0) return result;

    // Filter out the new page itself and pages already linking to it
    const normalizedNewUrl = newPage.url.replace(/\/$/, "").toLowerCase();
    const candidates = cmsPosts.filter(p => {
      const postUrl = p.url.replace(/\/$/, "").toLowerCase();
      if (postUrl === normalizedNewUrl) return false;
      if (p.content.toLowerCase().includes(normalizedNewUrl)) return false;
      return true;
    });

    if (candidates.length === 0) return result;

    // AI selects best candidates
    const summaries = candidates.slice(0, 20).map((p, i) =>
      `${i + 1}. [ID:${p.id}] "${p.title}" — ${p.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)}`
    ).join("\n");

    const aiResult = await aiCall(
      { task: "retroactive_linking" },
      {
        messages: [{
          role: "user",
          content: `Expert SEO : trouve 2-4 articles existants où insérer un lien vers une nouvelle page.

NOUVELLE PAGE : "${newPage.title}" (${newPage.keyword}) → ${newPage.url}

ARTICLES EXISTANTS :
${summaries}

RÈGLES : ancre de 2-5 mots, pas le mot-clé exact, thématiquement proche.

FORMAT JSON : [{"post_id": "ID", "anchor": "texte ancre", "reason": "1 phrase"}]
Si aucun pertinent, retourne [].`
        }],
      }
    );

    const suggestions = parseAiJson<{ post_id: string; anchor: string }[]>(aiResult.text);
    if (!suggestions?.length) return result;

    for (const s of suggestions.slice(0, 4)) {
      const post = candidates.find(p => String(p.id) === String(s.post_id));
      if (!post) continue;

      const injection: LinkInjection = { anchor: s.anchor, target_url: newPage.url, target_title: newPage.title };
      const { html: updatedHtml, injected } = injectLinks(post.content, [injection], post.url, 1);

      if (injected === 0) continue;

      const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
      const updateRes = await updateCmsPost(
        creds,
        post.id,
        { content: updatedHtml },
        { blog_id: blogId, supabase, userId, actionType: "retroactive_linking" }
      );

      if (updateRes.success) {
        result.updated_pages.push({ title: post.title, url: post.url, links_added: injected });
      } else {
        result.errors.push(`${post.title}: ${updateRes.error}`);
      }
    }
  } catch (err) {
    logger.warn("Retroactive linking failed", { context: "linking-engine", error: err });
    result.errors.push(err instanceof Error ? err.message : "Erreur inconnue");
  }

  return result;
}
