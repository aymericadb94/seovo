/**
 * Pipeline de génération Rankpill v3
 *
 * 8 agents séquentiels, chacun enrichit le contexte pour le suivant :
 *   1. Intent    — Analyse d'intention de recherche
 *   2. SERP      — Analyse concurrentielle SERP
 *   3. Diff      — Stratégie d'angle différenciant
 *   4. Structure  — Structure de page dynamique
 *   5. Content   — Rédaction SEO complète
 *   6. Linking   — Maillage interne
 *   7. Risk      — Audit de risques SEO
 *   8. CTR       — Optimisation title + meta
 *
 * Chaque agent reçoit le contexte Rankpill (GSC, cocon, roadmap, pages, cluster).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { getValidGscToken } from "@/lib/gsc-utils";

// ── Types d'entrée / sortie ──────────────────────────────────────────────────

export type PipelineInput = {
  keyword: string;
  language: string;
  business_name: string;
  industry: string;
};

export type RankpillContext = {
  gsc_data: GscData | null;
  cocoon: CocoonInfo | null;
  roadmap: RoadmapInfo | null;
  existing_pages: ExistingPage[];
  cluster: string | null;
};

export type GscData = {
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: { url: string; clicks: number; impressions: number; ctr: number; position: number }[];
};

export type CocoonInfo = {
  page_type: "pillar" | "support" | "complementary";
  cluster: string;
  pillar_relation: string;
  sibling_keywords: string[];
};

export type RoadmapInfo = {
  phase: number;
  priority: string;
  objective: string;
};

export type ExistingPage = {
  title: string;
  keyword: string;
  url: string;
};

// Agent outputs

export type IntentOutput = {
  intent: "informational" | "commercial_investigation" | "transactional" | "navigational" | "local";
  intent_mix: { informational: number; commercial: number; transactional: number };
  sub_intents: { label: string; type: "question" | "action" | "comparison" | "definition" | "list"; priority: 1 | 2 | 3 }[];
  user_stage: "débutant" | "intermédiaire" | "avancé";
  keyword_variations: {
    semantic: string[];
    long_tail: string[];
    related_questions: string[];
  };
  content_lifespan: "evergreen" | "seasonal" | "trending";
  search_volume_signal: "high" | "medium" | "low" | "unknown";
  featured_snippet_opportunity: { likely: boolean; format: "paragraph" | "list" | "table" | "none" };
};

export type SerpOutput = {
  patterns: string[];
  weaknesses: string[];
  content_gaps: string[];
  serp_features: {
    featured_snippet: boolean;
    paa: boolean;
    video_pack: boolean;
    image_pack: boolean;
    knowledge_panel: boolean;
    local_pack: boolean;
  };
  competitive_benchmark: {
    avg_word_count: number;
    avg_headings_count: number;
    difficulty_estimate: "low" | "medium" | "high" | "very_high";
    top_formats: string[];
  };
  opportunities: { type: string; description: string; priority: 1 | 2 | 3 }[];
  data_source: "scraped" | "estimated";
};

export type DiffOutput = {
  angle: string;
  promise: string;
  positioning: string;
  unique_elements: string[];
  tone_of_voice: "expert" | "accessible" | "provocateur" | "didactique" | "data-driven";
  content_strategy: {
    target_word_count: number;
    depth_level: "survol" | "approfondi" | "exhaustif";
    recommended_format: string;
    differentiators: string[];
  };
  cocoon_positioning: {
    role: "pillar" | "support" | "complementary" | "standalone";
    relation_to_cluster: string;
  };
};

export type StructureOutput = {
  blocks: string[];
  sections_plan: {
    h2: string;
    sub_intent_covered: string;
    estimated_words: number;
    key_points: string[];
  }[];
  snippet_strategy: {
    target_block: string;
    format: "paragraph" | "list" | "table" | "none";
    instruction: string;
  };
  target_sections_count: number;
};

export type ContentOutput = {
  hero: { title: string; subtitle: string; promise: string; cta: string | null };
  quick_answer: string;
  stats?: { label: string; value: string; source?: string }[];
  comparison?: { headers: string[]; rows: string[][] };
  sections: { title: string; content: string; tip?: string; example?: string }[];
  insights: { type: "tip" | "warning" | "pro"; text: string }[];
  mistakes: { title: string; why: string; consequence: string }[];
  faq: { question: string; answer: string }[];
  cta: string;
  pexels_query: string;
  cover_alt_text: string;
  section_image_queries: string[];
};

export type LinkingOutput = {
  links: {
    target_url: string;
    anchor: string;
    anchor_type: "exact_match" | "partial_match" | "semantic" | "contextual" | "branded";
    placement: string;
    objective: "seo" | "ux" | "conversion";
    priority: "haute" | "moyenne" | "faible";
    justification: string;
  }[];
  strategy_summary: string;
};

export type RiskOutput = {
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  issues: {
    category: "keyword_density" | "cannibalization" | "thin_content" | "structure" | "ai_signals" | "linking" | "eeat" | "over_optimization";
    severity: "critical" | "warning" | "info";
    description: string;
    fix: string;
  }[];
  keyword_density: number;
  word_count: number;
  alignment_check: {
    intent_match: boolean;
    structure_respected: boolean;
    tone_consistent: boolean;
  };
};

export type CtrOutput = {
  title: string;
  title_length: number;
  title_variants: string[];
  meta_description: string;
  meta_length: number;
  og_title: string;
  og_description: string;
  hook: string;
  ctr_techniques_used: string[];
  confidence_score: number;
};

export type PipelineResult = {
  intent: IntentOutput;
  serp: SerpOutput;
  diff: DiffOutput;
  structure: StructureOutput;
  content: ContentOutput;
  linking: LinkingOutput;
  risk: RiskOutput;
  ctr: CtrOutput;
  // Assembled HTML for CMS publication
  html: string;
  title: string;
  meta_description: string;
};

// ── Callback for progress tracking ───────────────────────────────────────────

export type PipelineProgressCallback = (step: number, agent: string, details?: string[]) => void;

// ── Contexte Rankpill — collecte des données ─────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export async function collectRankpillContext(
  supabase: SupabaseClient,
  userId: string,
  keyword: string,
): Promise<RankpillContext> {
  // Fetch site, cocoon, roadmap, publications in parallel
  const [siteResult, cocoonResult, roadmapResult, pubsResult] = await Promise.all([
    supabase.from("sites").select("google_access_token, google_refresh_token, google_token_expiry, gsc_site_url").eq("user_id", userId).maybeSingle(),
    supabase.from("semantic_cocoons").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("roadmaps").select("data").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", userId),
  ]);

  // GSC data
  let gsc_data: GscData | null = null;
  const site = siteResult.data;
  if (site?.google_access_token && site?.gsc_site_url) {
    const token = await getValidGscToken(supabase, userId, site);
    if (token) {
      const siteUrl = encodeURIComponent(site.gsc_site_url);
      const body = {
        startDate: daysAgo(30),
        endDate: daysAgo(2),
        rowLimit: 50,
      };
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

      type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
      const [queriesRes, pagesRes] = await Promise.all([
        fetch(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
          method: "POST", headers,
          body: JSON.stringify({ ...body, dimensions: ["query"] }),
        }).then(r => r.ok ? r.json() as Promise<{ rows?: GscRow[] }> : { rows: [] }).catch(() => ({ rows: [] as GscRow[] })),
        fetch(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
          method: "POST", headers,
          body: JSON.stringify({ ...body, dimensions: ["page"], rowLimit: 25 }),
        }).then(r => r.ok ? r.json() as Promise<{ rows?: GscRow[] }> : { rows: [] }).catch(() => ({ rows: [] as GscRow[] })),
      ]);

      const queries = (queriesRes.rows ?? []).map(r => ({
        query: r.keys[0], clicks: r.clicks, impressions: r.impressions,
        ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10,
      }));
      const pages = (pagesRes.rows ?? []).map(r => ({
        url: r.keys[0], clicks: r.clicks, impressions: r.impressions,
        ctr: Math.round(r.ctr * 1000) / 10, position: Math.round(r.position * 10) / 10,
      }));

      if (queries.length > 0 || pages.length > 0) {
        gsc_data = { queries, pages };
      }
    }
  }

  // Cocoon — real DB format: { clusters: [{ name, priority, pillar: { title, keyword, status }, support_pages: [{ title, keyword, status }] }] }
  let cocoon: CocoonInfo | null = null;
  if (cocoonResult.data?.data) {
    type CocoonCluster = {
      name: string;
      priority: string;
      pillar: { title: string; keyword: string; status: string };
      support_pages: { title: string; keyword: string; status: string }[];
    };
    const clusters = ((cocoonResult.data.data as { clusters?: CocoonCluster[] }).clusters ?? []);
    const kwLower = keyword.toLowerCase();

    for (const c of clusters) {
      const pillarKw = c.pillar?.keyword?.toLowerCase() ?? "";
      const supportPages = Array.isArray(c.support_pages) ? c.support_pages : [];
      const allKeywords = [
        ...(pillarKw ? [{ keyword: c.pillar.keyword, role: "pillar" }] : []),
        ...supportPages.map(p => ({ keyword: p.keyword, role: "support" })),
      ];

      const match = allKeywords.find(p => p.keyword?.toLowerCase() === kwLower);
      if (match) {
        cocoon = {
          page_type: match.role === "pillar" ? "pillar" : "support",
          cluster: c.name,
          pillar_relation: match.role === "pillar" ? "self" : c.pillar.keyword,
          sibling_keywords: allKeywords.filter(p => p.keyword?.toLowerCase() !== kwLower).map(p => p.keyword),
        };
        break;
      }
    }

    // Fallback: if keyword not found in any cluster, use the first cluster for context
    if (!cocoon && clusters.length > 0) {
      const first = clusters[0];
      const supportPages = Array.isArray(first.support_pages) ? first.support_pages : [];
      cocoon = {
        page_type: "complementary",
        cluster: first.name,
        pillar_relation: first.pillar?.keyword ?? first.name,
        sibling_keywords: [
          ...(first.pillar?.keyword ? [first.pillar.keyword] : []),
          ...supportPages.map(p => p.keyword),
        ].filter(Boolean).slice(0, 10),
      };
    }
  }

  // Roadmap — real DB format: { articles: [{id, title, keyword, role, cluster, priority}], phases: [{phase, label, ids}] }
  let roadmap: RoadmapInfo | null = null;
  if (roadmapResult.data?.data) {
    type RoadmapArticle = { id: number; title: string; keyword: string; role: string; cluster?: string; priority: number };
    type RoadmapPhase = { phase: number; label: string; ids: number[] };
    const rmData = roadmapResult.data.data as { articles?: RoadmapArticle[]; phases?: RoadmapPhase[] };
    const articles = Array.isArray(rmData.articles) ? rmData.articles : [];
    const phases = Array.isArray(rmData.phases) ? rmData.phases : [];

    // Build article → phase map
    const phaseMap = new Map<number, number>();
    for (const phase of phases) {
      if (Array.isArray(phase.ids)) {
        for (const id of phase.ids) phaseMap.set(id, phase.phase);
      }
    }

    // Find exact keyword match
    const kwLower = keyword.toLowerCase();
    const match = articles.find(a => a.keyword?.toLowerCase() === kwLower);
    if (match) {
      const phase = phaseMap.get(match.id) ?? 1;
      const pri = match.priority <= 10 ? "haute" : match.priority <= 20 ? "moyenne" : "faible";
      roadmap = { phase, priority: pri, objective: `${match.role} — ${match.title}` };
    } else if (articles.length > 0) {
      // Fallback: give the global roadmap context (total articles, phases)
      roadmap = {
        phase: 0,
        priority: "contexte",
        objective: `${articles.length} articles planifiés sur ${phases.length} phases`,
      };
    }
  }

  // Existing pages — exclure les publications sans URL (sinon l'IA hallucine des URLs)
  const existing_pages: ExistingPage[] = (pubsResult.data ?? [])
    .filter(p => p.keyword && p.keyword !== "__page__" && p.wordpress_url && p.wordpress_url.startsWith("http"))
    .map(p => ({ title: p.title, keyword: p.keyword, url: p.wordpress_url }));

  // Cluster (from cocoon or null)
  const cluster = cocoon?.cluster ?? null;

  return { gsc_data, cocoon, roadmap, existing_pages, cluster };
}

// ── Contexte système commun ──────────────────────────────────────────────────

function systemContext(ctx: RankpillContext, input: PipelineInput): string {
  const now = new Date();
  const currentDate = now.toISOString().split("T")[0];
  const currentYear = now.getFullYear();

  const parts = [
    `Tu es intégré dans Rankpill. Tu dois produire un résultat non générique, basé sur les données, connecté au reste du site. Chaque sortie doit être exploitable par un système backend.`,
    `\nDate du jour : ${currentDate}. Année en cours : ${currentYear}. Utilise TOUJOURS ${currentYear} comme année de référence, JAMAIS une année passée.`,
    `\nBusiness : ${input.business_name}`,
    `Secteur : ${input.industry}`,
    `Langue : ${input.language}`,
  ];

  if (ctx.gsc_data) {
    const topQ = ctx.gsc_data.queries.slice(0, 15).map(q => `"${q.query}" pos:${q.position} imp:${q.impressions} clics:${q.clicks} CTR:${q.ctr}%`).join("\n");
    parts.push(`\nDonnées GSC (30j) :\n${topQ}`);
  }

  if (ctx.cocoon) {
    parts.push(`\nCocon sémantique : cluster "${ctx.cocoon.cluster}", type: ${ctx.cocoon.page_type}, pilier: ${ctx.cocoon.pillar_relation}`);
    if (ctx.cocoon.sibling_keywords.length > 0) {
      parts.push(`Pages sœurs : ${ctx.cocoon.sibling_keywords.join(", ")}`);
    }
  }

  if (ctx.roadmap) {
    parts.push(`\nRoadmap SEO : phase ${ctx.roadmap.phase}, priorité ${ctx.roadmap.priority}, objectif: ${ctx.roadmap.objective}`);
  }

  if (ctx.existing_pages.length > 0) {
    const pageList = ctx.existing_pages.slice(0, 20).map(p => `- "${p.title}" (${p.keyword}) → ${p.url}`).join("\n");
    parts.push(`\nPages existantes :\n${pageList}`);
  }

  if (ctx.cluster) {
    parts.push(`\nCluster SEO actuel : ${ctx.cluster}`);
  }

  return parts.join("\n");
}

// ── Agent 1 : Intent ─────────────────────────────────────────────────────────

// P7 — Fallback heuristique basé sur le keyword
function intentKeywordHeuristic(keyword: string): Pick<IntentOutput, "intent"> {
  const kw = keyword.toLowerCase();
  if (/acheter|prix|commander|fournisseur|grossiste|devis|tarif|stock|lot\b/.test(kw))
    return { intent: "transactional" };
  if (/meilleur|comparatif|avis|vs\b|top\s?\d|quel\b|ou\strouver/.test(kw))
    return { intent: "commercial_investigation" };
  if (/\b(paris|lyon|marseille|bordeaux|lille|nantes|toulouse|montpellier|montreuil|aubervilliers)\b|près de|à\s[A-Z]/.test(kw))
    return { intent: "local" };
  return { intent: "informational" };
}

async function runIntentAgent(input: PipelineInput, ctx: RankpillContext): Promise<IntentOutput> {
  const gscForKeyword = ctx.gsc_data?.queries.find(q => q.query.toLowerCase().includes(input.keyword.toLowerCase()));

  const result = await aiCall(
    { task: "intent_analysis" },
    {
      // P8 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un SEO Intent Analyst senior. Tu analyses les mots-clés avec la rigueur d'un data scientist et la vision stratégique d'un directeur SEO.

Tu connais la taxonomie Google des intentions de recherche (informational, commercial_investigation, transactional, navigational, local) et tu sais que la majorité des keywords sont multi-intentionnels.

Ta sortie conditionne 7 agents en aval — une erreur de classification ici se propage à tout le contenu. Sois précis et justifié.`,
      messages: [{
        role: "user",
        content: `Analyse le mot-clé "${input.keyword}" pour le business "${input.business_name}" (secteur : ${input.industry}).

${gscForKeyword ? `DONNÉES GSC pour ce mot-clé : position ${gscForKeyword.position}, ${gscForKeyword.impressions} impressions, ${gscForKeyword.clicks} clics, CTR ${gscForKeyword.ctr}%` : "Pas de données GSC pour ce mot-clé (nouveau keyword)."}

RÈGLES DE CLASSIFICATION :

INTENT — analyse le mot-clé + son contexte sémantique :
- "comment", "pourquoi", "c'est quoi", "guide", "tuto", "définition" → informational
- "meilleur", "comparatif", "avis", "vs", "top", "quel", "où trouver" → commercial_investigation
- "acheter", "prix", "commander", "fournisseur", "grossiste", "devis", "tarif" → transactional
- Nom de marque ou entreprise spécifique → navigational
- Ville, "près de", "à [ville]", adresse → local
- Si le mot-clé mélange plusieurs intents → marque l'intent dominant ET remplis intent_mix avec les %

USER STAGE — utilise le mot-clé + données GSC :
- Mot-clé large (1-2 mots) + fort volume potentiel → débutant
- Longue traîne (4+ mots) avec termes techniques → avancé
- GSC position < 5 → audience qualifiée → intermédiaire ou avancé
- GSC position > 20 + beaucoup d'impressions → découverte → débutant
- Modificateurs "pro", "avancé", "expert", "technique" → avancé
- Modificateurs "débutant", "facile", "simple", "c'est quoi" → débutant

CONTENT LIFESPAN :
- Contient une année, "soldes", "promo", "black friday", événement daté → seasonal
- Actualité, tendance récente, lancement → trending
- Sujet intemporel, guide de fond → evergreen

SEARCH VOLUME SIGNAL :
- Utilise les données GSC (impressions) si disponibles : > 1000 imp/mois → high, 200-1000 → medium, < 200 → low
- Sans GSC : estime à partir de la généralité du keyword (1-2 mots génériques → high, longue traîne niche → low)

FEATURED SNIPPET :
- "qu'est-ce que", "définition", "pourquoi" → likely, format paragraph
- "comment", "étapes", "tuto" → likely, format list
- "meilleur", "top", "comparatif", "vs" → likely, format table ou list
- Keyword transactionnel pur → unlikely, format none

SUB-INTENTS — identifie 3 à 6 sous-intentions :
- Chaque sous-intention a un type : question (interrogation), action (l'utilisateur veut faire), comparison (comparer), definition (comprendre), list (lister/classer)
- Chaque sous-intention a une priorité : 1 (essentielle), 2 (importante), 3 (secondaire)

KEYWORD VARIATIONS — catégorise en 3 groupes :
- semantic : synonymes et reformulations du mot-clé principal (3-5)
- long_tail : extensions longue traîne exploitables comme H2/H3 (3-5)
- related_questions : questions que les utilisateurs posent (type PAA Google) (3-5)

RETOURNE JSON brut uniquement :
{
  "intent": "informational | commercial_investigation | transactional | navigational | local",
  "intent_mix": { "informational": 30, "commercial": 50, "transactional": 20 },
  "sub_intents": [
    { "label": "description claire", "type": "question | action | comparison | definition | list", "priority": 1 }
  ],
  "user_stage": "débutant | intermédiaire | avancé",
  "keyword_variations": {
    "semantic": ["synonyme 1", "synonyme 2"],
    "long_tail": ["extension longue traîne 1"],
    "related_questions": ["question utilisateur 1 ?"]
  },
  "content_lifespan": "evergreen | seasonal | trending",
  "search_volume_signal": "high | medium | low | unknown",
  "featured_snippet_opportunity": { "likely": true, "format": "paragraph | list | table | none" }
}`,
      }],
    }
  );

  const parsed = parseAiJson<IntentOutput>(result.text);
  if (parsed?.intent && parsed?.sub_intents) return parsed;

  // P7 — Fallback intelligent
  const heuristic = intentKeywordHeuristic(input.keyword);
  return {
    intent: heuristic.intent,
    intent_mix: { informational: heuristic.intent === "informational" ? 80 : 20, commercial: heuristic.intent === "commercial_investigation" ? 80 : 20, transactional: heuristic.intent === "transactional" ? 80 : 10 },
    sub_intents: [],
    user_stage: "intermédiaire",
    keyword_variations: { semantic: [], long_tail: [], related_questions: [] },
    content_lifespan: "evergreen",
    search_volume_signal: "unknown",
    featured_snippet_opportunity: { likely: false, format: "none" },
  };
}

// ── Agent 2 : SERP ───────────────────────────────────────────────────────────

async function fetchGoogleSerpUrls(keyword: string, lang: string): Promise<string[]> {
  try {
    const hl = lang === "fr" ? "fr" : lang === "es" ? "es" : lang === "de" ? "de" : "en";
    const res = await fetch(
      `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=${hl}&num=8&gl=${hl}`,
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
    const urls = [...html.matchAll(/href="\/url\?q=([^&"]+)/g)]
      .map(m => decodeURIComponent(m[1]))
      .filter(u => u.startsWith("http") && !u.includes("google.") && !u.includes("youtube.") && !u.includes("wikipedia."));
    if (urls.length < 3) {
      const direct = [...html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>/g)]
        .map(m => m[1])
        .filter(u => !u.includes("google.") && !u.includes("youtube.") && !u.includes("accounts."));
      return [...new Set([...urls, ...direct])].slice(0, 5);
    }
    return urls.slice(0, 5);
  } catch { return []; }
}

async function scrapeSerpPage(url: string): Promise<{ title: string; headings: string[]; summary: string; wordCount: number } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 8).map(m => m[1].replace(/<[^>]+>/g, "").trim());
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      title: titleMatch?.[1]?.trim() ?? "",
      headings: h2s.filter(Boolean),
      summary: text.slice(0, 600),
      wordCount: text.split(/\s+/).filter(Boolean).length,
    };
  } catch { return null; }
}

async function runSerpAgent(input: PipelineInput, ctx: RankpillContext, intent: IntentOutput): Promise<SerpOutput> {
  // Scrape SERP
  const urls = await fetchGoogleSerpUrls(input.keyword, input.language);
  const scraped = (await Promise.all(urls.map(u => scrapeSerpPage(u)))).filter(Boolean);

  const serpInput = scraped.map(r => ({
    title: r!.title,
    headings: r!.headings.slice(0, 6),
    summary: r!.summary.slice(0, 400),
    wordCount: r!.wordCount,
  }));

  const dataSource: "scraped" | "estimated" = scraped.length >= 3 ? "scraped" : "estimated";

  const serpDataBlock = scraped.length > 0
    ? `RÉSULTATS SERP TOP ${scraped.length} (données scrapées) :\n${serpInput.map((r, i) => `#${i + 1} "${r.title}" — ${r.wordCount} mots, ${r.headings.length} H2 : ${r.headings.join(" | ")}\nExtrait : ${r.summary.slice(0, 200)}...`).join("\n\n")}`
    : `Aucun résultat SERP récupéré (blocage Google). Analyse basée sur tes connaissances SEO pour "${input.keyword}". Marque tes estimations comme telles.`;

  // Calcul benchmark local si données scrapées (P5)
  const avgWordCount = scraped.length > 0 ? Math.round(scraped.reduce((sum, r) => sum + r!.wordCount, 0) / scraped.length) : 0;
  const avgHeadings = scraped.length > 0 ? Math.round(scraped.reduce((sum, r) => sum + r!.headings.length, 0) / scraped.length) : 0;

  const result = await aiCall(
    { task: "serp_analysis" },
    {
      // P3 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un SERP Analyst senior spécialisé en intelligence concurrentielle SEO. Tu analyses les pages de résultats Google avec la rigueur d'un analyste data et l'oeil stratégique d'un consultant SEO.

Tu maîtrises :
- L'analyse des SERP features (featured snippets, PAA, video/image packs, knowledge panels, local packs)
- Le reverse-engineering des stratégies de contenu des pages positionnées
- L'identification des gaps exploitables que la concurrence ignore
- Le scoring de difficulté concurrentielle basé sur les signaux observables

Ta sortie alimente l'Agent 3 (Différenciation) et l'Agent 4 (Structure) — la qualité de ton analyse détermine la pertinence de l'angle éditorial et de l'architecture de page.`,
      messages: [{
        role: "user",
        content: `Analyse la SERP Google pour "${input.keyword}" (business: "${input.business_name}", secteur: ${input.industry}).

INTENTION DE RECHERCHE (Agent 1) :
- Intent dominant : ${intent.intent} (mix: info ${intent.intent_mix.informational}% / commercial ${intent.intent_mix.commercial}% / transac ${intent.intent_mix.transactional}%)
- User stage : ${intent.user_stage}
- Sous-intentions : ${intent.sub_intents.map(s => `${s.label} [${s.type}]`).join(", ")}
- Featured snippet probable : ${intent.featured_snippet_opportunity.likely ? `oui (${intent.featured_snippet_opportunity.format})` : "non"}
- Content lifespan : ${intent.content_lifespan}

${serpDataBlock}

${scraped.length > 0 ? `BENCHMARK CALCULÉ : word count moyen ${avgWordCount} mots, ${avgHeadings} H2 en moyenne` : ""}
${ctx.roadmap ? `ROADMAP SEO : phase ${ctx.roadmap.phase}, priorité ${ctx.roadmap.priority}, objectif: ${ctx.roadmap.objective}` : ""}
${ctx.cluster ? `CLUSTER SEO : ${ctx.cluster}` : ""}

ANALYSE DEMANDÉE :

1. PATTERNS — Identifie les patterns récurrents dans les pages positionnées (formats, angles, types de contenu, structures)
2. WEAKNESSES — Détecte les faiblesses exploitables (contenu daté, faible profondeur, mauvaise UX, manque de data)
3. CONTENT GAPS — Repère ce que PERSONNE ne couvre bien (sous-intentions non satisfaites, questions sans réponse, angles ignorés)
4. SERP FEATURES — Détecte quelles features Google sont présentes pour ce keyword (utilise les données scrapées + tes connaissances)
5. COMPETITIVE BENCHMARK — Évalue la difficulté concurrentielle :
   - low : contenu faible/daté, peu de concurrents sérieux
   - medium : quelques pages solides mais des gaps exploitables
   - high : pages bien optimisées, beaucoup de contenu de qualité
   - very_high : SERP dominée par des autorités (Wikipedia, sites gouvernementaux, grandes marques)
6. OPPORTUNITIES — Liste 3-5 opportunités concrètes avec priorité (1=critique, 2=importante, 3=bonus)

RETOURNE JSON brut uniquement :
{
  "patterns": ["pattern 1", "pattern 2"],
  "weaknesses": ["faiblesse exploitable 1", "faiblesse 2"],
  "content_gaps": ["gap non couvert 1", "gap 2"],
  "serp_features": {
    "featured_snippet": true/false,
    "paa": true/false,
    "video_pack": true/false,
    "image_pack": true/false,
    "knowledge_panel": true/false,
    "local_pack": true/false
  },
  "competitive_benchmark": {
    "avg_word_count": ${avgWordCount || '"estimer"'},
    "avg_headings_count": ${avgHeadings || '"estimer"'},
    "difficulty_estimate": "low | medium | high | very_high",
    "top_formats": ["format dominant 1", "format 2"]
  },
  "opportunities": [
    { "type": "content_gap | format | depth | freshness | snippet", "description": "description", "priority": 1 }
  ]
}`,
      }],
    }
  );

  const parsed = parseAiJson<SerpOutput>(result.text);
  if (parsed?.patterns && parsed?.serp_features) {
    parsed.data_source = dataSource;
    // Injecter le benchmark calculé si l'AI n'a pas rempli
    if (avgWordCount > 0 && (!parsed.competitive_benchmark?.avg_word_count || parsed.competitive_benchmark.avg_word_count === 0)) {
      parsed.competitive_benchmark = {
        ...parsed.competitive_benchmark,
        avg_word_count: avgWordCount,
        avg_headings_count: avgHeadings,
      };
    }
    return parsed;
  }

  // P7 — Fallback structuré
  return {
    patterns: [],
    weaknesses: [],
    content_gaps: [],
    serp_features: {
      featured_snippet: intent.featured_snippet_opportunity.likely,
      paa: intent.intent === "informational" || intent.intent === "commercial_investigation",
      video_pack: false,
      image_pack: false,
      knowledge_panel: false,
      local_pack: intent.intent === "local",
    },
    competitive_benchmark: {
      avg_word_count: avgWordCount || 1500,
      avg_headings_count: avgHeadings || 6,
      difficulty_estimate: "medium",
      top_formats: [],
    },
    opportunities: [],
    data_source: "estimated",
  };
}

// ── Agent 3 : Diff ───────────────────────────────────────────────────────────

async function runDiffAgent(input: PipelineInput, ctx: RankpillContext, intent: IntentOutput, serp: SerpOutput): Promise<DiffOutput> {
  // Données cocon sémantique formatées (P7)
  const cocoonBlock = ctx.cocoon
    ? `COCON SÉMANTIQUE :
- Type de page : ${ctx.cocoon.page_type}
- Cluster : ${ctx.cocoon.cluster}
- Relation au pilier : ${ctx.cocoon.pillar_relation}
- Pages sœurs : ${ctx.cocoon.sibling_keywords.join(", ")}`
    : "Pas de cocon sémantique défini — article standalone.";

  const result = await aiCall(
    { task: "roadmap_strategy" },
    {
      // P3 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un Stratège SEO Éditorial senior spécialisé en positionnement différenciant. Tu combines les frameworks de différenciation (Blue Ocean, USP, content gap exploitation) avec une expertise SEO avancée.

Tu sais que :
- Un article sans angle différenciant sera un clone SERP de plus → pas de ranking
- L'angle doit être ACTIONNABLE : il doit se traduire en choix concrets de ton, format, profondeur et structure
- La stratégie de contenu doit être calibrée sur le benchmark concurrentiel (faire mieux, pas pareil)
- Le positionnement dans le cocon sémantique conditionne le maillage interne et l'autorité topique

Ta sortie est la directive éditoriale pour les agents Structure (4) et Content (5) — elle doit être suffisamment précise pour guider la rédaction.`,
      messages: [{
        role: "user",
        content: `Crée une stratégie de différenciation complète pour "${input.keyword}" (business: "${input.business_name}", secteur: ${input.industry}).

INTENTION DE RECHERCHE (Agent 1) :
- Intent : ${intent.intent} (mix: info ${intent.intent_mix.informational}% / commercial ${intent.intent_mix.commercial}% / transac ${intent.intent_mix.transactional}%)
- User stage : ${intent.user_stage}
- Sous-intentions : ${intent.sub_intents.map(s => `${s.label} [${s.type}, P${s.priority}]`).join(", ")}
- Content lifespan : ${intent.content_lifespan}
- Featured snippet : ${intent.featured_snippet_opportunity.likely ? `oui (${intent.featured_snippet_opportunity.format})` : "non"}
- Keywords sémantiques : ${intent.keyword_variations.semantic.join(", ")}

ANALYSE SERP (Agent 2, ${serp.data_source === "scraped" ? "données réelles" : "estimations"}) :
- Patterns : ${serp.patterns.join(" | ") || "aucun"}
- Faiblesses exploitables : ${serp.weaknesses.join(" | ") || "aucune"}
- Content gaps : ${serp.content_gaps.join(" | ") || "aucun"}
- Difficulté : ${serp.competitive_benchmark.difficulty_estimate} (benchmark: ${serp.competitive_benchmark.avg_word_count} mots, ${serp.competitive_benchmark.avg_headings_count} H2)
- Formats dominants : ${serp.competitive_benchmark.top_formats.join(", ") || "non identifiés"}
- SERP features : ${[serp.serp_features.featured_snippet && "featured snippet", serp.serp_features.paa && "PAA", serp.serp_features.video_pack && "vidéos", serp.serp_features.image_pack && "images", serp.serp_features.knowledge_panel && "knowledge panel", serp.serp_features.local_pack && "local pack"].filter(Boolean).join(", ") || "aucune"}
- Opportunités P1 : ${serp.opportunities.filter(o => o.priority === 1).map(o => o.description).join(" | ") || "aucune"}

${cocoonBlock}
${ctx.roadmap ? `ROADMAP SEO : phase ${ctx.roadmap.phase}, priorité ${ctx.roadmap.priority}, objectif: ${ctx.roadmap.objective}` : "Pas de roadmap disponible."}

RÈGLES DE DIFFÉRENCIATION :

ANGLE — Trouve ce que la concurrence ne fait PAS ou fait MAL :
- Exploite les content gaps et faiblesses SERP identifiés par l'Agent 2
- L'angle doit être spécifique et mémorable (pas "guide complet" ou "tout savoir sur")
- Aligne l'angle avec les sous-intentions prioritaires (P1) de l'utilisateur

TONE OF VOICE — Choisis en fonction du user_stage et de l'intent :
- "expert" : audience avancée, intent informationnel profond → jargon assumé, insights pointus
- "accessible" : débutant, intent informationnel large → vulgarisation, analogies, pas de jargon
- "provocateur" : commercial_investigation → remise en question des idées reçues, prise de position
- "didactique" : informationnel + débutant/intermédiaire → pas-à-pas, exemples concrets
- "data-driven" : transactionnel ou commercial → chiffres, comparatifs, preuves, ROI

CONTENT STRATEGY — Calibre sur le benchmark SERP :
- target_word_count : si difficulté high/very_high → benchmark × 1.3 ; si medium → benchmark × 1.1 ; si low → min 1200 mots
- depth_level : "survol" (intro rapide), "approfondi" (couvre les sous-intentions P1+P2), "exhaustif" (toutes sous-intentions + données exclusives)
- recommended_format : déduis du format dominant SERP + intent (guide, listicle, comparatif, tutoriel, étude de cas, FAQ étendue...)
- differentiators : 3-5 éléments concrets qui rendent cet article différent (data exclusive, angle inédit, format innovant, expertise terrain)

COCOON POSITIONING — Positionne dans le cocon sémantique :
- role : "pillar" (article fondation du cluster), "support" (approfondit un aspect du pilier), "complementary" (angle connexe), "standalone" (hors cocon)
- relation_to_cluster : comment cet article renforce le cluster et le maillage interne

RETOURNE JSON brut uniquement :
{
  "angle": "angle différenciant en 1 phrase percutante",
  "promise": "promesse de valeur pour le lecteur en 1 phrase",
  "positioning": "comment cet article se positionne vs la concurrence",
  "unique_elements": ["élément différenciant 1", "élément 2", "..."],
  "tone_of_voice": "expert | accessible | provocateur | didactique | data-driven",
  "content_strategy": {
    "target_word_count": 1800,
    "depth_level": "survol | approfondi | exhaustif",
    "recommended_format": "format recommandé",
    "differentiators": ["différenciateur 1", "différenciateur 2"]
  },
  "cocoon_positioning": {
    "role": "pillar | support | complementary | standalone",
    "relation_to_cluster": "explication du rôle dans le cocon"
  }
}`,
      }],
    }
  );

  const parsed = parseAiJson<DiffOutput>(result.text);
  if (parsed?.angle && parsed?.tone_of_voice && parsed?.content_strategy) return parsed;

  // P6 — Fallback intelligent basé sur intent + SERP
  const benchmarkWc = serp.competitive_benchmark.avg_word_count || 1500;
  const difficultyMultiplier = serp.competitive_benchmark.difficulty_estimate === "very_high" ? 1.3
    : serp.competitive_benchmark.difficulty_estimate === "high" ? 1.2 : 1.1;

  return {
    angle: `Guide ${intent.intent === "commercial_investigation" ? "comparatif" : "actionnable"} sur ${input.keyword}`,
    promise: `Tout ce qu'il faut savoir sur ${input.keyword} pour ${intent.user_stage === "débutant" ? "bien démarrer" : "passer au niveau supérieur"}`,
    positioning: "Contenu plus complet et à jour que la concurrence",
    unique_elements: serp.content_gaps.slice(0, 3),
    tone_of_voice: intent.user_stage === "avancé" ? "expert" : intent.user_stage === "débutant" ? "accessible" : "didactique",
    content_strategy: {
      target_word_count: Math.round(benchmarkWc * difficultyMultiplier),
      depth_level: intent.sub_intents.length > 4 ? "exhaustif" : "approfondi",
      recommended_format: serp.competitive_benchmark.top_formats[0] ?? "guide",
      differentiators: [],
    },
    cocoon_positioning: {
      role: ctx.cocoon?.page_type ?? "standalone",
      relation_to_cluster: ctx.cocoon ? `Support du cluster ${ctx.cocoon.cluster}` : "Article standalone",
    },
  };
}

// ── Agent 4 : Structure ──────────────────────────────────────────────────────

async function runStructureAgent(input: PipelineInput, ctx: RankpillContext, intent: IntentOutput, diff: DiffOutput, serp: SerpOutput): Promise<StructureOutput> {
  const result = await aiCall(
    { task: "content_structure" },
    {
      // P2 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un Architecte de Contenu SEO senior spécialisé en structure de pages à forte performance organique. Tu combines UX writing, information architecture et SEO technique.

Tu maîtrises :
- La hiérarchie de headings (H1 → H2 → H3) et son impact sur le crawl sémantique
- L'information scent : chaque bloc doit répondre à une promesse claire pour le lecteur
- Le F-pattern / inverted pyramid : information critique en haut, détails en bas
- L'optimisation featured snippet : structurer le contenu pour capturer la position 0
- Le calibrage du nombre de sections basé sur le benchmark concurrentiel

Ta structure est le plan de construction que l'Agent 5 (Content) va exécuter — elle doit être suffisamment détaillée pour guider la rédaction sans ambiguïté.`,
      messages: [{
        role: "user",
        content: `Crée une structure de page optimisée pour "${input.keyword}" (business: "${input.business_name}", secteur: ${input.industry}).

INTENTION DE RECHERCHE (Agent 1) :
- Intent : ${intent.intent} (mix: info ${intent.intent_mix.informational}% / commercial ${intent.intent_mix.commercial}% / transac ${intent.intent_mix.transactional}%)
- Sous-intentions : ${intent.sub_intents.map(s => `"${s.label}" [${s.type}, P${s.priority}]`).join(", ")}
- User stage : ${intent.user_stage}
- Content lifespan : ${intent.content_lifespan}
- Featured snippet : ${intent.featured_snippet_opportunity.likely ? `OUI → format ${intent.featured_snippet_opportunity.format}` : "non probable"}
- Questions utilisateurs : ${intent.keyword_variations.related_questions.join(", ")}

STRATÉGIE ÉDITORIALE (Agent 3) :
- Angle : ${diff.angle}
- Ton : ${diff.tone_of_voice}
- Format recommandé : ${diff.content_strategy.recommended_format}
- Profondeur : ${diff.content_strategy.depth_level}
- Target : ${diff.content_strategy.target_word_count} mots
- Différenciateurs : ${diff.content_strategy.differentiators.join(", ") || "aucun"}
- Rôle cocon : ${diff.cocoon_positioning.role}

BENCHMARK SERP (Agent 2) :
- H2 moyen concurrence : ${serp.competitive_benchmark.avg_headings_count}
- Word count moyen : ${serp.competitive_benchmark.avg_word_count} mots
- Difficulté : ${serp.competitive_benchmark.difficulty_estimate}
- SERP features actives : ${[serp.serp_features.featured_snippet && "featured snippet", serp.serp_features.paa && "PAA", serp.serp_features.video_pack && "vidéos", serp.serp_features.image_pack && "images"].filter(Boolean).join(", ") || "aucune"}

CLUSTER : ${ctx.cluster ?? "non défini"}

RÈGLES DE STRUCTURATION :

MAPPING SOUS-INTENTIONS → SECTIONS (P3) :
- Sous-intention P1 (essentielle) → section H2 dédiée obligatoire
- Sous-intention P2 (importante) → section H2 ou intégrée dans une section P1 existante
- Sous-intention P3 (secondaire) → intégrable en FAQ ou omise si hors-scope
- Les related_questions de l'Agent 1 alimentent les FAQ

BLOCS DISPONIBLES :
- hero : toujours inclus — H1 + subtitle + promesse
- quick_answer : réponse directe en 2-3 phrases (obligatoire si featured snippet probable)
- stats : bloc chiffres clés (si intent data-driven ou comparatif)
- sections : blocs H2 principaux — le cœur du contenu
- comparison : tableau comparatif (si intent commercial_investigation ou sous-intention "comparison")
- insights : tips/warnings/pro tips (si intent informationnel + user stage débutant/intermédiaire)
- mistakes : erreurs à éviter (si intent informationnel ou didactique, PAS pour transactionnel)
- faq : questions/réponses — alimenté par les related_questions et sous-intentions P3
- cta : appel à l'action (toujours en dernier)

CALIBRAGE (P5) :
- Nombre de H2 sections : benchmark concurrence ${serp.competitive_benchmark.avg_headings_count} H2 → vise ${serp.competitive_benchmark.avg_headings_count + 1}-${serp.competitive_benchmark.avg_headings_count + 3} H2 pour surpasser
- Répartition mots par section : ${diff.content_strategy.target_word_count} mots ÷ nombre de sections

FEATURED SNIPPET (P4) :
${intent.featured_snippet_opportunity.likely
  ? `- Format cible : ${intent.featured_snippet_opportunity.format}
- Si "paragraph" → quick_answer doit contenir une définition/réponse concise (40-60 mots)
- Si "list" → premier H2 doit être une liste à puces/numérotée
- Si "table" → inclure un bloc comparison avec tableau structuré`
  : "- Pas de stratégie snippet spécifique"}

RETOURNE JSON brut uniquement :
{
  "blocks": ["hero", "quick_answer", "sections", "..."],
  "sections_plan": [
    {
      "h2": "Titre H2 proposé",
      "sub_intent_covered": "label de la sous-intention couverte",
      "estimated_words": 300,
      "key_points": ["point clé 1 à couvrir", "point clé 2"]
    }
  ],
  "snippet_strategy": {
    "target_block": "quick_answer | premier H2 | comparison | none",
    "format": "paragraph | list | table | none",
    "instruction": "consigne précise pour l'Agent 5"
  },
  "target_sections_count": 6
}`,
      }],
    }
  );

  const parsed = parseAiJson<StructureOutput>(result.text);
  if (parsed?.blocks && parsed?.sections_plan && parsed.sections_plan.length > 0) return parsed;

  // P6 — Fallback intelligent basé sur intent + diff
  const isTransactional = intent.intent === "transactional";
  const isCommercial = intent.intent === "commercial_investigation";
  const fallbackBlocks = [
    "hero",
    ...(intent.featured_snippet_opportunity.likely ? ["quick_answer"] : []),
    ...(isCommercial ? ["comparison"] : []),
    "sections",
    ...(!isTransactional ? ["insights"] : []),
    ...(!isTransactional && !isCommercial ? ["mistakes"] : []),
    "faq",
    "cta",
  ];
  const fallbackSections = intent.sub_intents
    .filter(s => s.priority <= 2)
    .map(s => ({
      h2: s.label,
      sub_intent_covered: s.label,
      estimated_words: Math.round(diff.content_strategy.target_word_count / Math.max(intent.sub_intents.filter(si => si.priority <= 2).length, 3)),
      key_points: [],
    }));

  return {
    blocks: fallbackBlocks,
    sections_plan: fallbackSections.length > 0 ? fallbackSections : [
      { h2: `Comprendre ${input.keyword}`, sub_intent_covered: "définition", estimated_words: 400, key_points: [] },
      { h2: `Comment ${input.keyword}`, sub_intent_covered: "action", estimated_words: 400, key_points: [] },
      { h2: `Conseils pour ${input.keyword}`, sub_intent_covered: "tips", estimated_words: 300, key_points: [] },
    ],
    snippet_strategy: {
      target_block: intent.featured_snippet_opportunity.likely ? "quick_answer" : "none",
      format: intent.featured_snippet_opportunity.format,
      instruction: intent.featured_snippet_opportunity.likely ? "Réponse directe en 40-60 mots" : "Pas de stratégie snippet",
    },
    target_sections_count: fallbackSections.length || 3,
  };
}

// ── Agent 5 : Content ────────────────────────────────────────────────────────

async function runContentAgent(
  input: PipelineInput, ctx: RankpillContext,
  intent: IntentOutput, diff: DiffOutput, structure: StructureOutput,
): Promise<ContentOutput> {
  // P5 — Données GSC pour renforcer les positions existantes
  const gscTerms = ctx.gsc_data?.queries
    .filter(q => q.impressions > 50)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15)
    .map(q => `"${q.query}" (pos ${q.position}, ${q.impressions} imp)`) ?? [];

  // P7 — Pages existantes pour préparer le maillage interne
  const linkablePages = ctx.existing_pages.slice(0, 10).map(p => `"${p.keyword}" → ${p.url}`);

  // P4 — Blocs optionnels
  const hasStats = structure.blocks.includes("stats");
  const hasComparison = structure.blocks.includes("comparison");

  const result = await aiCall(
    { task: "content_generation" },
    {
      // P1 — Rôle system enrichi E-E-A-T + NLP
      system: `${systemContext(ctx, input)}\n\nTu es un Rédacteur SEO Expert senior spécialisé en contenu à forte performance organique. Tu écris en ${input.language}.

Tu maîtrises :
- L'optimisation NLP : couverture d'entités, densité sémantique, co-occurrences de termes
- Les critères E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) : démontrer l'expertise par des données, des exemples vécus, des sources
- Le SEO on-page : placement stratégique du keyword principal, LSI keywords dans les H2 et premiers paragraphes
- La rédaction scannable : F-pattern, inverted pyramid, hooks en début de chaque section
- L'optimisation featured snippet : structuration du contenu pour capturer la position 0

Tu ne rédiges JAMAIS de contenu générique. Chaque phrase doit apporter une information, une donnée ou un angle que le lecteur ne trouvera pas sur les 5 premiers résultats Google.

Ta sortie est le contenu final qui sera publié — il doit être prêt pour le CMS sans retouche.`,
      messages: [{
        role: "user",
        content: `Rédige la page SEO complète pour "${input.keyword}" (business: "${input.business_name}", secteur: ${input.industry}).

INTENTION : ${intent.intent} (mix: info ${intent.intent_mix.informational}% / commercial ${intent.intent_mix.commercial}% / transac ${intent.intent_mix.transactional}%)
SOUS-INTENTIONS : ${intent.sub_intents.map(s => `${s.label} [${s.type}, P${s.priority}]`).join(", ")}
STAGE UTILISATEUR : ${intent.user_stage}
FEATURED SNIPPET : ${intent.featured_snippet_opportunity.likely ? `OUI → format ${intent.featured_snippet_opportunity.format}` : "non"}

STRATÉGIE ÉDITORIALE (Agent 3) :
- Angle : ${diff.angle}
- Promesse : ${diff.promise}
- Éléments uniques : ${diff.unique_elements.join(", ")}
- Ton : ${diff.tone_of_voice}
- Format : ${diff.content_strategy.recommended_format}
- Profondeur : ${diff.content_strategy.depth_level}
- Différenciateurs : ${diff.content_strategy.differentiators.join(", ") || "aucun spécifié"}

STRUCTURE IMPOSÉE (Agent 4) — RESPECTE CES H2 ET BUDGETS :
- Blocs : ${structure.blocks.join(", ")}
- Sections H2 (${structure.target_sections_count}) :
${structure.sections_plan.map((s, i) => `  ${i + 1}. "${s.h2}" — ~${s.estimated_words} mots — couvre: ${s.sub_intent_covered}${s.key_points.length > 0 ? `\n     Points clés obligatoires : ${s.key_points.join(", ")}` : ""}`).join("\n")}
- Snippet : ${structure.snippet_strategy.format !== "none" ? `${structure.snippet_strategy.instruction} (bloc: ${structure.snippet_strategy.target_block}, format: ${structure.snippet_strategy.format})` : "pas de stratégie snippet"}

MOTS-CLÉS À INTÉGRER NATURELLEMENT :
- Keyword principal : "${input.keyword}" — placer dans H1, premier paragraphe, au moins 2 H2, et conclusion
- Sémantiques : ${intent.keyword_variations.semantic.join(", ")}
- Longue traîne (utiliser comme H2/H3 ou dans le contenu) : ${intent.keyword_variations.long_tail.join(", ")}
- Questions utilisateurs (alimentent la FAQ) : ${intent.keyword_variations.related_questions.join(", ")}
${gscTerms.length > 0 ? `\nTERMES GSC À RENFORCER (déjà positionnés — intègre-les naturellement pour consolider) :\n${gscTerms.join(", ")}` : ""}
${linkablePages.length > 0 ? `\nPAGES EXISTANTES (mentionne naturellement ces sujets pour préparer le maillage interne) :\n${linkablePages.join("\n")}` : ""}

CLUSTER : ${ctx.cluster ?? "non défini"}
RÔLE COCON : ${diff.cocoon_positioning.role}

RÈGLES SEO ON-PAGE (P2) :
- Keyword principal "${input.keyword}" : dans le H1, dans les 100 premiers mots, dans au moins 2 H2, dans la conclusion
- Utilise <strong> pour le keyword principal (1-2 fois max) et les termes sémantiques importants — cela signale le poids sémantique aux crawlers
- Densité keyword : 1-2% naturelle, JAMAIS de bourrage
- Chaque section commence par un hook (question, stat, affirmation forte) — pas par "Dans cette section..."
- Paragraphes courts : 2-3 phrases max, séparés par des <p>
- Listes à puces pour les énumérations de 3+ éléments
- Au moins 1 donnée chiffrée ou exemple concret par section

RÈGLES DE RÉDACTION :
- Adopte le ton "${diff.tone_of_voice}" : ${diff.tone_of_voice === "expert" ? "jargon technique assumé, insights pointus, références sectorielles" : diff.tone_of_voice === "accessible" ? "vulgarisation avec analogies, zéro jargon, exemples du quotidien" : diff.tone_of_voice === "provocateur" ? "remise en question, prise de position forte, ton incisif, interpellation directe" : diff.tone_of_voice === "didactique" ? "pas-à-pas numérotés, exemples concrets à chaque étape, pédagogie progressive" : "chiffres vérifiables, comparatifs, preuves, ROI, tableaux de données"}
- Voix active, directe, zéro filler
- INTERDIT : "il est important de noter", "dans le monde actuel", "il convient de", "force est de constater", "il faut savoir que", "comme nous allons le voir", "dans cette section", "en conclusion", "pour résumer"
- INTERDIT : paragraphes de plus de 4 phrases, sections sans données/exemples, répétitions d'idées entre sections
- ${diff.content_strategy.target_word_count} mots total (profondeur : ${diff.content_strategy.depth_level})
- Tout en ${input.language}

RETOURNE JSON brut uniquement :
{
  "hero": {
    "title": "H1 contenant le keyword principal, orienté résultat (max 65 car.)",
    "subtitle": "sous-titre avec bénéfice clair",
    "promise": "promesse de valeur en 1 phrase",
    "cta": "texte CTA ou null"
  },
  "quick_answer": "réponse directe 40-60 mots — optimisée ${intent.featured_snippet_opportunity.likely ? intent.featured_snippet_opportunity.format : "snippet"}",
${hasStats ? `  "stats": [
    { "label": "description du chiffre", "value": "chiffre + unité", "source": "source optionnelle" }
  ],` : ""}
${hasComparison ? `  "comparison": {
    "headers": ["Critère", "Option A", "Option B"],
    "rows": [["critère 1", "valeur A", "valeur B"]]
  },` : ""}
  "sections": [
    {
      "title": "H2 du sections_plan (respecter l'ordre et les titres)",
      "content": "HTML riche (<p>, <ul>, <li>, <strong>, <em>) — respecter le budget mots estimé",
      "tip": "conseil actionnable en 1 phrase (optionnel)",
      "example": "exemple concret et spécifique (optionnel)"
    }
  ],
  "insights": [
    { "type": "tip | warning | pro", "text": "insight court et percutant" }
  ],
  "mistakes": [
    { "title": "erreur concrète", "why": "explication causale", "consequence": "impact mesurable" }
  ],
  "faq": [
    { "question": "question naturelle (issue des related_questions) ?", "answer": "réponse directe 40-60 mots" }
  ],
  "cta": "conclusion actionnable 2-3 phrases avec rappel de la promesse",
  "pexels_query": "3-5 english keywords for relevant cover image",
  "cover_alt_text": "alt text SEO descriptif 8-12 mots incluant le keyword",
  "section_image_queries": ["query en anglais section 1", "query section 2", "query section 3"]
}`,
      }],
    }
  );

  const parsed = parseAiJson<ContentOutput>(result.text);
  if (!parsed?.sections?.length) {
    throw new Error("Agent Content : réponse invalide ou vide");
  }
  return parsed;
}

// ── Agent 6 : Linking ────────────────────────────────────────────────────────

async function runLinkingAgent(
  input: PipelineInput, ctx: RankpillContext,
  intent: IntentOutput, diff: DiffOutput, content: ContentOutput,
): Promise<LinkingOutput> {
  if (ctx.existing_pages.length === 0) {
    return { links: [], strategy_summary: "Aucune page existante — maillage impossible" };
  }

  // P6 — Nombre de liens adaptatif
  const sectionCount = content.sections.length;
  const clusterPages = ctx.cocoon
    ? ctx.existing_pages.filter(p => p.keyword && ctx.cocoon!.sibling_keywords.some(sk => p.keyword.toLowerCase().includes(sk.toLowerCase())))
    : [];
  const minLinks = Math.max(2, Math.min(sectionCount - 1, 3));
  const maxLinks = Math.min(sectionCount + 1, 6, ctx.existing_pages.length);

  // P2 — Données GSC pour prioriser les liens vers pages à booster
  const gscPages = ctx.gsc_data?.pages
    .filter(p => p.position > 5 && p.position < 30 && p.impressions > 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5)
    .map(p => `${p.url} (pos ${p.position}, ${p.impressions} imp — à booster)`) ?? [];

  const result = await aiCall(
    { task: "internal_linking" },
    {
      // P3 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un Architecte de Maillage Interne senior. Tu conçois des stratégies de liens internes qui maximisent le flux de PageRank, renforcent l'autorité topique et améliorent le crawl budget.

Tu maîtrises :
- La distribution du PageRank via les liens internes (pages piliers → supports → complémentaires)
- Les types d'ancres et leur impact : exact_match (puissant mais risqué), partial_match (équilibré), semantic (thématique), contextual (naturel), branded (safe)
- Le placement contextuel : un lien inséré naturellement dans un paragraphe pertinent a plus de poids qu'un lien en fin de section
- La règle du cluster : liens intra-cluster prioritaires pour renforcer l'autorité topique
- L'équilibre SEO/UX : chaque lien doit servir le lecteur ET les moteurs

Ta sortie est exécutée directement dans le HTML — les ancres et placements doivent être exploitables sans retouche.`,
      messages: [{
        role: "user",
        content: `Conçois le maillage interne pour la page "${input.keyword}" (business: "${input.business_name}").

PAGE ACTUELLE :
- Keyword : "${input.keyword}"
- Titre H1 : "${content.hero.title}"
- Intent : ${intent.intent} (user stage: ${intent.user_stage})
- Ton : ${diff.tone_of_voice}
- Rôle cocon : ${diff.cocoon_positioning.role}
- Sections H2 : ${content.sections.map((s, i) => `${i + 1}. "${s.title}"`).join(", ")}

PAGES EXISTANTES (cibles potentielles) :
${ctx.existing_pages.slice(0, 30).map(p => `- "${p.title}" (kw: "${p.keyword}") → ${p.url}`).join("\n")}

${clusterPages.length > 0 ? `PAGES DU MÊME CLUSTER (prioritaires) :\n${clusterPages.map(p => `- "${p.title}" → ${p.url}`).join("\n")}` : ""}
${ctx.cocoon ? `COCON SÉMANTIQUE : cluster "${ctx.cocoon.cluster}", type ${ctx.cocoon.page_type}, relation: ${ctx.cocoon.pillar_relation}\nPages sœurs : ${ctx.cocoon.sibling_keywords.join(", ")}` : ""}
${gscPages.length > 0 ? `\nPAGES GSC À BOOSTER (position 5-30, fort potentiel) :\n${gscPages.join("\n")}` : ""}

RÈGLES DE MAILLAGE :

NOMBRE DE LIENS : ${minLinks} à ${maxLinks} liens (adapté à ${sectionCount} sections et ${ctx.existing_pages.length} pages existantes)

DISTRIBUTION DES ANCRES (P7 — diversité obligatoire) :
- Maximum 1 ancre exact_match (keyword cible de la page liée tel quel)
- 1-2 ancres partial_match (variation du keyword cible)
- 1-2 ancres semantic ou contextual (reformulation naturelle, phrase intégrée)
- INTERDIT : "cliquez ici", "en savoir plus", "lire la suite", ancres génériques
- L'ancre doit s'intégrer grammaticalement dans une phrase du contenu

PRIORITÉ DE SÉLECTION :
1. Pages du même cluster sémantique (renforce l'autorité topique)
2. Pages GSC en position 5-30 (boost de liens internes = gain de positions)
3. Pages thématiquement proches (même secteur, sujet connexe)
4. Pages piliers si l'article actuel est support/complémentaire

PLACEMENT :
- Indique le titre H2 de la section où placer chaque lien
- Place les liens dans les sections les plus pertinentes sémantiquement (pas tous dans la même section)
- Répartis les liens sur différentes sections

OBJECTIF PAR LIEN :
- "seo" : transfert de PageRank, boost de position
- "ux" : aide le lecteur à approfondir un sujet mentionné
- "conversion" : guide vers une page transactionnelle/service

RETOURNE JSON brut uniquement :
{
  "links": [
    {
      "target_url": "URL exacte d'une page existante",
      "anchor": "texte d'ancrage naturel intégrable dans une phrase",
      "anchor_type": "exact_match | partial_match | semantic | contextual | branded",
      "placement": "titre H2 de la section cible",
      "objective": "seo | ux | conversion",
      "priority": "haute | moyenne | faible",
      "justification": "pourquoi ce lien, cette ancre, ce placement"
    }
  ],
  "strategy_summary": "résumé en 1 phrase de la stratégie de maillage choisie"
}`,
      }],
    }
  );

  const parsed = parseAiJson<LinkingOutput>(result.text) ?? { links: [], strategy_summary: "" };

  // Validation stricte : ne garder que les liens dont l'URL existe réellement
  const knownUrls = new Set(ctx.existing_pages.map(p => p.url.replace(/\/$/, "").toLowerCase()));
  parsed.links = parsed.links.filter(link => {
    if (!link.target_url || !link.target_url.startsWith("http")) return false;
    const normalized = link.target_url.replace(/\/$/, "").toLowerCase();
    return knownUrls.has(normalized);
  });

  return parsed;
}

// ── Agent 7 : Risk ───────────────────────────────────────────────────────────

async function runRiskAgent(
  input: PipelineInput, ctx: RankpillContext, html: string,
  intent: IntentOutput, diff: DiffOutput, structure: StructureOutput, linking: LinkingOutput,
): Promise<RiskOutput> {
  // P6 — Calcul de densité côté serveur (fiable)
  const plainText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const kwLower = input.keyword.toLowerCase();
  const kwOccurrences = plainText.toLowerCase().split(kwLower).length - 1;
  const keywordDensity = wordCount > 0 ? Math.round((kwOccurrences / wordCount) * 1000) / 10 : 0;

  // P4 — Passer plus de contenu (8000 chars ~1300 mots)
  const htmlExtract = html.slice(0, 8000);

  // P5 — Résumé du maillage pour audit
  const linkingSummary = linking.links.length > 0
    ? linking.links.map(l => `→ "${l.anchor}" [${l.anchor_type}] vers ${l.target_url} (section: ${l.placement})`).join("\n")
    : "Aucun lien interne";

  // Pages existantes pour vérification cannibalisation
  const existingForCanni = ctx.existing_pages
    .filter(p => p.keyword && p.keyword.toLowerCase() !== kwLower)
    .slice(0, 15)
    .map(p => `"${p.title}" (kw: "${p.keyword}") → ${p.url}`);

  const result = await aiCall(
    { task: "risk_audit" },
    {
      // P3 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un Auditeur SEO Technique senior spécialisé en conformité et risques de contenu. Tu audites avec la rigueur d'un quality analyst et la vision stratégique d'un consultant SEO.

Tu connais :
- Les Google Search Quality Guidelines (Helpful Content System, Spam Policies)
- Les critères E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)
- Les signaux de contenu IA détectables (patterns répétitifs, transitions artificielles, manque de spécificité)
- Les seuils de sur-optimisation et les pénalités associées
- Les risques de cannibalisation et leur impact sur le crawl budget

Tu es le dernier filet de sécurité avant publication — ton audit doit être exhaustif et objectif. Un faux négatif (risque manqué) est pire qu'un faux positif (alerte excessive).`,
      messages: [{
        role: "user",
        content: `Audite ce contenu SEO pour le mot-clé "${input.keyword}" (business: "${input.business_name}", secteur: ${input.industry}).

MÉTRIQUES CALCULÉES (serveur, fiables) :
- Word count : ${wordCount} mots
- Densité keyword "${input.keyword}" : ${keywordDensity}% (${kwOccurrences} occurrences)

CONTENU HTML :
${htmlExtract}

STRATÉGIE PRÉVUE (contexte des agents précédents) :
- Intent : ${intent.intent} (user stage: ${intent.user_stage})
- Ton attendu : ${diff.tone_of_voice}
- Format attendu : ${diff.content_strategy.recommended_format}
- Profondeur attendue : ${diff.content_strategy.depth_level}
- Word count cible : ${diff.content_strategy.target_word_count} mots
- Sections planifiées (${structure.target_sections_count}) : ${structure.sections_plan.map(s => `"${s.h2}"`).join(", ")}
- Snippet strategy : ${structure.snippet_strategy.format} → ${structure.snippet_strategy.target_block}

MAILLAGE INTERNE INJECTÉ :
${linkingSummary}

${existingForCanni.length > 0 ? `PAGES EXISTANTES (vérifier cannibalisation) :\n${existingForCanni.join("\n")}` : "Aucune page existante."}

AUDIT DEMANDÉ — Vérifie chaque catégorie :

1. KEYWORD DENSITY (keyword_density) :
   - Densité serveur fournie : ${keywordDensity}%
   - Seuil safe : 0.5-2% → OK ; > 2% → warning ; > 3% → critical
   - Vérifie aussi la densité des variantes sémantiques

2. CANNIBALIZATION (cannibalization) :
   - Compare le keyword + H2 avec les pages existantes
   - Même keyword ou keyword très proche sur une autre page → critical
   - Chevauchement thématique fort → warning

3. THIN CONTENT (thin_content) :
   - Word count réel (${wordCount}) vs cible (${diff.content_strategy.target_word_count})
   - Si < 80% de la cible → warning ; si < 60% → critical
   - Sections vides ou très courtes

4. STRUCTURE (structure) :
   - H2 présents vs planifiés (${structure.target_sections_count})
   - Ordre logique, hiérarchie heading
   - Présence de quick_answer si snippet strategy active

5. AI SIGNALS (ai_signals) :
   - Patterns répétitifs ("il est important", "il convient de noter")
   - Transitions artificielles, listes trop uniformes
   - Manque de données spécifiques, exemples vagues

6. LINKING (linking) :
   - Ancres sur-optimisées (trop d'exact_match)
   - Concentration de liens dans une seule section
   - Liens vers pages non pertinentes

7. E-E-A-T (eeat) :
   - Présence de données chiffrées, sources, exemples concrets
   - Démonstration d'expertise (terminologie, insights non-évidents)
   - Manque d'expérience terrain ou de preuves

8. OVER OPTIMIZATION (over_optimization) :
   - Keyword stuffing dans H2, alt text, strong tags
   - Structure artificiellement optimisée

ALIGNEMENT :
- intent_match : le contenu répond-il réellement à l'intention "${intent.intent}" ?
- structure_respected : les H2 planifiés sont-ils présents et dans l'ordre ?
- tone_consistent : le ton "${diff.tone_of_voice}" est-il respecté dans tout le contenu ?

SCORING :
- 0-25 : low risk — publication safe
- 26-50 : medium risk — corrections mineures recommandées
- 51-100 : high risk — corrections obligatoires avant publication

RETOURNE JSON brut uniquement :
{
  "risk_score": 0-100,
  "risk_level": "low | medium | high",
  "issues": [
    {
      "category": "keyword_density | cannibalization | thin_content | structure | ai_signals | linking | eeat | over_optimization",
      "severity": "critical | warning | info",
      "description": "description précise du problème",
      "fix": "correction recommandée"
    }
  ],
  "keyword_density": ${keywordDensity},
  "word_count": ${wordCount},
  "alignment_check": {
    "intent_match": true/false,
    "structure_respected": true/false,
    "tone_consistent": true/false
  }
}`,
      }],
    }
  );

  const parsed = parseAiJson<RiskOutput>(result.text);
  if (parsed?.risk_score !== undefined && parsed?.issues) {
    // Injecter les métriques serveur fiables
    parsed.keyword_density = keywordDensity;
    parsed.word_count = wordCount;
    return parsed;
  }

  // P7 — Fallback conservateur (score 40 au lieu de 0)
  return {
    risk_score: 40,
    risk_level: "medium",
    issues: [
      {
        category: "structure",
        severity: "info",
        description: "Audit automatique non disponible — vérification manuelle recommandée",
        fix: "Relire le contenu avant publication",
      },
    ],
    keyword_density: keywordDensity,
    word_count: wordCount,
    alignment_check: {
      intent_match: true,
      structure_respected: true,
      tone_consistent: true,
    },
  };
}

// ── Agent 8 : CTR ────────────────────────────────────────────────────────────

async function runCtrAgent(
  input: PipelineInput, ctx: RankpillContext,
  intent: IntentOutput, diff: DiffOutput, serp: SerpOutput, risk: RiskOutput, content: ContentOutput,
): Promise<CtrOutput> {
  const gscKwData = ctx.gsc_data?.queries.find(q => q.query.toLowerCase().includes(input.keyword.toLowerCase()));

  const contentSummary = [
    content.hero.title,
    content.hero.promise,
    content.quick_answer,
    ...content.sections.map(s => s.title),
  ].join(" | ");

  // P6 — Titles concurrents pour différenciation
  const competitorTitles = serp.patterns.length > 0
    ? `TITLES CONCURRENTS (patterns SERP) : ${serp.patterns.join(" | ")}`
    : "Pas de données titles concurrents disponibles.";

  const result = await aiCall(
    { task: "meta_optimization" },
    {
      // P3 — Rôle system enrichi
      system: `${systemContext(ctx, input)}\n\nTu es un Copywriter CTR senior spécialisé en optimisation des taux de clics SERP. Tu combines les techniques de copywriting direct response avec l'expertise SEO technique.

Tu maîtrises les techniques CTR éprouvées :
- Power words : "ultime", "secret", "erreur", "gratuit", "rapide", "prouvé", "exclusif"
- Numbers & brackets : "[2024]", "(+Template)", "7 étapes", "en 5 min"
- Curiosity gap : promettre sans tout révéler, créer l'envie de cliquer
- Urgency/freshness : signaux de contenu à jour et pertinent
- Emotional triggers : peur de manquer, désir de résultat, frustration résolue
- Pattern interrupt : se différencier visuellement des autres titles SERP

Tu sais que :
- Google tronque les titles à ~60 caractères et les metas à ~155 caractères — pas un char de plus
- Le keyword DOIT apparaître dans les 40 premiers caractères du title
- La meta description est un pitch de vente — elle doit déclencher le clic, pas résumer le contenu
- L'Open Graph (réseaux sociaux) tolère des titles plus longs et plus accrocheurs

Ta sortie est ce que l'utilisateur verra dans Google — chaque caractère compte.`,
      messages: [{
        role: "user",
        content: `Optimise le CTR SERP pour le mot-clé "${input.keyword}" (business: "${input.business_name}", secteur: ${input.industry}).

CONTEXTE STRATÉGIQUE :
- Intent : ${intent.intent} (user stage: ${intent.user_stage})
- Angle : ${diff.angle}
- Promesse : ${diff.promise}
- Ton : ${diff.tone_of_voice}
- Featured snippet probable : ${intent.featured_snippet_opportunity.likely ? `oui (${intent.featured_snippet_opportunity.format})` : "non"}
- SERP features actives : ${[serp.serp_features.featured_snippet && "featured snippet", serp.serp_features.paa && "PAA", serp.serp_features.video_pack && "vidéos", serp.serp_features.image_pack && "images"].filter(Boolean).join(", ") || "aucune"}

RÉSUMÉ DU CONTENU : ${contentSummary}
${gscKwData ? `DONNÉES GSC : position ${gscKwData.position}, CTR actuel ${gscKwData.ctr}%, ${gscKwData.impressions} impressions, ${gscKwData.clicks} clics` : "Pas de données GSC — nouveau keyword."}

${competitorTitles}

AUDIT RISK : score ${risk.risk_score}/100 (${risk.risk_level}), ${risk.word_count} mots

RÈGLES :

TITLE SEO (obligatoire) :
- 50-60 caractères MAX (Google tronque à ~60)
- Keyword "${input.keyword}" dans les 40 premiers caractères
- Utilise au moins 1 technique CTR (power word, number, bracket, curiosity gap)
- Se différencie des titles concurrents — ne pas reproduire le même pattern
${intent.featured_snippet_opportunity.likely ? `- Featured snippet probable → inclure une formulation question ou "comment" pour capter le snippet` : ""}
${intent.intent === "commercial_investigation" ? `- Intent commercial → inclure un comparatif ou qualificatif (meilleur, top, vs, guide)` : ""}
${intent.intent === "transactional" ? `- Intent transactionnel → inclure un signal d'action (prix, acheter, offre, livraison)` : ""}

TITLE VARIANTS (2 alternatives) :
- Variante A : approche différente (autre angle, autre technique CTR)
- Variante B : formulation plus agressive ou plus safe selon le risk level

META DESCRIPTION (obligatoire) :
- 150-155 caractères MAX (Google tronque à ~155)
- Commence par un bénéfice ou une promesse, pas par le keyword
- Inclut un call-to-action implicite ("Découvrez", "Comparez", "Apprenez")
- Contient le keyword naturellement (Google le met en gras)
- Ton aligné avec "${diff.tone_of_voice}"

OPEN GRAPH (réseaux sociaux) :
- og_title : peut être plus long (70 chars max), plus accrocheur, emojis OK
- og_description : 200 chars max, pitch social (plus émotionnel que la meta SEO)

HOOK (accroche premier paragraphe) :
- 1-2 phrases maximum
- Interpelle le lecteur, pose un problème ou une stat choc
- Donne envie de lire la suite

RETOURNE JSON brut uniquement :
{
  "title": "title SEO 50-60 chars contenant le keyword",
  "title_length": 55,
  "title_variants": ["variante A", "variante B"],
  "meta_description": "meta description 150-155 chars",
  "meta_length": 152,
  "og_title": "titre Open Graph plus accrocheur 70 chars max",
  "og_description": "description sociale 200 chars max",
  "hook": "accroche 1-2 phrases pour le premier paragraphe",
  "ctr_techniques_used": ["technique 1", "technique 2"],
  "confidence_score": 75
}`,
      }],
    }
  );

  const parsed = parseAiJson<CtrOutput>(result.text);
  if (parsed?.title && parsed?.meta_description) {
    // P4 — Validation de longueur côté serveur
    if (parsed.title.length > 65) {
      parsed.title = parsed.title.slice(0, 62) + "...";
    }
    if (parsed.meta_description.length > 160) {
      parsed.meta_description = parsed.meta_description.slice(0, 157) + "...";
    }
    parsed.title_length = parsed.title.length;
    parsed.meta_length = parsed.meta_description.length;
    if (!parsed.title_variants) parsed.title_variants = [];
    if (!parsed.og_title) parsed.og_title = parsed.title;
    if (!parsed.og_description) parsed.og_description = parsed.meta_description;
    if (!parsed.ctr_techniques_used) parsed.ctr_techniques_used = [];
    if (!parsed.confidence_score) parsed.confidence_score = 50;
    return parsed;
  }

  // Fallback
  const fallbackTitle = content.hero.title.length > 62 ? content.hero.title.slice(0, 62) + "..." : content.hero.title;
  const fallbackMeta = (content.quick_answer ?? content.hero.promise ?? "").slice(0, 157) + "...";
  return {
    title: fallbackTitle,
    title_length: fallbackTitle.length,
    title_variants: [],
    meta_description: fallbackMeta,
    meta_length: fallbackMeta.length,
    og_title: content.hero.title,
    og_description: content.hero.promise,
    hook: content.hero.promise,
    ctr_techniques_used: [],
    confidence_score: 20,
  };
}

// ── Assembler le HTML final ──────────────────────────────────────────────────

function assembleHtml(content: ContentOutput, linking: LinkingOutput): string {
  const parts: string[] = [];

  // Hero
  if (content.hero.subtitle) parts.push(`<p><strong>${content.hero.subtitle}</strong></p>`);
  if (content.hero.promise) parts.push(`<p>${content.hero.promise}</p>`);

  // Quick answer
  if (content.quick_answer) {
    parts.push(`<h2>En bref</h2>`);
    parts.push(`<p>${content.quick_answer}</p>`);
  }

  // Stats
  if (content.stats && content.stats.length > 0) {
    parts.push(`<h2>Chiffres clés</h2>`);
    parts.push(`<ul>${content.stats.map(s => `<li><strong>${s.value}</strong> — ${s.label}${s.source ? ` <em>(${s.source})</em>` : ""}</li>`).join("")}</ul>`);
  }

  // Comparison table
  if (content.comparison && content.comparison.headers.length > 0) {
    parts.push(`<h2>Comparatif</h2>`);
    parts.push(`<table><thead><tr>${content.comparison.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${content.comparison.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
  }

  // Sections with link injection
  for (const sec of content.sections) {
    parts.push(`<h2>${sec.title}</h2>`);
    let sectionHtml = sec.content;

    // Inject links targeted at this section (P5 — matching amélioré)
    for (const link of linking.links) {
      const placementNorm = link.placement.toLowerCase().trim();
      const titleNorm = sec.title.toLowerCase().trim();
      const isMatch = placementNorm.includes(titleNorm.slice(0, 15)) ||
        titleNorm.includes(placementNorm.slice(0, 15)) ||
        linking.links.indexOf(link) === content.sections.indexOf(sec);
      if (isMatch) {
        // Insert as contextual sentence before the last paragraph when possible
        const lastPIdx = sectionHtml.lastIndexOf("</p>");
        const linkHtml = `<a href="${link.target_url}">${link.anchor}</a>`;
        if (lastPIdx > 0 && sectionHtml.includes("<p>")) {
          sectionHtml = sectionHtml.slice(0, lastPIdx) + ` ${linkHtml}` + sectionHtml.slice(lastPIdx);
        } else {
          sectionHtml += `\n<p>${linkHtml}</p>`;
        }
      }
    }

    parts.push(sectionHtml);
    if (sec.tip) parts.push(`<p><strong>💡</strong> ${sec.tip}</p>`);
    if (sec.example) parts.push(`<p><em>Exemple : ${sec.example}</em></p>`);
  }

  // Insights
  if (content.insights.length > 0) {
    const icons = { tip: "💡", warning: "⚠️", pro: "🔥" } as const;
    for (const i of content.insights) {
      parts.push(`<p><strong>${icons[i.type as keyof typeof icons] ?? "💡"}</strong> ${i.text}</p>`);
    }
  }

  // Mistakes
  if (content.mistakes.length > 0) {
    parts.push(`<h2>Erreurs à éviter</h2>`);
    parts.push(`<ul>${content.mistakes.map(m => `<li><strong>${m.title}</strong> — ${m.why} <em>${m.consequence}</em></li>`).join("")}</ul>`);
  }

  // FAQ
  if (content.faq.length > 0) {
    parts.push(`<h2>Questions fréquentes</h2>`);
    for (const q of content.faq) {
      parts.push(`<h3>${q.question}</h3>`);
      parts.push(`<p>${q.answer}</p>`);
    }
  }

  // CTA
  if (content.cta) parts.push(`<p>${content.cta}</p>`);

  return parts.join("\n");
}

// ── Pipeline principal ───────────────────────────────────────────────────────

export async function runGenerationPipeline(
  supabase: SupabaseClient,
  userId: string,
  input: PipelineInput,
  onProgress?: PipelineProgressCallback,
): Promise<PipelineResult> {
  // Collect Rankpill context
  const ctx = await collectRankpillContext(supabase, userId, input.keyword);

  // ── Build contextual details for each agent ──
  const gscKw = ctx.gsc_data?.queries.find(q => q.query.toLowerCase().includes(input.keyword.toLowerCase()));
  const gscCount = ctx.gsc_data?.queries.length ?? 0;
  const pagesCount = ctx.existing_pages.length;
  const cocoonCluster = ctx.cocoon?.cluster;
  const cocoonType = ctx.cocoon?.page_type;
  const siblings = ctx.cocoon?.sibling_keywords ?? [];
  const roadmapPhase = ctx.roadmap?.phase;
  const roadmapPriority = ctx.roadmap?.priority;

  // Agent 1: Intent
  onProgress?.(1, "intent", [
    `Analyse du mot-clé "${input.keyword}"`,
    ...(gscKw ? [`Données GSC trouvées — position ${gscKw.position}, ${gscKw.impressions} impressions, CTR ${gscKw.ctr}%`] : [`Pas de données GSC pour ce mot-clé — première analyse`]),
    ...(cocoonCluster ? [`Mot-clé localisé dans le cluster "${cocoonCluster}" (${cocoonType})`] : []),
    `Détection de l'intention de recherche et du niveau de maturité utilisateur`,
  ]);
  const intent = await runIntentAgent(input, ctx);

  // Agent 2: SERP
  onProgress?.(2, "serp", [
    `Scraping des résultats Google pour "${input.keyword}"`,
    `Analyse des 5 premiers résultats organiques`,
    `Extraction des patterns de contenu, faiblesses et opportunités`,
    `Identification des content gaps exploitables`,
  ]);
  const serp = await runSerpAgent(input, ctx, intent);

  // Agent 3: Diff
  onProgress?.(3, "diff", [
    `${serp.patterns.length} patterns SERP, ${serp.weaknesses.length} faiblesses, ${serp.content_gaps.length} gaps (source: ${serp.data_source})`,
    `Difficulté : ${serp.competitive_benchmark.difficulty_estimate} — benchmark ${serp.competitive_benchmark.avg_word_count} mots / ${serp.competitive_benchmark.avg_headings_count} H2`,
    `${serp.opportunities.length} opportunités identifiées`,
    ...(roadmapPhase ? [`Intégration de la roadmap SEO — phase ${roadmapPhase}, priorité ${roadmapPriority}`] : []),
    ...(cocoonCluster ? [`Positionnement dans le cluster "${cocoonCluster}" — ${siblings.length} pages sœurs`] : []),
    `Création d'un angle unique vs concurrence`,
  ]);
  const diff = await runDiffAgent(input, ctx, intent, serp);

  // Agent 4: Structure
  onProgress?.(4, "structure", [
    `Intent détecté : ${intent.intent} (${intent.content_lifespan}) — utilisateur ${intent.user_stage}`,
    `Angle retenu : "${diff.angle}" — ton ${diff.tone_of_voice}`,
    `Stratégie : ${diff.content_strategy.recommended_format}, ${diff.content_strategy.depth_level}, ${diff.content_strategy.target_word_count} mots`,
    `Cocon : ${diff.cocoon_positioning.role} — ${diff.cocoon_positioning.relation_to_cluster}`,
    `Sélection des blocs de contenu adaptés à l'intention et au format`,
  ]);
  const structure = await runStructureAgent(input, ctx, intent, diff, serp);

  // Agent 5: Content
  onProgress?.(5, "content", [
    `Structure validée : ${structure.blocks.length} blocs, ${structure.sections_plan.length} sections H2 planifiées`,
    `Snippet : ${structure.snippet_strategy.format !== "none" ? `${structure.snippet_strategy.format} → ${structure.snippet_strategy.target_block}` : "pas de stratégie"}`,
    `Rédaction SEO ${diff.content_strategy.target_word_count} mots — ton ${diff.tone_of_voice}, profondeur ${diff.content_strategy.depth_level}`,
    ...(gscCount > 0 ? [`Intégration des ${gscCount} requêtes GSC dans le champ sémantique`] : []),
    `Variations mot-clé : ${[...intent.keyword_variations.semantic.slice(0, 2), ...intent.keyword_variations.long_tail.slice(0, 2)].join(", ")}`,
    `Promesse : "${diff.promise}"`,
  ]);
  const content = await runContentAgent(input, ctx, intent, diff, structure);

  // Agent 6: Linking
  onProgress?.(6, "linking", [
    ...(pagesCount > 0 ? [
      `${pagesCount} pages existantes analysées pour le maillage`,
      ...(cocoonCluster ? [`Priorité aux liens du cluster "${cocoonCluster}"`] : []),
      `Stratégie d'ancres diversifiées (exact, partial, semantic, contextual)`,
      `Placement contextuel dans les sections H2 pertinentes`,
    ] : [
      `Aucune page existante — maillage interne ignoré`,
    ]),
  ]);
  const linking = await runLinkingAgent(input, ctx, intent, diff, content);

  // Assemble HTML
  const html = assembleHtml(content, linking);

  // Agent 7: Risk
  onProgress?.(7, "risk", [
    `Vérification de la densité mot-clé (seuil < 2%)`,
    ...(pagesCount > 0 ? [`Analyse de cannibalisation vs ${pagesCount} pages existantes`] : []),
    `Détection des signaux de contenu IA`,
    `Contrôle de la structure H2/H3`,
  ]);
  const risk = await runRiskAgent(input, ctx, html, intent, diff, structure, linking);

  // Agent 8: CTR
  onProgress?.(8, "ctr", [
    ...(gscKw ? [`CTR actuel GSC : ${gscKw.ctr}% — optimisation ciblée`] : [`Pas de CTR GSC — optimisation from scratch`]),
    `Création du title SEO (50-60 caractères)`,
    `Rédaction meta description (150-160 caractères)`,
    `Risque : ${risk.risk_score}/100 (${risk.risk_level}) — ${risk.word_count} mots, densité ${risk.keyword_density}%`,
    ...(risk.issues.filter(i => i.severity === "critical").length > 0 ? [`⚠ ${risk.issues.filter(i => i.severity === "critical").length} problème(s) critique(s) détecté(s)`] : []),
  ]);
  const ctr = await runCtrAgent(input, ctx, intent, diff, serp, risk, content);

  // P7 — Injecter le hook CTR comme accroche en début de contenu
  const finalHtml = ctr.hook
    ? `<p><strong>${ctr.hook}</strong></p>\n${html}`
    : html;

  return {
    intent,
    serp,
    diff,
    structure,
    content,
    linking,
    risk,
    ctr,
    html: finalHtml,
    title: ctr.title,
    meta_description: ctr.meta_description,
  };
}
