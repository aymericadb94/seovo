/**
 * SEO Projections Engine v2
 *
 * Calcul intelligent du potentiel SEO basé sur 4 sources :
 * 1. GSC (données réelles : position, impressions, CTR, clics)
 * 2. Cocon sémantique (potentiel trafic par cluster, rôle pilier/support)
 * 3. Roadmap (priorité, difficulté, phase)
 * 4. CMS (pages existantes = optimisation vs création)
 *
 * Chaque mot-clé reçoit un gain estimé DIFFÉRENCIÉ selon ces sources.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type GSCQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-1 decimal
  position: number;
};

export type CocoonContext = {
  clusters: {
    name: string;
    priority: string;
    traffic_potential: number;
    pillar: { keyword: string; status: string };
    support_pages: { keyword: string; status: string }[];
  }[];
};

export type RoadmapContext = {
  articles: {
    keyword: string;
    role: string;
    priority: number;
    difficulty?: string;
    intent?: string;
  }[];
};

export type CmsPage = {
  title: string;
  url: string;
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
  sources: string[]; // which data sources contributed
};

export type ProjectionsResult = {
  estimated_results: ProjectionItem[];
  total_estimated_gain: { low: number; high: number };
  total_current_clicks: number;
  has_gsc_data: boolean;
  has_cocoon_data: boolean;
  has_roadmap_data: boolean;
  has_cms_data: boolean;
  computed_at: string;
};

// ── CTR table (industry average, position → CTR) ─────────────────────────────

const CTR_TABLE: Record<number, number> = {
  1: 0.27, 2: 0.16, 3: 0.11, 4: 0.08, 5: 0.06,
  6: 0.045, 7: 0.035, 8: 0.028, 9: 0.022, 10: 0.018,
};

function getCTR(position: number): number {
  const pos = Math.round(Math.max(1, Math.min(10, position)));
  return CTR_TABLE[pos] ?? 0.018;
}

// ── Target position (where can we realistically rank?) ───────────────────────

function getTargetPosition(currentPosition: number, seoScore: number, isPillar: boolean): number {
  const qualityBonus = seoScore >= 60 ? 1 : seoScore >= 40 ? 0 : -1;
  const pillarBonus = isPillar ? 1 : 0; // pillars attract more links → rank higher

  if (currentPosition <= 4)  return Math.max(1, currentPosition - 1 - pillarBonus);
  if (currentPosition <= 10) return Math.max(1, Math.round(currentPosition * 0.45) + qualityBonus - pillarBonus);
  if (currentPosition <= 20) return Math.max(2, Math.round(currentPosition * 0.35) + qualityBonus - pillarBonus);
  if (currentPosition <= 50) return Math.max(4, 7 + qualityBonus - pillarBonus);
  return Math.max(5, 9 - pillarBonus);
}

// ── Difficulty ────────────────────────────────────────────────────────────────

type Difficulty = "easy" | "medium" | "hard";

function getDifficulty(
  currentPosition: number | null,
  seoScore: number,
  roadmapDifficulty: string | null,
  hasExistingPage: boolean,
): Difficulty {
  // Roadmap difficulty takes precedence if available
  if (roadmapDifficulty) {
    const rd = roadmapDifficulty.toLowerCase();
    if (rd === "facile" || rd === "easy") return "easy";
    if (rd === "difficile" || rd === "hard") return "hard";
    if (rd === "moyen" || rd === "medium") return "medium";
  }

  // Existing page + good position = easy optimization
  if (hasExistingPage && currentPosition && currentPosition <= 15 && seoScore >= 40) return "easy";
  if (hasExistingPage && currentPosition && currentPosition <= 25) return "medium";

  // No page, or far position
  if (!currentPosition || currentPosition > 40) return "hard";
  if (currentPosition > 25 || seoScore < 30) return "hard";
  if (currentPosition <= 20 && seoScore >= 40) return "easy";
  return "medium";
}

const REALISM_COEFF: Record<Difficulty, number> = { easy: 0.75, medium: 0.45, hard: 0.22 };

// ── Volume estimation (when no GSC data) ─────────────────────────────────────

function estimateVolume(
  keyword: string,
  cocoonTrafficPotential: number | null,
  roadmapPriority: number | null,
  isPillar: boolean,
  gscMedian: number,
): number {
  // Priority 1: cocoon traffic potential (AI-estimated per cluster)
  if (cocoonTrafficPotential && cocoonTrafficPotential > 0) {
    // Cluster potential is shared across pillar + supports
    // Pillar gets ~40% of cluster traffic, each support gets a share of the rest
    const baseFromCocoon = isPillar
      ? cocoonTrafficPotential * 0.4
      : cocoonTrafficPotential * 0.12;
    return Math.max(100, Math.round(baseFromCocoon));
  }

  // Priority 2: roadmap priority (lower = more important = higher estimated volume)
  if (roadmapPriority !== null) {
    if (roadmapPriority <= 5)  return Math.max(400, Math.round(gscMedian * 1.5));
    if (roadmapPriority <= 10) return Math.max(300, Math.round(gscMedian * 1.2));
    if (roadmapPriority <= 20) return Math.max(200, Math.round(gscMedian * 0.8));
    return Math.max(100, Math.round(gscMedian * 0.5));
  }

  // Priority 3: pillar keywords get higher base volume
  if (isPillar) return Math.max(300, Math.round(gscMedian * 1.3));

  // Priority 4: transactional keywords get higher volume
  const kw = keyword.toLowerCase();
  const transactional = ["acheter", "prix", "devis", "tarif", "commander", "grossiste", "fournisseur", "achat"];
  if (transactional.some(t => kw.includes(t))) return Math.max(250, Math.round(gscMedian * 1.1));

  // Default: proportional to GSC median with some variance
  const hash = keyword.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const variance = 0.6 + (hash % 80) / 100; // 0.6 to 1.4
  return Math.max(80, Math.round(gscMedian * variance));
}

// ── Business coefficient ──────────────────────────────────────────────────────

function getBusinessCoeff(
  keyword: string,
  intent: string | null,
  isPillar: boolean,
  seoContext: Record<string, unknown> | null,
): number {
  let coeff = 1.0;
  const kw = keyword.toLowerCase();

  // Pillar pages → more strategic
  if (isPillar) coeff += 0.15;

  // Transactional/commercial intent → conversion value
  if (intent === "transactionnelle" || intent === "transactional") coeff += 0.2;
  if (intent === "commerciale" || intent === "commercial") coeff += 0.1;

  // Keyword signal analysis
  const transactional = ["acheter", "prix", "devis", "tarif", "commander", "meilleur", "comparatif", "avis"];
  if (transactional.some(s => kw.includes(s))) coeff += 0.1;
  const nonStrategic = ["gratuit", "free", "c'est quoi", "définition", "wikipedia"];
  if (nonStrategic.some(s => kw.includes(s))) coeff -= 0.25;

  // Geography alignment
  const geography = (seoContext?.geography as string) ?? "";
  if (geography && kw.includes(geography.toLowerCase())) coeff += 0.05;

  return Math.max(0.5, Math.min(1.5, coeff));
}

// ── Action / timeframe ────────────────────────────────────────────────────────

function classifyAction(
  hasExistingPage: boolean,
  currentPosition: number | null,
): "optimization" | "creation" | "content_upgrade" {
  if (!hasExistingPage) return "creation";
  if (currentPosition && currentPosition <= 20) return "optimization";
  return "content_upgrade";
}

function getTimeframe(difficulty: Difficulty, action: string): string {
  if (action === "optimization" && difficulty === "easy") return "15-30 jours";
  if (action === "optimization") return "30-45 jours";
  if (action === "content_upgrade") return "30-60 jours";
  if (difficulty === "easy") return "30-60 jours";
  if (difficulty === "medium") return "60-90 jours";
  return "90-120 jours";
}

// ── Rationale builder ────────────────────────────────────────────────────────

function buildRationale(
  keyword: string,
  action: string,
  currentPosition: number | null,
  targetPosition: number,
  difficulty: Difficulty,
  gain: number,
  sources: string[],
): string {
  const srcLabel = sources.length > 1
    ? `(${sources.join(" + ")})`
    : `(${sources[0]})`;

  if (action === "creation") {
    return `Aucune page existante pour "${keyword}" — création visant top ${targetPosition}. Gain estimé : +${gain} clics/mois ${srcLabel}`;
  }
  if (action === "optimization" && difficulty === "easy") {
    return `Position ${currentPosition} optimisable rapidement (title, H1, maillage) → top ${targetPosition}. Quick win +${gain} clics/mois ${srcLabel}`;
  }
  if (action === "optimization") {
    return `Position ${currentPosition} → top ${targetPosition} via enrichissement contenu + maillage interne. +${gain} clics/mois ${srcLabel}`;
  }
  return `Page existante en position faible (${currentPosition ?? ">50"}) — refonte nécessaire pour viser top ${targetPosition}. +${gain} clics/mois ${srcLabel}`;
}

// ── Fuzzy keyword matching ───────────────────────────────────────────────────

function fuzzyMatch(keyword: string, target: string): boolean {
  const kwWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const targetLower = target.toLowerCase();
  if (kwWords.length === 0) return false;
  const matchCount = kwWords.filter(w => targetLower.includes(w)).length;
  return matchCount / kwWords.length >= 0.6;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export function computeProjections(
  keywords: string[],
  gscQueries: GSCQuery[],
  seoScore: number,
  seoContext: Record<string, unknown> | null,
  siteUrl: string,
  cocoon?: CocoonContext | null,
  roadmap?: RoadmapContext | null,
  cmsPages?: CmsPage[] | null,
): ProjectionsResult {

  // ── Build lookup maps ──────────────────────────────────────────────────────

  // GSC: keyword → metrics
  const gscMap = new Map<string, GSCQuery>();
  for (const q of gscQueries) {
    gscMap.set(q.query.toLowerCase(), q);
  }

  // GSC median impressions (for volume estimation)
  const gscMedian = (() => {
    if (gscQueries.length < 3) return 400;
    const sorted = gscQueries.map(q => q.impressions).sort((a, b) => a - b);
    return Math.max(150, sorted[Math.floor(sorted.length / 2)] ?? 400);
  })();

  // Cocoon: keyword → { clusterName, trafficPotential, isPillar }
  type CocoonInfo = { cluster: string; trafficPotential: number; isPillar: boolean; status: string | null };
  const cocoonMap = new Map<string, CocoonInfo>();
  if (cocoon?.clusters) {
    for (const c of cocoon.clusters) {
      if (c.pillar?.keyword) {
        cocoonMap.set(c.pillar.keyword.toLowerCase(), {
          cluster: c.name,
          trafficPotential: c.traffic_potential ?? 0,
          isPillar: true,
          status: c.pillar.status ?? null,
        });
      }
      for (const sp of c.support_pages ?? []) {
        if (sp.keyword) {
          cocoonMap.set(sp.keyword.toLowerCase(), {
            cluster: c.name,
            trafficPotential: c.traffic_potential ?? 0,
            isPillar: false,
            status: sp.status ?? null,
          });
        }
      }
    }
  }

  // Roadmap: keyword → { priority, difficulty, role, intent }
  type RoadmapInfo = { priority: number; difficulty: string | null; role: string; intent: string | null };
  const roadmapMap = new Map<string, RoadmapInfo>();
  if (roadmap?.articles) {
    for (const a of roadmap.articles) {
      if (a.keyword) {
        roadmapMap.set(a.keyword.toLowerCase(), {
          priority: a.priority,
          difficulty: a.difficulty ?? null,
          role: a.role,
          intent: a.intent ?? null,
        });
      }
    }
  }

  // CMS: check if page exists for keyword (fuzzy title match)
  const cmsTitles = (cmsPages ?? []).map(p => p.title.toLowerCase());
  const cmsUrls = (cmsPages ?? []).map(p => p.url);
  function findExistingPage(keyword: string): string | null {
    const kwLower = keyword.toLowerCase();
    // Exact title match
    const idx = cmsTitles.findIndex(t => t.includes(kwLower) || kwLower.split(/\s+/).filter(w => w.length > 3).every(w => t.includes(w)));
    if (idx >= 0) return cmsUrls[idx] ?? null;
    // Fuzzy match
    const fuzzyIdx = cmsTitles.findIndex(t => fuzzyMatch(keyword, t));
    if (fuzzyIdx >= 0) return cmsUrls[fuzzyIdx] ?? null;
    return null;
  }

  // ── Process each keyword ───────────────────────────────────────────────────

  const items: ProjectionItem[] = [];

  for (const keyword of keywords) {
    const kwLower = keyword.toLowerCase();

    // Gather data from all sources
    let gsc = gscMap.get(kwLower);
    if (!gsc) {
      // Fuzzy GSC match
      for (const [q, data] of gscMap.entries()) {
        if (fuzzyMatch(keyword, q) || q.includes(kwLower) || kwLower.includes(q)) {
          gsc = data;
          break;
        }
      }
    }

    const cocoonInfo = cocoonMap.get(kwLower) ?? (() => {
      // Fuzzy cocoon match
      for (const [k, v] of cocoonMap.entries()) {
        if (fuzzyMatch(keyword, k)) return v;
      }
      return null;
    })();

    const roadmapInfo = roadmapMap.get(kwLower) ?? (() => {
      for (const [k, v] of roadmapMap.entries()) {
        if (fuzzyMatch(keyword, k)) return v;
      }
      return null;
    })();

    // Cocon status "existing"/"existant" = page already exists (source of truth from cocon audit)
    const cocoonSaysExisting = cocoonInfo?.status
      ? ["existing", "existant", "existante", "publié", "publiée", "published"].includes(cocoonInfo.status.toLowerCase())
      : false;
    const existingPageUrl = cocoonSaysExisting
      ? (findExistingPage(keyword) ?? `${siteUrl}/[existing-cocoon]`)
      : (cmsPages && cmsPages.length > 0) ? findExistingPage(keyword) : (gsc ? `${siteUrl}/[existing]` : null);
    const hasExistingPage = !!existingPageUrl;

    // Track sources
    const sources: string[] = [];
    if (gsc) sources.push("GSC");
    if (cocoonInfo) sources.push("Cocon");
    if (roadmapInfo) sources.push("Roadmap");
    if (hasExistingPage && cmsPages && cmsPages.length > 0) sources.push("CMS");
    if (sources.length === 0) sources.push("Estimation");

    // Determine role
    const isPillar = cocoonInfo?.isPillar
      ?? (roadmapInfo?.role === "pilier" || roadmapInfo?.role === "pillar" || roadmapInfo?.role === "cluster")
      ?? false;

    // Position & impressions
    const currentPosition = gsc?.position ?? null;
    const currentClicks = gsc?.clicks ?? 0;
    const currentImpressions = gsc?.impressions ?? 0;

    // Estimate volume when no/low GSC data
    let impressionsForCalc = currentImpressions;
    if (!gsc || impressionsForCalc < 50) {
      const estimated = estimateVolume(
        keyword,
        cocoonInfo?.trafficPotential ?? null,
        roadmapInfo?.priority ?? null,
        isPillar,
        gscMedian,
      );
      impressionsForCalc = gsc
        ? Math.max(impressionsForCalc, Math.round(estimated * 0.5))
        : estimated;
    }

    // Target position
    const simulatedPosition = currentPosition ?? (isPillar ? 20 : seoScore >= 40 ? 28 : 38);
    const targetPosition = currentPosition
      ? getTargetPosition(currentPosition, seoScore, isPillar)
      : (isPillar ? Math.max(2, 5 - Math.floor(seoScore / 30)) : Math.max(4, 7 - Math.floor(seoScore / 30)));

    // Difficulty
    const difficulty = getDifficulty(
      currentPosition,
      seoScore,
      roadmapInfo?.difficulty ?? null,
      hasExistingPage,
    );

    // Gain calculation
    const ctrTarget = getCTR(targetPosition);
    const gainBrut = Math.max(0, impressionsForCalc * ctrTarget - currentClicks);
    const gainRealistic = gainBrut * REALISM_COEFF[difficulty];
    const businessCoeff = getBusinessCoeff(keyword, roadmapInfo?.intent ?? null, isPillar, seoContext);
    const gainFinal = Math.max(1, Math.round(gainRealistic * businessCoeff));

    // Confidence
    let confidence = 0.30;
    if (gsc) confidence += 0.25;
    if (gsc && currentImpressions > 500) confidence += 0.12;
    else if (gsc && currentImpressions > 100) confidence += 0.06;
    if (cocoonInfo) confidence += 0.10;
    if (roadmapInfo) confidence += 0.08;
    if (hasExistingPage) confidence += 0.08;
    if (difficulty === "easy") confidence += 0.08;
    if (difficulty === "hard") confidence -= 0.08;
    confidence = Math.round(Math.min(0.92, Math.max(0.15, confidence)) * 100) / 100;

    // Action
    const action = classifyAction(hasExistingPage, currentPosition);

    items.push({
      keyword,
      page: existingPageUrl ?? `${siteUrl}/[nouvelle-page]`,
      action,
      current_position: currentPosition,
      target_position: targetPosition,
      current_clicks: Math.round(currentClicks),
      potential_clicks: Math.round(currentClicks + gainFinal),
      estimated_gain: gainFinal,
      confidence_score: confidence,
      timeframe: getTimeframe(difficulty, action),
      rationale: buildRationale(keyword, action, currentPosition, targetPosition, difficulty, gainFinal, sources),
      difficulty,
      sources,
    });
  }

  // Sort by estimated gain DESC
  items.sort((a, b) => b.estimated_gain - a.estimated_gain);

  // Total gain with confidence-weighted range
  const totalGain = items.reduce((s, i) => s + i.estimated_gain, 0);
  const avgConfidence = items.length > 0
    ? items.reduce((s, i) => s + i.confidence_score, 0) / items.length
    : 0.3;

  // Range based on actual confidence instead of fixed multiplier
  const lowMultiplier = Math.max(0.4, avgConfidence - 0.15);
  const highMultiplier = Math.min(1.5, avgConfidence + 0.45);

  return {
    estimated_results: items,
    total_estimated_gain: {
      low: Math.round(totalGain * lowMultiplier),
      high: Math.round(totalGain * highMultiplier),
    },
    total_current_clicks: items.reduce((s, i) => s + i.current_clicks, 0),
    has_gsc_data: gscQueries.length > 0,
    has_cocoon_data: !!(cocoon?.clusters?.length),
    has_roadmap_data: !!(roadmap?.articles?.length),
    has_cms_data: !!(cmsPages && cmsPages.length > 0),
    computed_at: new Date().toISOString(),
  };
}
