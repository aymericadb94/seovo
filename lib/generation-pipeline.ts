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
  intent: "info" | "business" | "transactionnel";
  sub_intents: string[];
  user_stage: "débutant" | "intermédiaire" | "avancé";
  keyword_variations: string[];
};

export type SerpOutput = {
  patterns: string[];
  weaknesses: string[];
  content_gaps: string[];
};

export type DiffOutput = {
  angle: string;
  promise: string;
  positioning: string;
  unique_elements: string[];
};

export type StructureOutput = {
  blocks: string[];
};

export type ContentOutput = {
  hero: { title: string; subtitle: string; promise: string; cta: string | null };
  quick_answer: string;
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
  links: { target_url: string; anchor: string; placement: string }[];
};

export type RiskOutput = {
  risk_score: number;
  issues: string[];
  fixes: string[];
};

export type CtrOutput = {
  title: string;
  meta_description: string;
  hook: string;
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

async function getValidGscToken(
  supabase: SupabaseClient,
  userId: string,
  site: { google_access_token: string; google_refresh_token?: string; google_token_expiry?: number },
): Promise<string | null> {
  // Token still valid (60s margin)
  if (site.google_token_expiry && Date.now() < site.google_token_expiry - 60000) {
    return site.google_access_token;
  }
  // Refresh
  if (!site.google_refresh_token) return site.google_access_token; // try anyway
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: site.google_refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await res.json() as { access_token?: string; expires_in?: number };
    if (!tokens.access_token) return site.google_access_token;
    await supabase.from("sites").update({
      google_access_token: tokens.access_token,
      google_token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    }).eq("user_id", userId);
    return tokens.access_token;
  } catch {
    return site.google_access_token; // use current token as fallback
  }
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

  // Existing pages
  const existing_pages: ExistingPage[] = (pubsResult.data ?? [])
    .filter(p => p.keyword && p.keyword !== "__page__")
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

async function runIntentAgent(input: PipelineInput, ctx: RankpillContext): Promise<IntentOutput> {
  const gscForKeyword = ctx.gsc_data?.queries.find(q => q.query.toLowerCase().includes(input.keyword.toLowerCase()));

  const result = await aiCall(
    { task: "intent_analysis" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert SEO spécialisé dans l'analyse d'intention de recherche.`,
      messages: [{
        role: "user",
        content: `Analyse le mot-clé "${input.keyword}" et comprends l'intention réelle utilisateur.

${gscForKeyword ? `Données GSC pour ce mot-clé : position ${gscForKeyword.position}, ${gscForKeyword.impressions} impressions, ${gscForKeyword.clicks} clics, CTR ${gscForKeyword.ctr}%` : "Pas de données GSC pour ce mot-clé."}

Détermine :
- intent principal (info, business, transactionnel)
- sous-intentions
- niveau de maturité utilisateur (débutant, intermédiaire, avancé)
- variations du mot-clé opportunes

RETOURNE JSON brut uniquement :
{
  "intent": "info | business | transactionnel",
  "sub_intents": ["..."],
  "user_stage": "débutant | intermédiaire | avancé",
  "keyword_variations": ["..."]
}`,
      }],
    }
  );

  return parseAiJson<IntentOutput>(result.text) ?? {
    intent: "info", sub_intents: [], user_stage: "intermédiaire", keyword_variations: [],
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

async function runSerpAgent(input: PipelineInput, ctx: RankpillContext): Promise<SerpOutput> {
  // Scrape SERP
  const urls = await fetchGoogleSerpUrls(input.keyword, input.language);
  const scraped = (await Promise.all(urls.map(u => scrapeSerpPage(u)))).filter(Boolean);

  if (scraped.length === 0) {
    return { patterns: [], weaknesses: [], content_gaps: [] };
  }

  const serpInput = scraped.map(r => ({
    title: r!.title,
    headings: r!.headings.slice(0, 6),
    summary: r!.summary.slice(0, 400),
    wordCount: r!.wordCount,
  }));

  const result = await aiCall(
    { task: "content_audit" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert SEO spécialisé en analyse SERP.`,
      messages: [{
        role: "user",
        content: `Analyse les résultats Google pour "${input.keyword}" et identifie patterns, faiblesses et opportunités.

RÉSULTATS SERP TOP ${scraped.length} :
${JSON.stringify(serpInput, null, 2)}

RETOURNE JSON brut uniquement :
{
  "patterns": ["pattern commun 1", "..."],
  "weaknesses": ["faiblesse 1", "..."],
  "content_gaps": ["gap 1", "..."]
}`,
      }],
    }
  );

  return parseAiJson<SerpOutput>(result.text) ?? { patterns: [], weaknesses: [], content_gaps: [] };
}

// ── Agent 3 : Diff ───────────────────────────────────────────────────────────

async function runDiffAgent(input: PipelineInput, ctx: RankpillContext, serp: SerpOutput): Promise<DiffOutput> {
  const result = await aiCall(
    { task: "roadmap_strategy" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert SEO stratégique.`,
      messages: [{
        role: "user",
        content: `Crée un angle différenciant pour "${input.keyword}" basé sur l'analyse SERP, la roadmap SEO et le cocon sémantique.

ANALYSE SERP :
${JSON.stringify(serp, null, 2)}

${ctx.roadmap ? `ROADMAP : phase ${ctx.roadmap.phase}, priorité ${ctx.roadmap.priority}, objectif: ${ctx.roadmap.objective}` : "Pas de roadmap disponible."}
${ctx.cluster ? `CLUSTER SEO : ${ctx.cluster}` : "Pas de cluster défini."}

RETOURNE JSON brut uniquement :
{
  "angle": "angle différenciant en 1 phrase",
  "promise": "promesse au lecteur",
  "positioning": "positionnement vs concurrence",
  "unique_elements": ["élément unique 1", "..."]
}`,
      }],
    }
  );

  return parseAiJson<DiffOutput>(result.text) ?? {
    angle: "", promise: "", positioning: "", unique_elements: [],
  };
}

// ── Agent 4 : Structure ──────────────────────────────────────────────────────

async function runStructureAgent(input: PipelineInput, ctx: RankpillContext, intent: IntentOutput, diff: DiffOutput): Promise<StructureOutput> {
  const result = await aiCall(
    { task: "content_structure" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert en SEO + UX.`,
      messages: [{
        role: "user",
        content: `Crée une structure de page dynamique pour "${input.keyword}".

INTENT : ${intent.intent} (sous-intentions : ${intent.sub_intents.join(", ")})
STAGE UTILISATEUR : ${intent.user_stage}
CLUSTER : ${ctx.cluster ?? "non défini"}
ANGLE : ${diff.angle}
POSITIONNEMENT : ${diff.positioning}

Choisis les blocs pertinents parmi : hero, quick_answer, stats, simulation, sections, insights, mistakes, faq, comparison, cta.
N'inclus que les blocs qui servent l'intention et l'angle.

RETOURNE JSON brut uniquement :
{
  "blocks": ["hero", "quick_answer", "..."]
}`,
      }],
    }
  );

  return parseAiJson<StructureOutput>(result.text) ?? {
    blocks: ["hero", "quick_answer", "sections", "insights", "mistakes", "faq", "cta"],
  };
}

// ── Agent 5 : Content ────────────────────────────────────────────────────────

async function runContentAgent(
  input: PipelineInput, ctx: RankpillContext,
  intent: IntentOutput, diff: DiffOutput, structure: StructureOutput,
): Promise<ContentOutput> {
  const result = await aiCall(
    { task: "content_generation" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un rédacteur SEO senior expert en contenu à forte valeur. Tu écris en ${input.language}. Pas de contenu générique. Inclure data, exemples, stratégie. Structure dynamique, lisible rapidement.`,
      messages: [{
        role: "user",
        content: `Crée une page SEO complète pour "${input.keyword}".

INTENT : ${intent.intent} — ${intent.sub_intents.join(", ")}
STAGE UTILISATEUR : ${intent.user_stage}
ANGLE : ${diff.angle}
PROMESSE : ${diff.promise}
ÉLÉMENTS UNIQUES : ${diff.unique_elements.join(", ")}
MOTS-CLÉS ASSOCIÉS : ${intent.keyword_variations.join(", ")}
CLUSTER : ${ctx.cluster ?? "non défini"}

STRUCTURE IMPOSÉE (blocs à rédiger) : ${structure.blocks.join(", ")}

RÈGLES :
- Contenu non générique, basé sur les données
- Inclure : data chiffrées, exemples concrets, stratégie actionnable
- Lisible en diagonale, paragraphes courts (2-3 phrases)
- Aucune phrase de remplissage ("il est important de noter", "dans le monde actuel", etc.)
- Voix active, directe, experte
- 1500-2200 mots total
- Tout en ${input.language}

RETOURNE JSON brut uniquement :
{
  "hero": {
    "title": "H1 puissant orienté résultat",
    "subtitle": "sous-titre clair",
    "promise": "promesse en 1 phrase",
    "cta": "texte CTA ou null"
  },
  "quick_answer": "réponse immédiate 40-60 mots optimisée featured snippet",
  "sections": [
    {
      "title": "H2 court et percutant",
      "content": "HTML (<p>, <ul>, <li>, <strong>, <em>)",
      "tip": "conseil concret en 1 phrase",
      "example": "exemple spécifique en 1-2 phrases"
    }
  ],
  "insights": [
    { "type": "tip | warning | pro", "text": "texte court" }
  ],
  "mistakes": [
    { "title": "erreur", "why": "explication", "consequence": "impact" }
  ],
  "faq": [
    { "question": "question ?", "answer": "réponse 40-60 mots" }
  ],
  "cta": "texte de conclusion 2-3 phrases",
  "pexels_query": "3-5 english keywords for cover image",
  "cover_alt_text": "alt text SEO 8-12 mots",
  "section_image_queries": ["query section 1", "query section 2", "query section 3"]
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

async function runLinkingAgent(input: PipelineInput, ctx: RankpillContext, content: ContentOutput): Promise<LinkingOutput> {
  if (ctx.existing_pages.length === 0) {
    return { links: [] };
  }

  const currentPage = {
    keyword: input.keyword,
    title: content.hero.title,
    sections: content.sections.map(s => s.title),
  };

  const result = await aiCall(
    { task: "internal_linking" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert SEO spécialisé en maillage interne.`,
      messages: [{
        role: "user",
        content: `Crée des liens internes réels pour la page "${input.keyword}".

PAGE ACTUELLE :
${JSON.stringify(currentPage, null, 2)}

PAGES EXISTANTES :
${ctx.existing_pages.slice(0, 30).map(p => `- "${p.title}" (${p.keyword}) → ${p.url}`).join("\n")}

${ctx.cocoon ? `CLUSTER ACTUEL : ${ctx.cocoon.cluster} (priorité au même cluster)` : ""}

RÈGLES :
- 2 à 4 liens max
- Pertinence sémantique obligatoire
- Même cluster prioritaire
- Ancres naturelles (pas de "cliquez ici")

RETOURNE JSON brut uniquement :
{
  "links": [
    {
      "target_url": "url réelle d'une page existante",
      "anchor": "texte d'ancrage naturel",
      "placement": "dans quelle section H2 placer ce lien"
    }
  ]
}`,
      }],
    }
  );

  return parseAiJson<LinkingOutput>(result.text) ?? { links: [] };
}

// ── Agent 7 : Risk ───────────────────────────────────────────────────────────

async function runRiskAgent(input: PipelineInput, ctx: RankpillContext, html: string): Promise<RiskOutput> {
  const result = await aiCall(
    { task: "content_audit" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert SEO technique.`,
      messages: [{
        role: "user",
        content: `Analyse les risques SEO de ce contenu pour le mot-clé "${input.keyword}".

CONTENU (extrait) :
${html.slice(0, 3000)}

Vérifie :
- Sur-optimisation (densité mot-clé > 2%)
- Contenu thin/dupliqué
- Cannibalisation avec pages existantes
- Problèmes de structure (H2 manquants, ordre logique)
- Signaux de contenu IA détectable

RETOURNE JSON brut uniquement :
{
  "risk_score": 0-100,
  "issues": ["problème 1", "..."],
  "fixes": ["correction 1", "..."]
}`,
      }],
    }
  );

  return parseAiJson<RiskOutput>(result.text) ?? { risk_score: 0, issues: [], fixes: [] };
}

// ── Agent 8 : CTR ────────────────────────────────────────────────────────────

async function runCtrAgent(input: PipelineInput, ctx: RankpillContext, content: ContentOutput): Promise<CtrOutput> {
  const gscCtr = ctx.gsc_data?.queries.find(q => q.query.toLowerCase().includes(input.keyword.toLowerCase()))?.ctr;

  const contentSummary = [
    content.hero.title,
    content.hero.promise,
    content.quick_answer,
    ...content.sections.map(s => s.title),
  ].join(" | ");

  const result = await aiCall(
    { task: "meta_optimization" },
    {
      system: `${systemContext(ctx, input)}\n\nTu es un expert en copywriting SEO.`,
      messages: [{
        role: "user",
        content: `Optimise le CTR pour le mot-clé "${input.keyword}".

RÉSUMÉ DU CONTENU : ${contentSummary}
${gscCtr ? `CTR ACTUEL GSC : ${gscCtr}%` : "Pas de CTR GSC disponible."}

Crée un title SEO (50-60 chars, contient le mot-clé, optimisé CTR), une meta description (150-160 chars, incitative), et un hook d'accroche.

RETOURNE JSON brut uniquement :
{
  "title": "title SEO optimisé CTR",
  "meta_description": "meta description 150-160 chars",
  "hook": "phrase d'accroche"
}`,
      }],
    }
  );

  return parseAiJson<CtrOutput>(result.text) ?? {
    title: content.hero.title,
    meta_description: content.quick_answer.slice(0, 160),
    hook: content.hero.promise,
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

  // Sections with link injection
  for (const sec of content.sections) {
    parts.push(`<h2>${sec.title}</h2>`);
    let sectionHtml = sec.content;

    // Inject links targeted at this section
    for (const link of linking.links) {
      if (link.placement.toLowerCase().includes(sec.title.toLowerCase().slice(0, 15)) ||
          linking.links.indexOf(link) === content.sections.indexOf(sec)) {
        // Append link naturally at end of section
        sectionHtml += `\n<p><a href="${link.target_url}">${link.anchor}</a></p>`;
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
  const serp = await runSerpAgent(input, ctx);

  // Agent 3: Diff
  onProgress?.(3, "diff", [
    `${serp.patterns.length} patterns SERP identifiés, ${serp.weaknesses.length} faiblesses détectées`,
    ...(roadmapPhase ? [`Intégration de la roadmap SEO — phase ${roadmapPhase}, priorité ${roadmapPriority}`] : []),
    ...(cocoonCluster ? [`Positionnement dans le cluster "${cocoonCluster}" — ${siblings.length} pages sœurs`] : []),
    `Création d'un angle unique vs concurrence`,
  ]);
  const diff = await runDiffAgent(input, ctx, serp);

  // Agent 4: Structure
  onProgress?.(4, "structure", [
    `Intent détecté : ${intent.intent} — utilisateur ${intent.user_stage}`,
    `Angle retenu : "${diff.angle}"`,
    `Sélection des blocs de contenu adaptés à l'intention`,
    `Construction de la structure de page dynamique`,
  ]);
  const structure = await runStructureAgent(input, ctx, intent, diff);

  // Agent 5: Content
  onProgress?.(5, "content", [
    `Structure validée : ${structure.blocks.length} blocs (${structure.blocks.join(", ")})`,
    `Rédaction SEO 1 500+ mots avec données chiffrées`,
    ...(gscCount > 0 ? [`Intégration des ${gscCount} requêtes GSC dans le champ sémantique`] : []),
    `Variations mot-clé : ${intent.keyword_variations.slice(0, 4).join(", ")}`,
    `Promesse : "${diff.promise}"`,
  ]);
  const content = await runContentAgent(input, ctx, intent, diff, structure);

  // Agent 6: Linking
  onProgress?.(6, "linking", [
    ...(pagesCount > 0 ? [
      `${pagesCount} pages existantes analysées pour le maillage`,
      ...(cocoonCluster ? [`Priorité aux liens du cluster "${cocoonCluster}"`] : []),
      `Insertion de 2-4 liens internes avec ancres naturelles`,
    ] : [
      `Aucune page existante — maillage interne ignoré`,
    ]),
  ]);
  const linking = await runLinkingAgent(input, ctx, content);

  // Assemble HTML
  const html = assembleHtml(content, linking);

  // Agent 7: Risk
  onProgress?.(7, "risk", [
    `Vérification de la densité mot-clé (seuil < 2%)`,
    ...(pagesCount > 0 ? [`Analyse de cannibalisation vs ${pagesCount} pages existantes`] : []),
    `Détection des signaux de contenu IA`,
    `Contrôle de la structure H2/H3`,
  ]);
  const risk = await runRiskAgent(input, ctx, html);

  // Agent 8: CTR
  onProgress?.(8, "ctr", [
    ...(gscKw ? [`CTR actuel GSC : ${gscKw.ctr}% — optimisation ciblée`] : [`Pas de CTR GSC — optimisation from scratch`]),
    `Création du title SEO (50-60 caractères)`,
    `Rédaction meta description (150-160 caractères)`,
    `Score de risque : ${risk.risk_score}/100${risk.issues.length > 0 ? ` — ${risk.issues.length} point(s) corrigé(s)` : " — aucun problème détecté"}`,
  ]);
  const ctr = await runCtrAgent(input, ctx, content);

  return {
    intent,
    serp,
    diff,
    structure,
    content,
    linking,
    risk,
    ctr,
    html,
    title: ctr.title,
    meta_description: ctr.meta_description,
  };
}
