export const maxDuration = 300;

import { createClient } from "@/lib/supabase/server";
import { aiCall, aiCallStream, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";
import { shopifyFetch } from "@/lib/shopify";
import {
  buildPageContext,
  generatePageStream,
  assembleCmsHtml as engineAssembleCmsHtml,
  type PageContext,
} from "@/lib/seo-engine";

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

// ── Assembler le HTML structuré pour publication CMS ─────────────────────────

type StructuredPageForCms = {
  hero: { title: string; subtitle: string; promise: string; cta: string | null };
  quick_answer: string;
  key_stats: { value: string; label: string; source?: string }[];
  simulation: { title: string; scenario: string; result: string };
  sections: { title: string; content: string; tip?: string; example?: string }[];
  insights: { type: "tip" | "warning" | "pro"; text: string }[];
  mistakes: { title: string; why: string; consequence: string }[];
  faq: { question: string; answer: string }[];
  cta: { text: string; button_text: string; button_url: string | null };
};

function assembleCmsHtml(page: StructuredPageForCms): string {
  const parts: string[] = [];

  // Hero
  parts.push(`<p><strong>${page.hero.subtitle}</strong></p>`);
  parts.push(`<p>${page.hero.promise}</p>`);

  // Quick answer (featured snippet)
  parts.push(`<h2>En bref</h2>`);
  parts.push(`<p>${page.quick_answer}</p>`);

  // Key stats
  if (page.key_stats.length > 0) {
    parts.push(`<h2>Chiffres clés</h2>`);
    parts.push(`<ul>`);
    for (const stat of page.key_stats) {
      parts.push(`<li><strong>${stat.value}</strong> — ${stat.label}${stat.source ? ` <em>(${stat.source})</em>` : ""}</li>`);
    }
    parts.push(`</ul>`);
  }

  // Simulation
  parts.push(`<h2>${page.simulation.title}</h2>`);
  parts.push(page.simulation.scenario);
  parts.push(`<p><strong>${page.simulation.result}</strong></p>`);

  // Main sections
  for (const section of page.sections) {
    parts.push(`<h2>${section.title}</h2>`);
    parts.push(section.content);
    if (section.tip) parts.push(`<p><strong>💡 Astuce :</strong> ${section.tip}</p>`);
    if (section.example) parts.push(`<p><em>Exemple : ${section.example}</em></p>`);
  }

  // Insights
  if (page.insights.length > 0) {
    const icons = { tip: "💡", warning: "⚠️", pro: "🔥" };
    for (const insight of page.insights) {
      parts.push(`<p><strong>${icons[insight.type]}</strong> ${insight.text}</p>`);
    }
  }

  // Mistakes
  if (page.mistakes.length > 0) {
    parts.push(`<h2>Erreurs à éviter</h2>`);
    parts.push(`<ul>`);
    for (const m of page.mistakes) {
      parts.push(`<li><strong>${m.title}</strong> — ${m.why} <em>${m.consequence}</em></li>`);
    }
    parts.push(`</ul>`);
  }

  // FAQ
  if (page.faq.length > 0) {
    parts.push(`<h2>Questions fréquentes</h2>`);
    for (const q of page.faq) {
      parts.push(`<h3>${q.question}</h3>`);
      parts.push(`<p>${q.answer}</p>`);
    }
  }

  // CTA
  parts.push(`<p>${page.cta.text}</p>`);

  return parts.join("\n");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "generate", maxRequests: 10, windowSeconds: 600 });
    if (limited) return limited;

    const body = await request.json();
    const { keyword, businessName, industry, allKeywords, language = "fr", cocoon_position, keyword_strategy, content_structure, featured_snippet, editorial_plan } = body;
    const useEngine = body.engine === true;
    const url = new URL(request.url);
    const isStream = url.searchParams.get("stream") === "1";

    // ── Mode Engine v2 — moteur SEO intelligent ─────────────────────────────
    if (useEngine) {
      // Construire le contexte complet automatiquement
      const kwStrat = keyword_strategy as { primary_keyword: string; secondary_keywords: string[]; semantic_field: string[]; seo_angle: string } | undefined;
      const intentData = body.intent_analysis as { intent_type: string; user_intent: string; recommended_content_type: string; angle: string } | undefined;

      // SERP optionnelle en parallèle
      let serpData: PageContext["serp"] = null;
      try {
        const serp = await analyzeSERP(keyword, language, industry ?? "e-commerce");
        if (serp) {
          serpData = {
            patterns: serp.serp_patterns,
            weaknesses: serp.weaknesses,
            opportunities: serp.opportunities,
            differentiation: serp.differentiation_strategy,
            content_upgrades: serp.content_upgrades,
            enhanced_structure: serp.enhanced_structure,
            avg_word_count: 1500,
            dominant_format: "guide",
          };
        }
      } catch { /* SERP optionnelle */ }

      const ctx = await buildPageContext(supabase, user.id, {
        keyword,
        language,
        business_name: businessName ?? "",
        industry: industry ?? "e-commerce",
        intent: intentData ? {
          type: intentData.intent_type,
          user_intent: intentData.user_intent,
          content_type: intentData.recommended_content_type,
          angle: intentData.angle,
        } : undefined,
        keywords: kwStrat ? {
          primary: kwStrat.primary_keyword,
          secondary: kwStrat.secondary_keywords,
          semantic_field: kwStrat.semantic_field,
          seo_angle: kwStrat.seo_angle,
        } : undefined,
        serp: serpData,
      });

      if (isStream) {
        const { stream, decisions, contextHash } = generatePageStream(ctx);
        // Envelopper le stream pour ajouter les métadonnées moteur à la fin
        const engineMeta = JSON.stringify({
          type: "engine_meta",
          decisions: decisions.filter(d => d.include).map(d => ({ block: d.block_type, reason: d.reason })),
          context_hash: contextHash,
        });
        const encoder = new TextEncoder();
        const wrappedStream = new ReadableStream({
          async start(controller) {
            const reader = stream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
              // Ajouter les métadonnées moteur comme dernier event
              controller.enqueue(encoder.encode(`data: ${engineMeta}\n\n`));
            } finally {
              controller.close();
            }
          },
        });
        return new Response(wrappedStream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
        });
      }

      // Mode non-streaming
      const { generatePageSync } = await import("@/lib/seo-engine");
      const page = await generatePageSync(ctx);
      if (!page) return Response.json({ error: "Impossible de générer la page" }, { status: 500 });

      return Response.json({
        title: page.title,
        content: engineAssembleCmsHtml(page),
        meta_description: page.meta_description,
        cover_image_query: page.pexels_query,
        cover_alt_text: page.cover_alt_text,
        section_image_queries: page.section_image_queries ?? [],
        structured: {
          hero: page.blocks.find(b => b.type === "hero")?.data,
          quick_answer: (page.blocks.find(b => b.type === "quick_answer")?.data as { answer: string } | undefined)?.answer,
          key_stats: (page.blocks.find(b => b.type === "key_stats")?.data as { stats: unknown[] } | undefined)?.stats ?? [],
          simulation: page.blocks.find(b => b.type === "simulation")?.data,
          sections: page.blocks.filter(b => b.type === "section").map(b => b.data),
          insights: (page.blocks.find(b => b.type === "insight")?.data as { insights: unknown[] } | undefined)?.insights ?? [],
          mistakes: (page.blocks.find(b => b.type === "mistakes")?.data as { mistakes: unknown[] } | undefined)?.mistakes ?? [],
          faq: (page.blocks.find(b => b.type === "faq")?.data as { questions: unknown[] } | undefined)?.questions ?? [],
          cta: page.blocks.find(b => b.type === "cta")?.data,
          gsc_insight: page.blocks.find(b => b.type === "gsc_insight")?.data,
          comparison: page.blocks.find(b => b.type === "comparison")?.data,
          internal_links: page.internal_links,
        },
        engine: page.engine,
      });
    }

    // ── Mode legacy (prompt direct) ─────────────────────────────────────────

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

    const systemPrompt = `Tu es un expert senior en SEO, UX writing et Product Design. 10+ ans d'expérience. Spécialisé dans :
- Pages SEO modernes (landing page + outil + article)
- UX orientée conversion
- Contenu scannable et visuellement structuré
- Stratégie différenciante basée sur l'analyse SERP

Tu travailles pour Rankpill. Tu produis des pages SEO qui donnent envie de lire et d'agir. Pas des articles blog classiques. Tu écris toujours dans la langue spécifiée — non négociable.`;

    const userPrompt = `Tu es un expert SEO/UX senior dans le secteur "${industry ?? "e-commerce"}". Tu travailles pour "${businessName}".

LANGUE : Rédige TOUT en ${language}. Chaque mot doit être en ${language}.

MOT-CLÉ PRINCIPAL : "${keyword}"${internalLinksContext}${styleGuideContext}${cocoonContext}${keywordContext}${structureContext}${snippetContext}${editorialContext}${serpContext}

---

OBJECTIF : Créer une page SEO MODERNE qui ressemble à une landing page + un outil + un article. Pas un article blog classique. Le résultat doit capter l'attention, être lisible en diagonale, apporter une valeur immédiate, et surpasser tout ce qui existe sur Google.

${hasPreGenData ? `Tu disposes de données pré-analysées (structure SEO, plan éditorial, featured snippet, stratégie de mots-clés, positionnement cocon). SUIS ces données.` : ""}

---

STRUCTURE OBLIGATOIRE — 9 PARTIES :

PARTIE 1 — HERO (HOOK)
- Titre puissant orienté bénéfice ou résultat (H1)
- Sous-titre clair qui précise la promesse
- Promesse forte en 1 phrase (ce que le lecteur obtient)
- CTA optionnel

PARTIE 2 — RÉPONSE IMMÉDIATE (Featured Snippet)
${snip ? "Le featured snippet a été pré-généré. Reprends-le tel quel." : "Réponse claire et directe au mot-clé. 40-60 mots. Compréhension instantanée. Optimisé position 0."}

PARTIE 3 — CHIFFRES CLÉS
- 3 à 5 statistiques importantes liées au sujet
- Format court : valeur + label + source optionnelle
- Chiffres réels, crédibles, sourcés quand possible
- Impact visuel — pas de paragraphes

PARTIE 4 — SIMULATION / EXEMPLE CONCRET
- Un exemple concret ou projection chiffrée
- Calcul rapide que le lecteur peut appliquer à sa situation
- Scénario avant/après avec résultat mesurable
- Titre accrocheur pour le bloc

PARTIE 5 — CONTENU PRINCIPAL (3-5 sections)
Chaque section contient :
- Un H2 court et percutant
- Paragraphes courts (2-3 phrases max)
- Listes à puces pour les éléments clés
- UNE idée claire par section
- UN conseil concret
- UN exemple spécifique
${cocoonPos ? "Intègre les liens sortants obligatoires naturellement dans ces sections." : ""}

PARTIE 6 — BLOCS INSIGHT (3-5 blocs)
Chaque bloc a un type et un texte court :
- "tip" : 💡 Astuce pratique
- "warning" : ⚠️ Point d'attention
- "pro" : 🔥 Conseil d'expert avancé
1-2 phrases max par bloc. Valeur immédiate.

PARTIE 7 — ERREURS À ÉVITER (3-5 erreurs)
- Titre court de l'erreur
- Explication en 1-2 phrases de POURQUOI c'est un piège
- Conséquence concrète

PARTIE 8 — FAQ (3-4 questions)
- Questions réellement posées par l'audience
- Réponses directes : 40-60 mots (optimisées position 0)
- Ne PAS répéter le contenu des sections

PARTIE 9 — CTA FINAL
- Texte de conclusion court (2-3 phrases)
- Bouton/action connecté à Rankpill / "${businessName}"
- Non agressif, utile, naturel

---

MAILLAGE INTERNE
${cocoonPos ? "Les liens sortants obligatoires sont définis ci-dessus. Intègre-les dans les sections du contenu principal." : "Propose 2 à 4 liens internes avec ancrage naturel."}

IMAGE
- Génère une requête Pexels précise pour la couverture (3-5 mots-clés en anglais).
- Génère 3 requêtes Pexels différentes pour les images inline (1 par section principale). Chaque requête doit être spécifique au contenu de la section et différente de la couverture.

MÉTA DONNÉES
- title SEO : optimisé CTR, 50-60 caractères, contient le mot-clé.
- meta_description : 150-160 caractères, incitative, naturelle.

---

QUALITÉ — RÈGLES ABSOLUES :

- Aucun bloc de texte long. Tout est scannable.
- Écrit par un humain expert. INTERDITES : "il est important de noter", "dans le monde actuel", "en conclusion", "il convient de", "force est de constater", "il est essentiel de".
- Style : humain, fluide, direct, pédagogique.
- Aucune sur-optimisation. Densité mot-clé < 2%.
- Aucun contenu de remplissage.
- Voix active. Direct. Concret.
- Aucune répétition entre sections.
- Contenu total : 1500-2200 mots.

---

FORMAT DE SORTIE : JSON valide uniquement, aucun texte avant ou après.

{
  "title": "H1 SEO optimisé CTR",
  "meta_description": "150-160 caractères",
  "hero": {
    "title": "Titre puissant orienté résultat",
    "subtitle": "Sous-titre clair et précis",
    "promise": "Promesse forte en 1 phrase",
    "cta": "Texte du CTA optionnel ou null"
  },
  "quick_answer": "Réponse immédiate 40-60 mots, optimisée featured snippet",
  "key_stats": [
    { "value": "85%", "label": "des sites ne...", "source": "Étude X 2024" }
  ],
  "simulation": {
    "title": "Titre du bloc simulation",
    "scenario": "Description du scénario en HTML (<p>, <strong>, <ul>)",
    "result": "Résultat chiffré ou conclusion"
  },
  "sections": [
    {
      "title": "H2 court et percutant",
      "content": "HTML du contenu (<p>, <ul>, <li>, <strong>, <em>)",
      "tip": "Conseil concret en 1 phrase",
      "example": "Exemple spécifique en 1-2 phrases"
    }
  ],
  "insights": [
    { "type": "tip", "text": "Astuce pratique courte" },
    { "type": "warning", "text": "Point d'attention" },
    { "type": "pro", "text": "Conseil expert avancé" }
  ],
  "mistakes": [
    { "title": "Erreur courte", "why": "Explication en 1-2 phrases", "consequence": "Impact concret" }
  ],
  "faq": [
    { "question": "Question réelle ?", "answer": "Réponse directe 40-60 mots" }
  ],
  "cta": {
    "text": "Texte de conclusion 2-3 phrases",
    "button_text": "Texte du bouton CTA",
    "button_url": null
  },
  "internal_links": [
    { "anchor": "texte d'ancrage", "target": "slug-ou-url" }
  ],
  "pexels_query": "3-5 english keywords",
  "cover_alt_text": "Texte alt SEO 8-12 mots",
  "section_image_queries": ["english query for section 1 image", "english query for section 2 image", "english query for section 3 image"]
}

HTML autorisé dans les champs content/scenario : <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>. Pas de <h2> dans content (le H2 est le champ title). Pas de <html>, <body>, <head>.`;

    const aiParams = {
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userPrompt }],
    };

    // ── Streaming mode (SSE) ──────────────────────────────────────────────
    if (isStream) {
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

    type StructuredPage = {
      title: string;
      meta_description: string;
      hero: { title: string; subtitle: string; promise: string; cta: string | null };
      quick_answer: string;
      key_stats: { value: string; label: string; source?: string }[];
      simulation: { title: string; scenario: string; result: string };
      sections: { title: string; content: string; tip?: string; example?: string }[];
      insights: { type: "tip" | "warning" | "pro"; text: string }[];
      mistakes: { title: string; why: string; consequence: string }[];
      faq: { question: string; answer: string }[];
      cta: { text: string; button_text: string; button_url: string | null };
      internal_links?: { anchor: string; target: string }[];
      pexels_query?: string;
      cover_alt_text?: string;
      section_image_queries?: string[];
    };

    const parsed = parseAiJson<StructuredPage>(aiResult.text);

    if (!parsed) {
      return Response.json({ error: "Impossible de lire la réponse de Claude" }, { status: 500 });
    }

    // Assembler le HTML pour le CMS (publication WordPress/Shopify)
    const cmsHtml = assembleCmsHtml(parsed);

    return Response.json({
      title: parsed.title,
      content: cmsHtml,
      meta_description: parsed.meta_description,
      cover_image_query: parsed.pexels_query ?? null,
      cover_alt_text: parsed.cover_alt_text ?? null,
      section_image_queries: parsed.section_image_queries ?? [],
      // Données structurées pour le preview moderne
      structured: {
        hero: parsed.hero,
        quick_answer: parsed.quick_answer,
        key_stats: parsed.key_stats,
        simulation: parsed.simulation,
        sections: parsed.sections,
        insights: parsed.insights,
        mistakes: parsed.mistakes,
        faq: parsed.faq,
        cta: parsed.cta,
        internal_links: parsed.internal_links ?? [],
      },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
