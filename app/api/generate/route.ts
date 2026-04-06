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

    const { keyword, businessName, industry, allKeywords, language = "fr", cocoon_position, keyword_strategy, content_structure, featured_snippet, editorial_plan } = await request.json();

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

    // Build keyword strategy context
    type KwStrategy = { primary_keyword: string; secondary_keywords: string[]; semantic_field: string[]; seo_angle: string };
    const kwStrat = keyword_strategy as KwStrategy | undefined;
    const keywordContext = kwStrat
      ? `\n\nSTRATÉGIE DE MOTS-CLÉS (définie par l'analyse pré-rédaction) :
Mot-clé principal : "${kwStrat.primary_keyword}"
Mots-clés secondaires à intégrer naturellement : ${kwStrat.secondary_keywords.join(", ")}
Champ sémantique (termes à utiliser dans le texte) : ${kwStrat.semantic_field.join(", ")}
Angle SEO : ${kwStrat.seo_angle}

IMPORTANT : Intègre les mots-clés secondaires et le champ sémantique de manière naturelle et fluide. Densité mot-clé principal < 2%. Ne force jamais un terme.`
      : "";

    // Build content structure context
    type H2Entry = { title: string; h3: string[] };
    type StructureData = { h1: string; h2_structure: H2Entry[]; featured_snippet_section: { type: string; title: string } };
    const struct = content_structure as StructureData | undefined;
    const structureContext = struct
      ? `\n\nSTRUCTURE SEO IMPOSÉE (définie par l'analyse pré-rédaction) :
H1 : ${struct.h1}
${struct.h2_structure.map((h2: H2Entry) => `H2 : ${h2.title}\n${h2.h3.map((h3: string) => `  H3 : ${h3}`).join("\n")}`).join("\n")}
Featured snippet : section "${struct.featured_snippet_section.title}" (type: ${struct.featured_snippet_section.type})

IMPORTANT : Suis EXACTEMENT cette structure. Utilise ces titres H1/H2/H3 tels quels (tu peux ajuster légèrement la formulation si nécessaire pour la fluidité). La section featured snippet doit être optimisée pour la position 0.`
      : "";

    // Build featured snippet context
    type SnippetData = { snippet_type: string; snippet_text: string; structured_version: string[]; placement: string; integration_text: string };
    const snip = featured_snippet as SnippetData | undefined;
    const snippetContext = snip
      ? `\n\nFEATURED SNIPPET PRÉ-GÉNÉRÉ (à intégrer tel quel dans l'article) :
Type : ${snip.snippet_type}
Placement : ${snip.placement}
Titre d'introduction : ${snip.integration_text}
Texte du snippet : ${snip.snippet_text}
Version structurée :
${snip.structured_version.map((item: string, i: number) => `${snip.snippet_type === "steps" ? `${i + 1}.` : "-"} ${item}`).join("\n")}

IMPORTANT : Intègre ce featured snippet EXACTEMENT comme fourni. Place-le ${snip.placement === "top" ? "juste après le H1, avant l'introduction" : "après les 2 premiers paragraphes de l'introduction"}. Utilise le titre "${snip.integration_text}" comme H2 d'introduction du snippet. Ne régénère PAS le featured_snippet dans ta sortie JSON — utilise celui-ci.`
      : "";

    // Build editorial plan context
    type EditSection = { title: string; objective: string; content_points: string[]; examples: string[]; seo_notes: string; importance: string };
    type EditPlan = { sections: EditSection[]; content_flow: string; differentiation_points: string[]; global_strategy: string };
    const editPlan = editorial_plan as EditPlan | undefined;
    const editorialContext = editPlan
      ? `\n\nPLAN ÉDITORIAL DÉTAILLÉ (suis ce plan pour chaque section) :
Stratégie globale : ${editPlan.global_strategy}
Progression : ${editPlan.content_flow}
Points différenciants à intégrer : ${editPlan.differentiation_points.join(" | ")}

${editPlan.sections.map((s: EditSection) => `--- ${s.title} [${s.importance}] ---
Objectif : ${s.objective}
Points à couvrir : ${s.content_points.join(" ; ")}
Exemples à inclure : ${s.examples.join(" ; ")}
SEO : ${s.seo_notes}`).join("\n\n")}

IMPORTANT : Suis ce plan section par section. Chaque section doit couvrir les points listés, inclure les exemples suggérés, et intégrer les termes SEO indiqués. Les sections marquées "high" doivent être les plus développées.`
      : "";

    // Determine if we have pre-generated data (enriched mode) or not (legacy mode)
    const hasPreGenData = !!(struct || editPlan || snip || kwStrat);

    const systemPrompt = `Tu es un rédacteur SEO senior (10+ ans d'expérience), spécialisé dans la rédaction web naturelle, le SEO avancé, la création de contenu qui rank sur Google, et l'UX/lisibilité. Chaque article que tu produis est unique, profond, utile et génère du trafic organique réel. Tu n'écris JAMAIS de contenu générique, répétitif ou robotique. Tu écris toujours dans la langue spécifiée — c'est non négociable.`;

    const userPrompt = `Tu es un rédacteur SEO senior spécialisé dans le secteur "${industry ?? "e-commerce"}". Tu travailles pour "${businessName}".

LANGUE : Rédige l'INTÉGRALITÉ de l'article en ${language}. Chaque mot doit être en ${language}.

MOT-CLÉ PRINCIPAL : "${keyword}"${internalLinksContext}${styleGuideContext}${cocoonContext}${keywordContext}${structureContext}${snippetContext}${editorialContext}

---

MISSION : Rédiger un article SEO complet, naturel et de haute qualité.

${hasPreGenData ? `Tu disposes de données pré-analysées (structure SEO, plan éditorial, featured snippet, stratégie de mots-clés, positionnement cocon). SUIS ces données — elles sont le fruit d'une analyse stratégique en amont. Ne les ignore pas, ne les réinvente pas.` : ""}

---

RÈGLES DE RÉDACTION :

1. INTRODUCTION (150-200 mots)
- Accroche qui capte immédiatement l'attention (question, stat, problème).
- Reformule le besoin réel de l'utilisateur (pas le mot-clé littéral).
- Annonce clairement ce que l'article va apporter.
- Ton : expert mais accessible, comme un collègue senior qui explique.

2. FEATURED SNIPPET
${snip ? "- Le featured snippet a été pré-généré. Intègre-le TEL QUEL dans le contenu à l'emplacement indiqué. Ne le régénère pas." : "- Crée un bloc featured snippet : H2 sous forme de question + réponse directe en 40-60 mots. Si guide → <ol> avec 4-8 étapes. Si comparatif → <table>. Si définition → commencer par \"[Sujet] est...\"."}

3. CONTENU PRINCIPAL (1200-1800 mots)
${editPlan ? "- Suis le plan éditorial section par section. Chaque section doit couvrir les points listés et inclure les exemples suggérés." : `- 4 à 6 sections H2 bien structurées avec H3 si nécessaire.
- Exemples concrets liés au secteur "${industry ?? "e-commerce"}".`}
- Paragraphes courts (3-4 lignes max). Aucun mur de texte.
- Listes à puces pour la lisibilité quand pertinent.
- Chiffres, données, statistiques pour la crédibilité.
- Chaque section apporte une valeur UNIQUE — aucune répétition entre sections.
- Transitions naturelles entre sections.

4. FAQ (3-4 questions)
- Questions réellement posées par l'audience cible.
- Réponses directes : 40-60 mots chacune (optimisées featured snippet).
- Ne PAS répéter le contenu des sections précédentes.

5. CONCLUSION (100-150 mots)
- Résumé synthétique des points clés.
- Call-to-action fort et naturel.
- Aucune répétition mot-à-mot du contenu.

6. MAILLAGE INTERNE
${cocoonPos ? "- Les liens sortants obligatoires sont définis ci-dessus. Intègre-les naturellement dans le texte avec les ancres recommandées." : "- Propose 2 à 4 liens internes avec ancrage naturel."}

7. IMAGE
- Génère une requête Pexels précise (3-5 mots-clés en anglais).

8. MÉTA DONNÉES
- title SEO : optimisé CTR, 50-60 caractères, contient le mot-clé.
- meta_description : 150-160 caractères, incitative, naturelle.

---

QUALITÉ — RÈGLES ABSOLUES :

- Écrit par un humain expert, PAS par une IA. Aucune formule générique ("il est important de noter", "dans le monde actuel", "en conclusion").
- Aucune sur-optimisation. Densité mot-clé principal < 2%.
- Aucun contenu de remplissage. Chaque phrase apporte de la valeur.
- Varier la longueur des phrases. Alterner phrases courtes et développées.
- Utiliser la voix active. Être direct et concret.
- Les exemples doivent être spécifiques et crédibles, pas génériques.

---

FORMAT DE SORTIE : JSON valide uniquement, aucun texte avant ou après.

{
  "title": "Le H1 optimisé",
  "meta_description": "Meta description de 150-160 caractères",
  "featured_snippet": "${snip ? "Reprends le featured snippet pré-généré en HTML (h2 + p + liste/table)" : "Le bloc featured snippet en HTML pur"}",
  "content": "Le contenu HTML complet de l'article (SANS le featured_snippet, qui est séparé)",
  "internal_links": [
    { "anchor": "texte d'ancrage naturel", "target": "slug-ou-url-cible" }
  ],
  "pexels_query": "3-5 english keywords for stock photo",
  "cover_alt_text": "Texte alt SEO, 8-12 mots, inclut le mot-clé, dans la langue de l'article"
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
