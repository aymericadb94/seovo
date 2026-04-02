// Shared SEO projections engine — used by /api/seo-analysis and /api/seo-projections

export type GSCQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-1 decimal
  position: number;
};

export type ProjectionItem = {
  keyword: string;
  page: string;
  action: "optimization" | "creation" | "content_upgrade";
  current_position: number | null;
  target_position: number;
  current_clicks: number;
  potential_clicks: number;
  estimated_gain: number;
  confidence_score: number;
  timeframe: string;
  rationale: string;
  difficulty: "easy" | "medium" | "hard";
};

export type ProjectionsResult = {
  estimated_results: ProjectionItem[];
  total_estimated_gain: { low: number; high: number };
  total_current_clicks: number;
  has_gsc_data: boolean;
  computed_at: string;
};

// ── CTR table ─────────────────────────────────────────────────────────────────

const CTR_TABLE: Record<number, number> = {
  1: 0.25, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
};

function getCTR(position: number): number {
  const pos = Math.round(Math.max(1, Math.min(10, position)));
  return CTR_TABLE[pos] ?? 0.015;
}

// ── Target position ───────────────────────────────────────────────────────────

function getTargetPosition(currentPosition: number, seoScore: number): number {
  const qualityBonus = seoScore >= 60 ? 1 : seoScore >= 40 ? 0 : -1;
  if (currentPosition <= 4)  return Math.max(1, currentPosition - 1);
  if (currentPosition <= 10) return Math.max(1, Math.round(currentPosition * 0.5) + qualityBonus);
  if (currentPosition <= 20) return Math.max(3, Math.round(currentPosition * 0.35) + qualityBonus);
  if (currentPosition <= 50) return Math.max(5, 8 + qualityBonus);
  return 10;
}

// ── Difficulty ────────────────────────────────────────────────────────────────

type Difficulty = "easy" | "medium" | "hard";

function getDifficulty(currentPosition: number, seoScore: number): Difficulty {
  if (currentPosition >= 5 && currentPosition <= 15 && seoScore >= 50) return "easy";
  if (currentPosition > 30 || seoScore < 30) return "hard";
  return "medium";
}

const REALISM_COEFF: Record<Difficulty, number> = { easy: 0.8, medium: 0.5, hard: 0.3 };

// ── Business coefficient ──────────────────────────────────────────────────────

function getBusinessCoeff(
  keyword: string,
  priorityKeywords: string[],
  seoContext: Record<string, unknown> | null
): number {
  const kw = keyword.toLowerCase();
  const objective = (seoContext?.objective as string) ?? "";
  const isPriority = priorityKeywords.slice(0, 8).some(
    (pk) => pk.toLowerCase() === kw || kw.includes(pk.toLowerCase())
  );
  const isConversionFocused = ["conversion", "acquisition"].includes(objective);
  if (isPriority && isConversionFocused) return 1.3;
  if (isPriority) return 1.2;
  const transactional = ["acheter", "prix", "devis", "tarif", "commander", "meilleur", "comparatif", "avis", "buy", "price", "best"];
  if (transactional.some((s) => kw.includes(s))) return 1.15;
  const nonStrategic = ["gratuit", "free", "c'est quoi", "définition", "wikipedia"];
  if (nonStrategic.some((s) => kw.includes(s))) return 0.7;
  return 1.0;
}

// ── Action / timeframe ────────────────────────────────────────────────────────

function classifyAction(
  currentPosition: number | null,
  hasGSCData: boolean
): "optimization" | "creation" | "content_upgrade" {
  if (!hasGSCData || currentPosition === null) return "creation";
  if (currentPosition <= 20) return "optimization";
  return "content_upgrade";
}

function getTimeframe(difficulty: Difficulty, action: string): string {
  if (action === "creation") return "60-90 jours";
  if (difficulty === "easy") return "15-30 jours";
  if (difficulty === "medium") return "30-60 jours";
  return "60-90 jours";
}

// ── Rationale ─────────────────────────────────────────────────────────────────

function buildRationale(
  keyword: string,
  currentPosition: number | null,
  targetPosition: number,
  difficulty: Difficulty,
  action: string,
  gainAdjusted: number
): string {
  if (action === "creation") {
    return `Aucune page existante pour "${keyword}" — la créer vise le top ${targetPosition}. Gain conservateur estimé sur volumes similaires dans votre niche.`;
  }
  if (difficulty === "easy") {
    return `Position ${currentPosition} proche du top — une optimisation du title, H1 et densité sémantique peut décrocher le top ${targetPosition} rapidement. Gain de ~${gainAdjusted} clics/mois crédible.`;
  }
  if (difficulty === "medium") {
    return `Position ${currentPosition} nécessite un enrichissement éditorial (800+ mots, cocon interne, maillage) pour viser le top ${targetPosition}. Projection à 50% de fiabilité.`;
  }
  return `Position ${currentPosition} en zone difficile — backlinks et refonte profonde du contenu nécessaires pour atteindre le top ${targetPosition}. Estimation prudente (coefficient 0.3).`;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function computeProjections(
  keywords: string[],
  gscQueries: GSCQuery[],
  seoScore: number,
  seoContext: Record<string, unknown> | null,
  siteUrl: string
): ProjectionsResult {
  const gscMap = new Map<string, GSCQuery>();
  for (const q of gscQueries) {
    gscMap.set(q.query.toLowerCase(), q);
  }

  const items: ProjectionItem[] = [];

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    let gsc = gscMap.get(kw);
    if (!gsc) {
      for (const [q, data] of gscMap.entries()) {
        if (q.includes(kw) || kw.includes(q)) { gsc = data; break; }
      }
    }

    const hasGSCData = !!gsc;
    const currentPosition = gsc ? gsc.position : null;
    const currentImpressions = gsc ? gsc.impressions : 0;
    const currentClicks = gsc ? gsc.clicks : 0;

    const action = classifyAction(currentPosition, hasGSCData);
    const targetPosition = currentPosition ? getTargetPosition(currentPosition, seoScore) : 8;

    let impressionsForCalc = currentImpressions;
    if (!hasGSCData || impressionsForCalc < 50) {
      let medianImpressions = 200;
      if (gscQueries.length > 0) {
        const sorted = gscQueries.map((q) => q.impressions).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        medianImpressions = sorted[mid] ?? sorted[sorted.length - 1] ?? 200;
      }
      impressionsForCalc = Math.round(medianImpressions * 0.4);
    }

    const ctrTarget = getCTR(targetPosition);
    const gainBrut = Math.max(0, impressionsForCalc * ctrTarget - currentClicks);
    const difficulty = getDifficulty(currentPosition ?? 50, seoScore);
    const gainAdjusted = gainBrut * REALISM_COEFF[difficulty];
    const gainFinal = Math.round(gainAdjusted * getBusinessCoeff(keyword, keywords, seoContext));

    let confidence = hasGSCData ? 0.65 : 0.35;
    if (currentImpressions > 500) confidence += 0.15;
    else if (currentImpressions > 100) confidence += 0.08;
    if (difficulty === "easy") confidence += 0.1;
    if (difficulty === "hard") confidence -= 0.1;
    confidence = Math.round(Math.min(0.92, Math.max(0.20, confidence)) * 100) / 100;

    items.push({
      keyword,
      page: gsc ? `${siteUrl}/[page-existante]` : `${siteUrl}/[nouvelle-page]`,
      action,
      current_position: currentPosition,
      target_position: targetPosition,
      current_clicks: Math.round(currentClicks),
      potential_clicks: Math.round(currentClicks + gainFinal),
      estimated_gain: gainFinal,
      confidence_score: confidence,
      timeframe: getTimeframe(difficulty, action),
      rationale: buildRationale(keyword, currentPosition, targetPosition, difficulty, action, gainFinal),
      difficulty,
    });
  }

  items.sort((a, b) => b.estimated_gain - a.estimated_gain);

  const totalGain = items.reduce((s, i) => s + i.estimated_gain, 0);

  return {
    estimated_results: items,
    total_estimated_gain: {
      low: Math.round(totalGain * 0.65),
      high: Math.round(totalGain * 1.25),
    },
    total_current_clicks: items.reduce((s, i) => s + i.current_clicks, 0),
    has_gsc_data: gscQueries.length > 0,
    computed_at: new Date().toISOString(),
  };
}
