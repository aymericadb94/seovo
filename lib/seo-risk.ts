/**
 * SEO Risk Scoring System
 *
 * Evaluates the risk of each SEO action before execution.
 * Score 0-100:
 *   0–30  → automatic (safe to execute)
 *   31–60 → validated (needs user approval)
 *   61–100 → blocked (too risky)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCQuery } from "@/lib/seo-projections";

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high";
export type AllowedAction = "auto" | "semi" | "blocked";

export type RiskAssessment = {
  risk_score: number;         // 0-100
  risk_level: RiskLevel;
  allowed_action: AllowedAction;
  reason: string;
  recommendation: string;
  factors: RiskFactor[];
};

type RiskFactor = {
  name: string;
  score: number;    // Contribution to total score
  weight: number;   // Weight applied
  detail: string;
};

export type ActionContext = {
  action_type: "add_internal_links" | "optimize_meta" | "optimize_title" | "content_enrich" | "content_create";
  target_url: string;
  target_title: string;
  keyword: string;
  // Page metrics (from GSC)
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  // Modification context
  is_homepage: boolean;
  is_pillar: boolean;
  content_length: number;          // Current content word count
  existing_internal_links: number;
  links_to_add: number;
};

type ModificationHistory = {
  total_modifications: number;
  last_modified_at: string | null;
  days_since_last: number;
};

// ── Constants ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  page_importance: 0.25,
  current_performance: 0.25,
  modification_type: 0.20,
  modification_frequency: 0.15,
  optimization_level: 0.15,
} as const;

// ── Main scoring function ────────────────────────────────────────────────────

export function assessRisk(
  ctx: ActionContext,
  history: ModificationHistory
): RiskAssessment {
  const factors: RiskFactor[] = [];

  // ── Factor 1: Page importance (0-100) ──────────────────────────────────
  let importanceScore = 0;
  let importanceDetail = "";

  if (ctx.is_homepage) {
    importanceScore = 90;
    importanceDetail = "Homepage — page la plus critique du site";
  } else if (ctx.is_pillar) {
    importanceScore = 65;
    importanceDetail = "Page pilier — structurante pour le cocon sémantique";
  } else if (ctx.position !== null && ctx.position <= 3) {
    importanceScore = 75;
    importanceDetail = `Top 3 (pos. ${ctx.position}) — toute modification est risquée`;
  } else if (ctx.position !== null && ctx.position <= 10) {
    importanceScore = 50;
    importanceDetail = `Top 10 (pos. ${ctx.position}) — page performante`;
  } else if (ctx.clicks > 50) {
    importanceScore = 40;
    importanceDetail = `${ctx.clicks} clics/mois — page génératrice de trafic`;
  } else {
    importanceScore = 10;
    importanceDetail = "Page secondaire — faible impact si modifiée";
  }

  factors.push({
    name: "page_importance",
    score: importanceScore,
    weight: WEIGHTS.page_importance,
    detail: importanceDetail,
  });

  // ── Factor 2: Current performance (0-100) ──────────────────────────────
  let perfScore = 0;
  let perfDetail = "";

  if (ctx.position !== null && ctx.position <= 3 && ctx.ctr > 0.08) {
    perfScore = 85;
    perfDetail = `Position ${ctx.position}, CTR ${(ctx.ctr * 100).toFixed(1)}% — performances excellentes, ne pas toucher`;
  } else if (ctx.position !== null && ctx.position <= 10) {
    perfScore = 55;
    perfDetail = `Position ${ctx.position} — bonne performance, modification prudente`;
  } else if (ctx.position !== null && ctx.position <= 20) {
    perfScore = 25;
    perfDetail = `Position ${ctx.position} — zone d'optimisation, risque modéré`;
  } else if (ctx.position !== null) {
    perfScore = 10;
    perfDetail = `Position ${ctx.position} — peu à perdre, optimisation recommandée`;
  } else {
    perfScore = 5;
    perfDetail = "Pas de données GSC — page nouvelle ou non indexée";
  }

  factors.push({
    name: "current_performance",
    score: perfScore,
    weight: WEIGHTS.current_performance,
    detail: perfDetail,
  });

  // ── Factor 3: Modification type (0-100) ────────────────────────────────
  let modScore = 0;
  let modDetail = "";

  switch (ctx.action_type) {
    case "add_internal_links":
      modScore = 10 + Math.min(30, ctx.links_to_add * 10);
      modDetail = `Ajout de ${ctx.links_to_add} lien(s) interne(s) — modification légère`;
      break;
    case "optimize_meta":
      modScore = 40;
      modDetail = "Modification meta description — impact modéré sur CTR";
      break;
    case "optimize_title":
      modScore = 65;
      modDetail = "Modification du title — impact direct sur le ranking";
      break;
    case "content_enrich":
      modScore = 55;
      modDetail = "Enrichissement de contenu — modification substantielle";
      break;
    case "content_create":
      modScore = 5;
      modDetail = "Création de contenu — aucun risque de régression";
      break;
  }

  factors.push({
    name: "modification_type",
    score: modScore,
    weight: WEIGHTS.modification_type,
    detail: modDetail,
  });

  // ── Factor 4: Modification frequency (0-100) ───────────────────────────
  let freqScore = 0;
  let freqDetail = "";

  if (history.days_since_last < 3) {
    freqScore = 80;
    freqDetail = `Modifiée il y a ${history.days_since_last}j — trop récent, risque de sur-optimisation`;
  } else if (history.days_since_last < 7) {
    freqScore = 50;
    freqDetail = `Modifiée il y a ${history.days_since_last}j — fréquence élevée`;
  } else if (history.days_since_last < 14) {
    freqScore = 20;
    freqDetail = `Modifiée il y a ${history.days_since_last}j — fréquence acceptable`;
  } else {
    freqScore = 5;
    freqDetail = history.last_modified_at
      ? `Modifiée il y a ${history.days_since_last}j — fréquence saine`
      : "Jamais modifiée par Rankpill";
  }

  if (history.total_modifications > 5) {
    freqScore = Math.min(100, freqScore + 20);
    freqDetail += ` (${history.total_modifications} modifications totales)`;
  }

  factors.push({
    name: "modification_frequency",
    score: freqScore,
    weight: WEIGHTS.modification_frequency,
    detail: freqDetail,
  });

  // ── Factor 5: Current optimization level (0-100) ───────────────────────
  let optScore = 0;
  let optDetail = "";

  const linkDensity = ctx.content_length > 0
    ? ctx.existing_internal_links / (ctx.content_length / 200) // ~1 link per 200 words ideal
    : 0;

  if (linkDensity > 1.5 && ctx.action_type === "add_internal_links") {
    optScore = 75;
    optDetail = `Densité de liens élevée (${ctx.existing_internal_links} liens, ${ctx.content_length} mots) — risque de sur-optimisation`;
  } else if (linkDensity > 1.0 && ctx.action_type === "add_internal_links") {
    optScore = 45;
    optDetail = `Densité de liens correcte — ajout prudent`;
  } else if (ctx.content_length < 300 && ctx.action_type !== "content_create") {
    optScore = 60;
    optDetail = `Contenu court (${ctx.content_length} mots) — modification risquée sur peu de contenu`;
  } else {
    optScore = 10;
    optDetail = "Niveau d'optimisation normal — marge de manoeuvre disponible";
  }

  factors.push({
    name: "optimization_level",
    score: optScore,
    weight: WEIGHTS.optimization_level,
    detail: optDetail,
  });

  // ── Calculate total score ──────────────────────────────────────────────
  const totalScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  // ── Hard rules (override score) ────────────────────────────────────────
  let finalScore = totalScore;
  let hardRuleReason = "";

  // RULE: Never auto-modify homepage
  if (ctx.is_homepage && ctx.action_type !== "add_internal_links") {
    finalScore = Math.max(finalScore, 70);
    hardRuleReason = "Homepage — modifications bloquées sauf maillage";
  }

  // RULE: Never modify top 3 pages automatically
  if (ctx.position !== null && ctx.position <= 3 && ctx.action_type !== "add_internal_links") {
    finalScore = Math.max(finalScore, 65);
    hardRuleReason = "Page top 3 — modifications nécessitent validation";
  }

  // RULE: Too many modifications in short period
  if (history.days_since_last < 2 && history.total_modifications > 3) {
    finalScore = Math.max(finalScore, 75);
    hardRuleReason = "Trop de modifications récentes — cooldown nécessaire";
  }

  // RULE: Content creation is always safe
  if (ctx.action_type === "content_create") {
    finalScore = Math.min(finalScore, 15);
    hardRuleReason = "Création de contenu — risque minimal";
  }

  // ── Determine level and allowed action ─────────────────────────────────
  const riskLevel: RiskLevel = finalScore <= 30 ? "low" : finalScore <= 60 ? "medium" : "high";
  const allowedAction: AllowedAction = finalScore <= 30 ? "auto" : finalScore <= 60 ? "semi" : "blocked";

  // ── Build reason and recommendation ────────────────────────────────────
  const topFactor = factors.reduce((a, b) => (a.score * a.weight > b.score * b.weight ? a : b));
  const reason = hardRuleReason || topFactor.detail;

  let recommendation = "";
  switch (allowedAction) {
    case "auto":
      recommendation = "Action sûre — exécution automatique autorisée";
      break;
    case "semi":
      recommendation = "Risque modéré — validation utilisateur requise avant exécution";
      break;
    case "blocked":
      recommendation = "Risque élevé — action bloquée. Vérification manuelle nécessaire";
      break;
  }

  return {
    risk_score: finalScore,
    risk_level: riskLevel,
    allowed_action: allowedAction,
    reason,
    recommendation,
    factors,
  };
}

// ── Get modification history for a page ──────────────────────────────────────

export async function getModificationHistory(
  supabase: SupabaseClient,
  userId: string,
  pageUrl: string
): Promise<ModificationHistory> {
  const { data } = await supabase
    .from("seo_actions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("page_url", pageUrl)
    .order("created_at", { ascending: false })
    .limit(20);

  const actions = data ?? [];
  const lastAction = actions[0];
  const daysSince = lastAction
    ? Math.floor((Date.now() - new Date(lastAction.created_at).getTime()) / (24 * 60 * 60 * 1000))
    : 999;

  return {
    total_modifications: actions.length,
    last_modified_at: lastAction?.created_at ?? null,
    days_since_last: daysSince,
  };
}

// ── Assess risk for a batch of actions ───────────────────────────────────────

export async function assessActionsRisk(
  supabase: SupabaseClient,
  userId: string,
  actions: {
    action_type: ActionContext["action_type"];
    target_url: string;
    target_title: string;
    keyword: string;
    is_pillar: boolean;
    links_to_add: number;
    existing_internal_links: number;
    content_length: number;
  }[],
  gscQueries: GSCQuery[],
  siteUrl: string
): Promise<{ action: typeof actions[0]; assessment: RiskAssessment }[]> {
  const gscMap = new Map(gscQueries.map(q => [q.query.toLowerCase(), q]));
  const results: { action: typeof actions[0]; assessment: RiskAssessment }[] = [];

  for (const action of actions) {
    const gsc = gscMap.get(action.keyword.toLowerCase());
    const history = await getModificationHistory(supabase, userId, action.target_url);

    const isHomepage = (() => {
      try {
        const u = new URL(action.target_url);
        return u.pathname === "/" || u.pathname === "";
      } catch {
        return action.target_url === siteUrl || action.target_url === siteUrl + "/";
      }
    })();

    const ctx: ActionContext = {
      action_type: action.action_type,
      target_url: action.target_url,
      target_title: action.target_title,
      keyword: action.keyword,
      position: gsc?.position ?? null,
      impressions: gsc?.impressions ?? 0,
      clicks: gsc?.clicks ?? 0,
      ctr: gsc?.ctr ?? 0,
      is_homepage: isHomepage,
      is_pillar: action.is_pillar,
      content_length: action.content_length,
      existing_internal_links: action.existing_internal_links,
      links_to_add: action.links_to_add,
    };

    const assessment = assessRisk(ctx, history);
    results.push({ action, assessment });
  }

  return results;
}
