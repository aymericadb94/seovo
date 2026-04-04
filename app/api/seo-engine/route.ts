import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { aiCall, parseAiJson } from "@/lib/ai-router";

export const maxDuration = 300;

// ── Types ──────────────────────────────────────────────────────────────────────

type GSCQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type GSCPage = {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type CrawledPage = {
  url: string;
  title: string;
  metaDesc: string;
  h1: string;
  h2s: string[];
  wordCount: number;
  contentSnippet: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

async function scrapePage(url: string): Promise<CrawledPage | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RankPill/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const metaMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 6);

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      url,
      title: titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "",
      metaDesc: metaMatch?.[1]?.trim() ?? "",
      h1: h1Match?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "",
      h2s: h2Matches.map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean),
      wordCount: text.split(/\s+/).filter(Boolean).length,
      contentSnippet: text.slice(0, 600),
    };
  } catch {
    return null;
  }
}

async function fetchGSCQueries(token: string, gscSiteUrl: string): Promise<GSCQuery[]> {
  try {
    const siteUrl = encodeURIComponent(gscSiteUrl);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: daysAgo(32),
          endDate: daysAgo(2),
          dimensions: ["query"],
          rowLimit: 50,
        }),
      }
    );
    if (!res.ok) return [];
    type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
    const data = (await res.json()) as { rows?: Row[] };
    return (data.rows ?? []).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }));
  } catch {
    return [];
  }
}

async function fetchGSCPages(token: string, gscSiteUrl: string): Promise<GSCPage[]> {
  try {
    const siteUrl = encodeURIComponent(gscSiteUrl);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: daysAgo(32),
          endDate: daysAgo(2),
          dimensions: ["page"],
          rowLimit: 25,
        }),
      }
    );
    if (!res.ok) return [];
    type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
    const data = (await res.json()) as { rows?: Row[] };
    return (data.rows ?? []).map((r) => ({
      url: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }));
  } catch {
    return [];
  }
}

// ── Main route ─────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // ── 1. GSC DATA ───────────────────────────────────────────────────────────

    let gscQueries: GSCQuery[] = [];
    let gscPages: GSCPage[] = [];
    let hasGSC = false;

    if (site.gsc_site_url) {
      const token = await getValidAccessToken(user.id);
      if (token) {
        [gscQueries, gscPages] = await Promise.all([
          fetchGSCQueries(token, site.gsc_site_url),
          fetchGSCPages(token, site.gsc_site_url),
        ]);
        hasGSC = gscQueries.length > 0 || gscPages.length > 0;
      }
    }

    // ── 2. SITE CRAWL ─────────────────────────────────────────────────────────

    // Always crawl homepage + top 4 GSC pages
    const urlsToCrawl = [
      site.site_url,
      ...gscPages
        .slice(0, 4)
        .map((p) => p.url)
        .filter((u) => !u.includes(site.site_url) || u !== site.site_url),
    ].slice(0, 5);

    const crawledPages = (
      await Promise.all(urlsToCrawl.map((url) => scrapePage(url)))
    ).filter((p): p is CrawledPage => p !== null);

    // ── 3. USER INTENT ────────────────────────────────────────────────────────

    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;
    const existingKeywords: string[] = site.keywords ?? [];

    // ── 4. CLAUDE ANALYSIS ENGINE ─────────────────────────────────────────────

    const gscQueriesStr = gscQueries.length > 0
      ? gscQueries.map((q) =>
          `"${q.query}" | imp:${q.impressions} | clics:${q.clicks} | CTR:${q.ctr}% | pos:${q.position}`
        ).join("\n")
      : "Données GSC non disponibles";

    const gscPagesStr = gscPages.length > 0
      ? gscPages.map((p) =>
          `${p.url} | imp:${p.impressions} | clics:${p.clicks} | CTR:${p.ctr}% | pos:${p.position}`
        ).join("\n")
      : "Données GSC non disponibles";

    const crawledStr = crawledPages.map((p) =>
      `URL: ${p.url}
  title: "${p.title || "ABSENT"}"
  meta: "${p.metaDesc || "ABSENTE"}"
  H1: "${p.h1 || "ABSENT"}"
  H2s: ${p.h2s.length > 0 ? p.h2s.map((h) => `"${h}"`).join(", ") : "AUCUN"}
  mots: ${p.wordCount}
  extrait: ${p.contentSnippet.slice(0, 300)}`
    ).join("\n---\n");

    const prompt = `Tu es le moteur SEO de RankPill. Tu analyses trois sources de données pour produire un plan d'action SEO précis, priorisé et automatisable. Aucune généralité — uniquement des insights exploitables sur CE site spécifique.

═══════════════════════════════════════════════════════
PARTIE A — DONNÉES DU SITE
═══════════════════════════════════════════════════════

Business : ${site.business_name}
Secteur : ${site.industry}
URL : ${site.site_url}
CMS : ${site.cms}
Mots-clés configurés : ${existingKeywords.join(", ") || "aucun"}

═══════════════════════════════════════════════════════
PARTIE B — INTENTION STRATÉGIQUE (onboarding)
═══════════════════════════════════════════════════════

Objectif principal : ${seoCtx.objective ?? "non renseigné"}
Offre prioritaire : ${seoCtx.main_offer ?? "non renseigné"}
Cible client : ${seoCtx.target_customer ?? "non renseigné"}
Zone géographique : ${seoCtx.geography ?? "national"}${seoCtx.geography_detail ? ` — ${seoCtx.geography_detail}` : ""}
Ton éditorial : ${seoCtx.editorial_tone ?? "professionnel"}
Concurrents : ${Array.isArray(seoCtx.competitors) ? (seoCtx.competitors as string[]).join(", ") || "non renseignés" : "non renseignés"}
Contraintes : ${seoCtx.constraints ?? "aucune"}

═══════════════════════════════════════════════════════
PARTIE C — DONNÉES GOOGLE SEARCH CONSOLE (30 jours)
═══════════════════════════════════════════════════════

${hasGSC ? "⚡ GSC connectée — données réelles" : "⚠️ GSC non connectée — analyse basée sur crawl + intent uniquement"}

TOP 50 REQUÊTES (impressions décroissantes) :
${gscQueriesStr}

TOP 25 PAGES (impressions décroissantes) :
${gscPagesStr}

═══════════════════════════════════════════════════════
PARTIE D — CRAWL DES PAGES (signaux techniques)
═══════════════════════════════════════════════════════

${crawledStr}

═══════════════════════════════════════════════════════
MISSION — MOTEUR D'ANALYSE ET DE DÉCISION SEO
═══════════════════════════════════════════════════════

RÈGLES DE DÉCISION (applique-les systématiquement) :
1. SI requête GSC position 5-15 + page avec <500 mots → OPTIMISER (quick win)
2. SI requête GSC position 1-4 + CTR < 3% → OPTIMISER snippet (title/meta)
3. SI requête GSC position 16-40 + impressions > 100 → CRÉER page dédiée
4. SI mot-clé business (intent) absent des requêtes GSC → CRÉER contenu stratégique
5. SI page avec H1 absent ou non aligné au mot-clé → CORRIGER structure
6. SI page positionnée sans meta description → RÉDIGER snippet
7. SI même thème sur plusieurs pages sans maillage → AJOUTER liens internes

SCORING DES ACTIONS :
score = (impact * 0.4) + (alignement_business * 0.3) + (facilité * 0.2) + (urgence * 0.1)
- impact : 1-10 (trafic estimé si action réalisée)
- alignement_business : 1-10 (lien avec objectif/offre/cible déclarés)
- facilité : 1-10 (10 = modification meta, 1 = création article long)
- urgence : 1-10 (position proche du top / CTR anormalement bas)

RETOURNE : JSON brut uniquement, sans markdown, sans texte avant ou après.

{
  "generated_at": "${new Date().toISOString()}",
  "has_gsc_data": ${hasGSC},
  "seo_understanding": {
    "business_summary": "Ce que fait ce business en 1 phrase précise",
    "current_seo_state": "débutant|intermédiaire|avancé",
    "main_seo_gap": "Le problème SEO #1 à résoudre (1 phrase)",
    "estimated_traffic_potential": "Estimation réaliste du trafic mensuel atteignable en 6 mois",
    "competitive_position": "Position concurrentielle SEO actuelle (1 phrase)"
  },
  "gsc_insights": [
    {
      "type": "quick_win|underperforming|high_volume_low_ctr|rising",
      "query": "requête exacte",
      "position": 0,
      "impressions": 0,
      "ctr": 0,
      "insight": "Ce que révèle cette donnée (1 phrase)",
      "action": "Action concrète recommandée"
    }
  ],
  "site_insights": [
    {
      "url": "url de la page",
      "issues": ["problème 1", "problème 2"],
      "optimized_elements": ["élément OK 1"],
      "word_count": 0,
      "seo_potential": "faible|moyen|fort"
    }
  ],
  "intent_insights": [
    {
      "intent_keyword": "mot-clé business déclaré",
      "gsc_presence": "présent|absent|partiel",
      "gap_severity": "critique|important|mineur",
      "recommendation": "Action recommandée"
    }
  ],
  "opportunities": [
    {
      "id": "opp_1",
      "type": "quick_win|content_creation|snippet_optimization|structural_fix|internal_linking",
      "title": "Titre court de l'opportunité",
      "description": "Description précise en 1 phrase",
      "target_keyword": "mot-clé visé",
      "target_page": "url ou 'nouvelle page'",
      "estimated_impact": "Gain estimé réaliste",
      "score": 0
    }
  ],
  "conflicts": [
    {
      "type": "keyword_intent_mismatch|page_cannibalisation|missing_coverage|structural_mismatch",
      "description": "Description du conflit détecté",
      "pages_involved": ["url1", "url2"],
      "resolution": "Comment le résoudre"
    }
  ],
  "prioritized_actions": [
    {
      "priority": 1,
      "category": "PRIORITÉ 1 — Quick wins",
      "type": "optimisation|création|correction",
      "action": "Action concrète et précise",
      "target_page": "url ou 'nouvelle page'",
      "target_keyword": "mot-clé exact",
      "reason": "Pourquoi maintenant (données à l'appui)",
      "estimated_gain": "Gain réaliste chiffré",
      "score": 0,
      "automatable": true
    }
  ],
  "automation_plan": [
    {
      "action_type": "meta_rewrite|h1_optimization|content_enrichment|new_article|internal_link",
      "target": "url ou description",
      "instruction": "Instruction précise pour l'IA (ce qu'elle doit faire exactement)",
      "mode": "automatique|semi-automatique|manuel",
      "priority_rank": 1
    }
  ],
  "editorial_strategy": {
    "recommended_topics": ["sujet 1", "sujet 2", "sujet 3", "sujet 4", "sujet 5"],
    "content_gaps": ["gap thématique 1", "gap 2", "gap 3"],
    "semantic_pillars": ["pilier 1", "pilier 2"],
    "next_5_articles": [
      {
        "title": "Titre d'article optimisé",
        "keyword": "mot-clé principal",
        "reason": "Pourquoi cet article en priorité"
      }
    ]
  }
}

CONTRAINTES ABSOLUES :
- Minimum 5 gsc_insights si GSC disponible, sinon 0
- Minimum 8 opportunities avec scores calculés
- Minimum 8 prioritized_actions triées par score décroissant (priorité 1 = score le plus haut)
- Minimum 5 automation_plan items
- Les scores doivent être des nombres réels calculés selon la formule fournie (0-10)
- Uniquement des insights basés sur les données fournies, jamais des suppositions génériques`;

    // seo_engine_execution → Sonnet (execution task)
    const aiResult = await aiCall(
      { task: "seo_engine_execution" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const engineResult = parseAiJson(aiResult.text);
    if (!engineResult) {
      console.error("[seo-engine] JSON parse failed. Raw start:", aiResult.text.slice(0, 200));
      return Response.json({ error: "Réponse non parseable" }, { status: 500 });
    }

    // ── 5. SAVE RESULTS ───────────────────────────────────────────────────────

    // Delete previous result for this user
    await supabase.from("seo_engine_results").delete().eq("user_id", user.id);

    const { data: saved, error: saveError } = await supabase
      .from("seo_engine_results")
      .insert({ user_id: user.id, site_id: site.id, data: engineResult })
      .select()
      .single();

    if (saveError) {
      console.error("[seo-engine] Save error:", saveError.message);
      // Return result even if save fails
      return Response.json({ result: engineResult, saved: false });
    }

    return Response.json({ result: saved.data, id: saved.id });
  } catch (err: unknown) {
    console.error("[seo-engine] exception:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: result } = await supabase
      .from("seo_engine_results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return Response.json({ result: result ?? null });
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
