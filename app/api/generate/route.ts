import { createClient } from "@/lib/supabase/server";
import { aiCall, aiCallStream, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";
import { shopifyFetch } from "@/lib/shopify";

// ── SERP Analysis — scrape + analyse concurrentielle ──────────────────────────

type SerpResult = {
  title: string;
  url: string;
  headings: string[];
  summary: string;
  wordCount: number;
};

type SerpAnalysis = {
  serp_patterns: string;
  weaknesses: string[];
  opportunities: string[];
  differentiation_strategy: string;
  content_upgrades: string[];
  enhanced_structure: string[];
};

async function scrapeSerpPage(url: string): Promise<SerpResult | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 8);
    const h3Matches = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].slice(0, 6);

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title: titleMatch?.[1]?.trim() ?? "",
      url,
      headings: [
        ...h2Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()),
        ...h3Matches.map(m => m[1].replace(/<[^>]+>/g, "").trim()),
      ].filter(Boolean),
      summary: text.slice(0, 800),
      wordCount: text.split(/\s+/).filter(Boolean).length,
    };
  } catch {
    return null;
  }
}

async function fetchGoogleSerpUrls(keyword: string, lang: string): Promise<string[]> {
  try {
    const query = encodeURIComponent(keyword);
    const hl = lang === "fr" ? "fr" : lang === "es" ? "es" : lang === "de" ? "de" : "en";
    const res = await fetch(
      `https://www.google.com/search?q=${query}&hl=${hl}&num=8&gl=${hl}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": `${hl},en;q=0.9`,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    // Extract organic result URLs from Google SERP
    const urls = [...html.matchAll(/href="\/url\?q=([^&"]+)/g)]
      .map(m => decodeURIComponent(m[1]))
      .filter(u => u.startsWith("http") && !u.includes("google.") && !u.includes("youtube.") && !u.includes("wikipedia."));
    // Fallback: try extracting from <a href="https://..." patterns
    if (urls.length < 3) {
      const directUrls = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/g)]
        .map(m => m[1])
        .filter(u => !u.includes("google.") && !u.includes("youtube.") && !u.includes("accounts.") && !u.includes("support.google"));
      return [...new Set([...urls, ...directUrls])].slice(0, 5);
    }
    return urls.slice(0, 5);
  } catch {
    return [];
  }
}

async function analyzeSERP(keyword: string, language: string, industry: string): Promise<SerpAnalysis | null> {
  try {
    // 1. Scrape Google SERP top results
    const urls = await fetchGoogleSerpUrls(keyword, language);
    if (urls.length === 0) return null;

    // 2. Scrape each result page
    const scraped = (await Promise.all(urls.map(u => scrapeSerpPage(u)))).filter((r): r is SerpResult => r !== null);
    if (scraped.length === 0) return null;

    // 3. IA analysis
    const serpInput = scraped.map(r => ({
      title: r.title,
      headings: r.headings.slice(0, 6),
      summary: r.summary.slice(0, 400),
      wordCount: r.wordCount,
    }));

    const result = await aiCall(
      { task: "content_audit" },
      {
        messages: [{
          role: "user",
          content: `Tu es un expert SEO senior spécialisé en analyse SERP et reverse engineering SEO.

KEYWORD : "${keyword}"
SECTEUR : "${industry}"

RÉSULTATS GOOGLE TOP ${scraped.length} :
${JSON.stringify(serpInput, null, 2)}

MISSION : Analyse ces résultats et identifie comment créer un contenu SUPÉRIEUR.

PARTIE 1 — PATTERNS SERP : Structure commune, angles utilisés, types de contenus dominants.
PARTIE 2 — FAIBLESSES : Manque de données, contenu générique, absence d'exemples, contenu non actionnable.
PARTIE 3 — OPPORTUNITÉS : Angles non exploités, infos absentes, besoins non couverts.
PARTIE 4 — STRATÉGIE DE DIFFÉRENCIATION : Angle unique, promesse plus forte, positionnement supérieur.
PARTIE 5 — AMÉLIORATIONS : Données chiffrées, exemples concrets, simulateurs, conseils avancés à ajouter.
PARTIE 6 — STRUCTURE AMÉLIORÉE : Sections nouvelles, logique plus avancée que la concurrence.

RETOURNE : JSON brut uniquement.
{
  "serp_patterns": "description des patterns communs en 2-3 phrases",
  "weaknesses": ["faiblesse 1", "faiblesse 2", ...],
  "opportunities": ["opportunité 1", "opportunité 2", ...],
  "differentiation_strategy": "stratégie en 2-3 phrases",
  "content_upgrades": ["amélioration 1", "amélioration 2", ...],
  "enhanced_structure": ["section H2 recommandée 1", "section H2 recommandée 2", ...]
}`,
        }],
      }
    );

    return parseAiJson<SerpAnalysis>(result.text) ?? null;
  } catch (err) {
    console.error("[SERP analysis]", err);
    return null;
  }
}

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
    const blogsRes = await shopifyFetch(storeUrl, apiKey, "blogs.json");
    if (!blogsRes.ok) return "";
    const blogsData = await blogsRes.json() as { blogs: { id: number }[] };
    if (!blogsData.blogs?.length) return "";

    const blogId = blogsData.blogs[0].id;
    const articlesRes = await shopifyFetch(storeUrl, apiKey, `blogs/${blogId}/articles.json?limit=5&fields=title,body_html`);
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
        .select("cms, site_url, shopify_store_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      if (site?.cms === "wordpress" && site.wp_username && site.wp_app_password) {
        styleGuide = await fetchStyleGuideWordPress(site.site_url, site.wp_username, site.wp_app_password);
      } else if (site?.cms === "shopify" && site.shopify_api_key) {
        styleGuide = await fetchStyleGuideShopify(site.shopify_store_url || site.site_url, site.shopify_api_key);
      }
      // Wix : DA non disponible via API publique, on génère sans style guide
    } catch {
      // DA optionnelle, on continue sans
    }

    // ── Analyse SERP concurrentielle (en parallèle) ─────────────────────────
    let serpAnalysis: SerpAnalysis | null = null;
    try {
      serpAnalysis = await analyzeSERP(keyword, language, industry ?? "e-commerce");
    } catch { /* SERP analysis optionnelle */ }

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
    const serpContext = serpAnalysis
      ? `\n\nANALYSE SERP CONCURRENTIELLE (résultats Google analysés pour "${keyword}") :
Patterns SERP : ${serpAnalysis.serp_patterns}
Faiblesses concurrents : ${serpAnalysis.weaknesses.join(" | ")}
Opportunités identifiées : ${serpAnalysis.opportunities.join(" | ")}
Stratégie de différenciation : ${serpAnalysis.differentiation_strategy}
Améliorations obligatoires : ${serpAnalysis.content_upgrades.join(" | ")}
Structure améliorée recommandée : ${serpAnalysis.enhanced_structure.join(" → ")}

IMPORTANT : Utilise cette analyse pour créer un contenu SUPÉRIEUR à la concurrence. Exploite les faiblesses identifiées, couvre les opportunités manquées, et applique la stratégie de différenciation. Ton article doit être objectivement meilleur que tout ce qui existe actuellement sur ce mot-clé.`
      : "";

    const hasPreGenData = !!(struct || editPlan || snip || kwStrat);

    const systemPrompt = `Tu es un expert SEO senior ET un rédacteur professionnel (10+ ans d'expérience). Tu es spécialisé dans :
- Contenus SEO à forte valeur qui dominent la SERP
- Stratégie éditoriale avancée
- Contenu différenciant et non générique
- Génération de trafic ET conversion

Tu travailles pour Rankpill. Chaque article que tu produis doit être MEILLEUR que tous les résultats actuels de Google sur le sujet. Tu n'écris JAMAIS de contenu générique, répétitif ou robotique. Tu écris toujours dans la langue spécifiée — c'est non négociable.`;

    const userPrompt = `Tu es un rédacteur SEO senior spécialisé dans le secteur "${industry ?? "e-commerce"}". Tu travailles pour "${businessName}".

LANGUE : Rédige l'INTÉGRALITÉ de l'article en ${language}. Chaque mot doit être en ${language}.

MOT-CLÉ PRINCIPAL : "${keyword}"${internalLinksContext}${styleGuideContext}${cocoonContext}${keywordContext}${structureContext}${snippetContext}${editorialContext}${serpContext}

---

OBJECTIF : Créer un contenu meilleur que tous les résultats Google — concret, utile, différenciant, non générique.

${hasPreGenData ? `Tu disposes de données pré-analysées (structure SEO, plan éditorial, featured snippet, stratégie de mots-clés, positionnement cocon). SUIS ces données — elles sont le fruit d'une analyse stratégique en amont. Ne les ignore pas, ne les réinvente pas.` : ""}

---

STRUCTURE OBLIGATOIRE — 8 PARTIES :

PARTIE 1 — INTRO IMPACT (150-200 mots)
- Commence par un PROBLÈME RÉEL que le lecteur vit concrètement.
- Formule une PROMESSE FORTE (ce qu'il va obtenir en lisant).
- Annonce précisément ce que l'article va lui apprendre.
- Accroche : question percutante, stat chiffrée, ou constat direct.
- Ton : expert accessible, comme un collègue senior qui partage son expérience.

PARTIE 2 — DONNÉES CONCRÈTES
- Chiffres réels, budgets, coûts, estimations de marché.
- Statistiques sourcées et crédibles (études, rapports).
- Données qui apportent une valeur immédiate au lecteur.
- Contexte chiffré du secteur "${industry ?? "e-commerce"}".
- Aucun chiffre inventé — si tu n'as pas de donnée précise, donne des fourchettes réalistes.

PARTIE 3 — EXEMPLES RÉELS
- Cas concrets et scénarios réalistes liés au secteur.
- Résultats mesurables (avant/après, ROI, gains).
- Situations dans lesquelles le lecteur se reconnaît.
- Au moins 2-3 exemples détaillés, pas des généralités.

PARTIE 4 — STRATÉGIE ACTIONNABLE
- Étapes concrètes numérotées que le lecteur peut suivre immédiatement.
- Méthodes précises avec des outils, des techniques, des paramètres.
- Conseils que même un expert trouverait utiles.
- Chaque étape doit être exécutable, pas théorique.

PARTIE 5 — ERREURS À ÉVITER
- 3 à 5 erreurs fréquentes avec explication de POURQUOI c'est un piège.
- Mauvaises pratiques courantes dans le secteur.
- Ce que font les débutants vs ce que font les experts.
- Conséquences concrètes de chaque erreur.

PARTIE 6 — OUTIL OU SIMULATION
- Un calcul simple, une projection chiffrée ou un exemple de simulation.
- Le lecteur doit pouvoir appliquer ce calcul à sa propre situation.
- Formule ou méthode reproductible.
- Résultat concret qui donne envie d'agir.

PARTIE 7 — FAQ (3-4 questions)
- Questions RÉELLEMENT posées par l'audience cible.
- Réponses directes : 40-60 mots chacune (optimisées featured snippet / position 0).
- Hn optimisés, mots-clés naturels, richesse sémantique.
- Ne PAS répéter le contenu des sections précédentes.

PARTIE 8 — CONCLUSION + CTA INTELLIGENT (100-150 mots)
- Résumé percutant des points clés (pas de répétition mot-à-mot).
- Lien naturel avec ce que Rankpill / "${businessName}" peut apporter.
- Call-to-action fort qui pousse à l'action concrète.

---

FEATURED SNIPPET
${snip ? "- Le featured snippet a été pré-généré. Intègre-le TEL QUEL dans le contenu à l'emplacement indiqué. Ne le régénère pas." : "- Crée un bloc featured snippet : H2 sous forme de question + réponse directe en 40-60 mots. Si guide → <ol> avec 4-8 étapes. Si comparatif → <table>. Si définition → commencer par \"[Sujet] est...\"."}

MAILLAGE INTERNE
${cocoonPos ? "- Les liens sortants obligatoires sont définis ci-dessus. Intègre-les naturellement dans le texte avec les ancres recommandées." : "- Propose 2 à 4 liens internes avec ancrage naturel."}

IMAGE
- Génère une requête Pexels précise (3-5 mots-clés en anglais).

MÉTA DONNÉES
- title SEO : optimisé CTR, 50-60 caractères, contient le mot-clé.
- meta_description : 150-160 caractères, incitative, naturelle.

---

QUALITÉ — RÈGLES ABSOLUES :

- Écrit par un humain expert, PAS par une IA. INTERDITES : "il est important de noter", "dans le monde actuel", "en conclusion", "il convient de", "force est de constater", "il est essentiel de".
- Style : humain, fluide, expert, pédagogique. Alterner phrases courtes et développées.
- Aucune sur-optimisation. Densité mot-clé principal < 2%.
- Aucun contenu de remplissage. Chaque phrase apporte de la valeur CONCRÈTE.
- Les exemples doivent être SPÉCIFIQUES et crédibles, pas génériques.
- Voix active. Direct. Concret. Pas de conditionnel excessif.
- Aucune répétition inutile entre sections.
- Longueur totale : 1500-2200 mots de contenu riche.

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
