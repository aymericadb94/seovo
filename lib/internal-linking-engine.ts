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

type ExistingPage = {
  title: string;
  url: string;
  keyword: string;
  cluster: string | null;
  summary: string;
};

type CocoonCluster = {
  name: string;
  pillar: { title: string; keyword: string; url?: string };
  pages?: { keyword: string; role?: string }[];
  support_pages?: { title: string; keyword: string; url?: string }[];
};

export type LinkingResult = {
  outgoing: { content: string; links_added: number };
  retroactive: { updated_pages: { title: string; url: string; links_added: number }[]; errors: string[] };
};

// ── Outgoing: links FROM new article TO existing pages ─────────────────────

/**
 * Insère 2-4 liens internes FROM le nouvel article TO les pages existantes.
 *
 * Utilise le contexte cocoon (cluster, pilier) pour prioriser :
 * 1. Pages du même cluster
 * 2. Forte pertinence sémantique
 * 3. Liens naturels et non forcés
 */
export async function addOutgoingLinks(
  content: string,
  keyword: string,
  title: string,
  publications: Publication[],
  language: string = "fr",
  cocoonData?: { clusters?: CocoonCluster[] } | null,
): Promise<{ content: string; links_added: number }> {
  // Build target pages with cluster info and summaries
  const targets: ExistingPage[] = publications
    .filter(p => p.wordpress_url && p.keyword?.toLowerCase() !== keyword.toLowerCase())
    .map(p => {
      // Find cluster for this page
      let cluster: string | null = null;
      if (cocoonData?.clusters) {
        for (const c of cocoonData.clusters) {
          const allKws = [
            c.pillar?.keyword,
            ...(c.support_pages?.map(sp => sp.keyword) ?? []),
            ...(c.pages?.map(pg => pg.keyword) ?? []),
          ].filter(Boolean);
          if (allKws.some(k => k?.toLowerCase() === p.keyword?.toLowerCase())) {
            cluster = c.name;
            break;
          }
        }
      }
      return {
        title: p.title,
        url: p.wordpress_url!,
        keyword: p.keyword,
        cluster,
        summary: `Article sur "${p.keyword}"`,
      };
    });

  if (targets.length === 0) {
    return { content, links_added: 0 };
  }

  // Find current page's cluster
  let currentCluster: string | null = null;
  let currentPageType = "support";
  let pillarPage: ExistingPage | null = null;

  if (cocoonData?.clusters) {
    for (const c of cocoonData.clusters) {
      const isPillar = c.pillar?.keyword?.toLowerCase() === keyword.toLowerCase();
      const allKws = [
        c.pillar?.keyword,
        ...(c.support_pages?.map(sp => sp.keyword) ?? []),
        ...(c.pages?.map(pg => pg.keyword) ?? []),
      ].filter(Boolean);

      if (isPillar || allKws.some(k => k?.toLowerCase() === keyword.toLowerCase())) {
        currentCluster = c.name;
        currentPageType = isPillar ? "pillar" : "support";
        // Find pillar as target
        if (!isPillar) {
          pillarPage = targets.find(t => t.keyword?.toLowerCase() === c.pillar?.keyword?.toLowerCase()) ?? null;
        }
        break;
      }
    }
  }

  // Sort targets: same cluster first, then by relevance
  const sortedTargets = [...targets].sort((a, b) => {
    const aCluster = a.cluster === currentCluster ? 1 : 0;
    const bCluster = b.cluster === currentCluster ? 1 : 0;
    return bCluster - aCluster;
  });

  // Build existing pages list for the prompt
  const pagesForPrompt = sortedTargets.slice(0, 15).map((p, i) => ({
    title: p.title,
    url: p.url,
    summary: p.summary,
    cluster: p.cluster ?? "non classé",
  }));

  try {
    const aiResult = await aiCall(
      { task: "cron_outgoing_linking" },
      {
        messages: [{
          role: "user",
          content: `Tu es un expert SEO senior spécialisé en maillage interne intelligent.

Ta mission : créer un maillage interne RÉEL et CONNECTÉ pour cette page.

LANGUE : ${language}

PAGE EN COURS DE GÉNÉRATION :
{
  "title": "${title}",
  "keyword": "${keyword}",
  "cluster": ${currentCluster ? `"${currentCluster}"` : "null"},
  "page_type": "${currentPageType}"
}

PAGES EXISTANTES SUR LE SITE :
${JSON.stringify(pagesForPrompt, null, 2)}

${pillarPage ? `⚠️ LIEN OBLIGATOIRE : cette page est un support du cluster "${currentCluster}". Un lien vers le pilier "${pillarPage.title}" (${pillarPage.url}) est REQUIS.` : ""}

RÈGLES STRICTES :
- Sélectionner 2 à 4 pages maximum
- Prioriser : même cluster > forte pertinence sémantique > complémentarité
- Éviter les pages non pertinentes (clusters sans rapport)
- Éviter le spam de liens

POUR CHAQUE LIEN :
- Ancre naturelle de 2-5 mots intégrée dans une phrase EXISTANTE
- Jamais le mot-clé exact de la page cible
- Max 1 lien par paragraphe
- Pas de lien dans l'intro (premier <p>) ni la conclusion (dernier <p>)
- Format HTML : <a href="URL">ancre</a>

INTERDIT :
- Forcer des liens là où c'est artificiel
- Créer des ancres type "cliquez ici" ou "en savoir plus"
- Sur-optimiser (pas d'ancres bourrées de mots-clés)
- Ajouter du texte qui n'existe pas dans l'original
- Modifier la structure HTML (H2, H3, listes intacts)

CONTENU HTML :
${content.slice(0, 10000)}

FORMAT DE SORTIE : JSON uniquement.
{
  "updated_content": "Le HTML complet avec les liens <a> insérés naturellement",
  "links_added": [
    {
      "target_url": "URL exacte de la page cible",
      "anchor": "texte d'ancre utilisé",
      "placement_instruction": "section et phrase où le lien est inséré"
    }
  ]
}`
        }],
      }
    );

    const parsed = parseAiJson<{
      updated_content: string;
      links_added: { target_url: string; anchor: string; placement_instruction: string }[];
    }>(aiResult.text);

    if (parsed?.updated_content) {
      // Validation : extraire toutes les URLs <a href="..."> du HTML retourné
      // et vérifier qu'elles font partie des pages connues
      const knownUrls = new Set(targets.map(t => t.url.replace(/\/$/, "").toLowerCase()));
      let validatedContent = parsed.updated_content;
      let validLinksCount = 0;

      // Trouver tous les liens ajoutés et supprimer ceux avec des URLs inconnues
      const linkRegex = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      validatedContent = validatedContent.replace(linkRegex, (match, href, anchor) => {
        const normalized = href.replace(/\/$/, "").toLowerCase();
        if (knownUrls.has(normalized)) {
          validLinksCount++;
          return match; // garder le lien
        }
        // URL inconnue/hallucinée → garder seulement le texte d'ancre
        logger.warn(`Outgoing link removed: hallucinated URL "${href}"`, { context: "linking-engine" });
        return anchor;
      });

      return { content: validatedContent, links_added: validLinksCount };
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
