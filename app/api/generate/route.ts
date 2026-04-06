import { createClient } from "@/lib/supabase/server";
import { aiCall, aiCallStream, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

async function extractStyleGuide(samples: string[]): Promise<string> {
  try {
    const result = await aiCall(
      { task: "style_extraction" },
      {
        messages: [{
          role: "user",
          content: `Analyze these blog article excerpts and extract the editorial style guide in 6-8 concise bullet points. Cover: tone (formal/casual/friendly), use of "vous" or "tu", sentence length and rhythm, introduction style, how H2/H3 titles are phrased, use of lists vs paragraphs, vocabulary register, and any recurring stylistic patterns.

${samples.join("\n\n---\n\n")}

Respond ONLY with bullet points, no intro or conclusion:
- [style observation]`,
        }],
      }
    );
    return result.text.trim();
  } catch {
    return "";
  }
}

async function fetchStyleGuideWordPress(siteUrl: string, username: string, appPassword: string): Promise<string> {
  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=5&_fields=title,content`, {
      headers: { Authorization: `Basic ${credentials}`, "ngrok-skip-browser-warning": "true" },
    });
    if (!res.ok) return "";
    const posts = await res.json() as { title: { rendered: string }; content: { rendered: string } }[];
    const samples = posts.slice(0, 3).map((p, i) => {
      const excerpt = p.content.rendered.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      return `Article ${i + 1} — "${p.title.rendered}":\n${excerpt}`;
    });
    return samples.length > 0 ? await extractStyleGuide(samples) : "";
  } catch {
    return "";
  }
}

async function fetchStyleGuideShopify(storeUrl: string, apiKey: string): Promise<string> {
  try {
    const baseUrl = storeUrl.replace(/\/$/, "");
    const headers = { "X-Shopify-Access-Token": apiKey };

    const blogsRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, { headers });
    if (!blogsRes.ok) return "";
    const blogsData = await blogsRes.json() as { blogs: { id: number }[] };
    if (!blogsData.blogs?.length) return "";

    const blogId = blogsData.blogs[0].id;
    const articlesRes = await fetch(
      `${baseUrl}/admin/api/2024-01/blogs/${blogId}/articles.json?limit=5&fields=title,body_html`,
      { headers }
    );
    if (!articlesRes.ok) return "";
    const articlesData = await articlesRes.json() as { articles: { title: string; body_html: string }[] };
    const articles = articlesData.articles ?? [];

    const samples = articles.slice(0, 3).map((a, i) => {
      const excerpt = a.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      return `Article ${i + 1} — "${a.title}":\n${excerpt}`;
    });
    return samples.length > 0 ? await extractStyleGuide(samples) : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "generate", maxRequests: 10, windowSeconds: 600 });
    if (limited) return limited;

    const { keyword, businessName, industry, allKeywords, language = "fr", cocoon_position } = await request.json();

    // Récupérer les credentials WP pour analyser la DA du site
    let styleGuide = "";
    try {
      const { data: site } = await supabase
        .from("sites")
        .select("cms, site_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (site?.cms === "wordpress" && site.wp_username && site.wp_app_password) {
        styleGuide = await fetchStyleGuideWordPress(site.site_url, site.wp_username, site.wp_app_password);
      } else if (site?.cms === "shopify" && site.shopify_api_key) {
        styleGuide = await fetchStyleGuideShopify(site.site_url, site.shopify_api_key);
      }
      // Wix : DA non disponible via API publique, on génère sans style guide
    } catch {
      // DA optionnelle, on continue sans
    }

    const otherKeywords = (allKeywords ?? []).filter((k: string) => k !== keyword).slice(0, 5);
    const internalLinksContext = otherKeywords.length > 0
      ? `\n\nSecondary keywords to mention naturally for internal linking: ${otherKeywords.join(", ")}`
      : "";
    const styleGuideContext = styleGuide
      ? `\n\nDIRECTION ARTISTIQUE — REPRODUCE THIS STYLE EXACTLY (extracted from the site's existing articles):\n${styleGuide}`
      : "";

    // Build cocoon positioning context for intelligent linking
    type LinkEntry = { target: string; source?: string; anchor: string; reason: string };
    type CocoonPos = { page_type: string; seo_role: string; linking_strategy: { outgoing: LinkEntry[]; incoming: LinkEntry[] }; pillar_relation: string };
    const cocoonPos = cocoon_position as CocoonPos | undefined;
    const cocoonContext = cocoonPos
      ? `\n\nPOSITIONNEMENT COCON SÉMANTIQUE :
Type de page : ${cocoonPos.page_type}
Rôle SEO : ${cocoonPos.seo_role}
Relation pilier : ${cocoonPos.pillar_relation}
Liens sortants obligatoires :
${cocoonPos.linking_strategy.outgoing.map((l: LinkEntry) => `- Vers "${l.target}" avec ancre "${l.anchor}" (${l.reason})`).join("\n")}
Liens entrants recommandés :
${cocoonPos.linking_strategy.incoming.map((l: LinkEntry) => `- Depuis "${l.source}" avec ancre "${l.anchor}" (${l.reason})`).join("\n")}

IMPORTANT : Intègre les liens sortants ci-dessus naturellement dans le contenu. Utilise les ancres recommandées de manière fluide dans le texte.`
      : "";

    const systemPrompt = `Tu es un expert senior en référencement SEO (10+ ans d'expérience), spécialisé dans la création de contenus SEO à forte valeur, le maillage interne intelligent, l'optimisation sémantique naturelle et la rédaction web orientée performance Google. Chaque article que tu produis est unique, créatif et génère du trafic organique réel. Tu n'écris jamais de contenu générique ou répétitif. Tu écris toujours dans la langue spécifiée — c'est non négociable.`;

    const userPrompt = `Tu es un expert SEO senior spécialisé dans le secteur "${industry ?? "e-commerce"}". Tu travailles pour "${businessName}".

LANGUE : Rédige l'INTÉGRALITÉ de l'article en ${language}. Chaque mot doit être en ${language}.

MOT-CLÉ PRINCIPAL : "${keyword}"${internalLinksContext}${styleGuideContext}${cocoonContext}

---

MISSION : Générer un article de blog parfaitement optimisé pour le SEO.

---

PARTIE 1 — STRUCTURE SEO
- 1 H1 avec le mot-clé intégré naturellement
- Plusieurs H2 / H3 logiques et hiérarchisés
- Paragraphes aérés, structure fluide
- Aucune répétition abusive de mots-clés

PARTIE 2 — INTRODUCTION (150-200 mots)
- Accroche naturelle et percutante
- Reformulation du besoin utilisateur
- Annonce claire du contenu

PARTIE 3 — FEATURED SNIPPET (OBLIGATOIRE — généré dans le champ "featured_snippet" ET intégré au début du contenu)
- Répond directement à la requête en 2 à 4 lignes OU sous forme de liste
- Format : H2 avec le mot-clé sous forme de question, suivi d'un <p> de 40-60 mots
- Si guide/tutoriel : ajouter un <ol> avec 4-8 étapes concises
- Si comparatif : ajouter un <table> avec 2-4 colonnes et 3-6 lignes
- Si définition : commencer par "[Mot-clé] est..."

PARTIE 4 — CONTENU PRINCIPAL (1200-1800 mots)
- 4 à 6 sections H2 bien structurées avec H3 si nécessaire
- Paragraphes courts (3-4 lignes max)
- Exemples concrets liés au secteur "${industry ?? "e-commerce"}"
- Chiffres et statistiques pour la crédibilité
- Listes à puces pour la lisibilité
- Ton : expert mais accessible, jamais robotique
- Densité mot-clé : naturelle, 1-2% maximum

PARTIE 5 — FAQ (3-4 questions)
- Questions réellement posées par l'audience cible
- Chaque réponse : 40-60 mots max (pouvant aussi être capturée comme featured snippet)

PARTIE 6 — CONCLUSION (100-150 mots)
- Résumé synthétique
- Call-to-action fort

PARTIE 7 — MAILLAGE INTERNE
Propose 2 à 4 liens internes avec ancrage naturel en lien avec la thématique.

PARTIE 8 — IMAGE
Génère une requête Pexels précise et cohérente avec le sujet (3-5 mots-clés en anglais).

PARTIE 9 — MÉTA DONNÉES
- title SEO : optimisé CTR, 50-60 caractères, contient le mot-clé
- meta_description : 150-160 caractères, incitative et naturelle

---

ANTI-SPAM / QUALITÉ (IMPÉRATIF) :
- Aucune sur-optimisation
- Aucun contenu générique
- Aucune répétition excessive
- Le contenu doit sembler écrit par un humain expert

---

FORMAT DE SORTIE : JSON valide uniquement, aucun texte avant ou après.

{
  "title": "Le H1 optimisé",
  "meta_description": "La meta description de 150-160 caractères",
  "featured_snippet": "Le bloc featured snippet en HTML pur (h2 + p, ou h2 + p + ol/table)",
  "content": "Le contenu HTML complet de l'article (sans le featured_snippet qui est déjà inclus au début)",
  "internal_links": [
    { "anchor": "texte d'ancrage naturel", "target": "slug-ou-url-cible" }
  ],
  "pexels_query": "3-5 english keywords for stock photo",
  "cover_alt_text": "Texte alt SEO de l'image, 8-12 mots, inclut le mot-clé, dans la langue de l'article"
}

HTML autorisé : <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>. Pas de <html>, <body>, <head>.`;

    const aiParams = {
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userPrompt }],
    };

    // ── Streaming mode (SSE) ──────────────────────────────────────────────
    const url = new URL(request.url);
    if (url.searchParams.get("stream") === "1") {
      const { stream } = aiCallStream({ task: "content_generation" }, aiParams);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Non-streaming mode (JSON) ─────────────────────────────────────────
    const aiResult = await aiCall({ task: "content_generation" }, aiParams);

    const parsed = parseAiJson<{
      title: string;
      content: string;
      meta_description: string;
      featured_snippet?: string;
      internal_links?: { anchor: string; target: string }[];
      pexels_query?: string;
      cover_alt_text?: string;
    }>(aiResult.text);

    if (!parsed) {
      return Response.json({ error: "Impossible de lire la réponse de Claude" }, { status: 500 });
    }
    return Response.json({
      title: parsed.title,
      content: parsed.featured_snippet
        ? parsed.featured_snippet + "\n" + parsed.content
        : parsed.content,
      meta_description: parsed.meta_description,
      cover_image_query: parsed.pexels_query ?? null,
      cover_alt_text: parsed.cover_alt_text ?? null,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
