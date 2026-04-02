import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

export const maxDuration = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

type GSCQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-100 (percentage)
  position: number;
};

type SiteData = {
  keywords: string[];
  seo_context: Record<string, unknown> | null;
  seo_score_initial: number | null;
  site_url: string;
  gsc_site_url: string | null;
  google_refresh_token: string | null;
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

// ── PARTIE 1 — Table CTR réaliste ─────────────────────────────────────────────

const CTR_TABLE: Record<number, number> = {
  1: 0.25,
  2: 0.15,
  3: 0.10,
  4: 0.07,
  5: 0.05,
  6: 0.04,
  7: 0.03,
  8: 0.025,
  9: 0.02,
  10: 0.015,
};

function getCTR(position: number): number {
  const pos = Math.round(Math.max(1, Math.min(10, position)));
  return CTR_TABLE[pos] ?? 0.015;
}

// ── PARTIE 2 — Position atteignable ───────────────────────────────────────────

function getTargetPosition(
  currentPosition: number,
  seoScore: number // 0-100
): number {
  // Bonus de qualité : meilleur score SEO → optimisme légèrement supérieur
  const qualityBonus = seoScore >= 60 ? 1 : seoScore >= 40 ? 0 : -1;

  if (currentPosition <= 4) return Math.max(1, currentPosition - 1);
  if (currentPosition <= 10) return Math.max(1, Math.round(currentPosition * 0.5) + qualityBonus);
  if (currentPosition <= 20) return Math.max(3, Math.round(currentPosition * 0.35) + qualityBonus);
  if (currentPosition <= 50) return Math.max(5, 8 + qualityBonus);
  return 10; // > 50 : top 10 max
}

// ── PARTIE 3 — Coefficient de réalisme ────────────────────────────────────────

type Difficulty = "easy" | "medium" | "hard";

function getDifficulty(
  currentPosition: number,
  seoScore: number,
  impressions: number
): Difficulty {
  // Faible concurrence estimée : position entre 5-15 + bon score SEO
  if (currentPosition >= 5 && currentPosition <= 15 && seoScore >= 50) return "easy";
  // Haute concurrence : position > 30 ou très bas score
  if (currentPosition > 30 || seoScore < 30) return "hard";
  return "medium";
}

const REALISM_COEFF: Record<Difficulty, number> = {
  easy: 0.8,
  medium: 0.5,
  hard: 0.3,
};

// ── PARTIE 4 — Coefficient business ───────────────────────────────────────────

function getBusinessCoeff(
  keyword: string,
  priorityKeywords: string[],
  seoContext: Record<string, unknown> | null
): number {
  const kw = keyword.toLowerCase();
  // Priorité explicite dans seo_context ou dans les top keywords configurés
  const objective = (seoContext?.objective as string) ?? "";
  const isPriority = priorityKeywords.slice(0, 8).some(
    (pk) => pk.toLowerCase() === kw || kw.includes(pk.toLowerCase())
  );
  const isConversionFocused = ["conversion", "acquisition"].includes(objective);

  if (isPriority && isConversionFocused) return 1.3;
  if (isPriority) return 1.2;
  // Signaux transactionnels dans le mot-clé lui-même
  const transactionalSignals = ["acheter", "prix", "devis", "tarif", "commander", "meilleur", "comparatif", "avis", "buy", "price", "best"];
  if (transactionalSignals.some((s) => kw.includes(s))) return 1.15;
  // Non stratégique
  const nonStrategicSignals = ["gratuit", "free", "c'est quoi", "définition", "wikipedia"];
  if (nonStrategicSignals.some((s) => kw.includes(s))) return 0.7;
  return 1.0;
}

// ── PARTIE 5 — Logique par type d'action ──────────────────────────────────────

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

// ── PARTIE 8 — Rationale explicite ────────────────────────────────────────────

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

// ── GSC Fetch ──────────────────────────────────────────────────────────────────

async function fetchGSCQueries(token: string, gscSiteUrl: string): Promise<GSCQuery[]> {
  try {
    const siteUrl = encodeURIComponent(gscSiteUrl);
    const end = new Date(); end.setDate(end.getDate() - 2);
    const start = new Date(); start.setDate(start.getDate() - 32);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(start),
          endDate: fmt(end),
          dimensions: ["query"],
          rowLimit: 100,
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
      ctr: r.ctr * 100, // normalise en %
      position: Math.round(r.position * 10) / 10,
    }));
  } catch {
    return [];
  }
}

// ── Moteur principal ───────────────────────────────────────────────────────────

function computeProjections(
  keywords: string[],
  gscQueries: GSCQuery[],
  seoScore: number,
  seoContext: Record<string, unknown> | null,
  siteUrl: string
): ProjectionItem[] {
  const gscMap = new Map<string, GSCQuery>();
  for (const q of gscQueries) {
    gscMap.set(q.query.toLowerCase(), q);
  }

  const results: ProjectionItem[] = [];

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    // Recherche exacte d'abord, puis partielle
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

    // ── Action type
    const action = classifyAction(currentPosition, hasGSCData);

    // ── Position cible (Partie 2)
    const targetPosition = currentPosition
      ? getTargetPosition(currentPosition, seoScore)
      : 8; // Pour création : viser top 8 (conservateur)

    // ── Calcul gain brut (Partie 1)
    let impressionsForCalc = currentImpressions;
    if (!hasGSCData || impressionsForCalc < 50) {
      // Pour création ou données faibles : estimer volume via médiane des données GSC disponibles
      const medianImpressions = gscQueries.length > 0
        ? gscQueries
            .map((q) => q.impressions)
            .sort((a, b) => a - b)[Math.floor(gscQueries.length / 2)]
        : 200; // fallback ultra-conservateur
      impressionsForCalc = Math.round(medianImpressions * 0.4); // 40% du médian = conservateur
    }

    const ctrTarget = getCTR(targetPosition);
    const potentialClicksRaw = impressionsForCalc * ctrTarget;
    const gainBrut = Math.max(0, potentialClicksRaw - currentClicks);

    // ── Difficulté (Partie 3)
    const difficulty = getDifficulty(
      currentPosition ?? 50,
      seoScore,
      currentImpressions
    );
    const realismCoeff = REALISM_COEFF[difficulty];

    // ── Gain ajusté (Partie 3)
    const gainAdjusted = gainBrut * realismCoeff;

    // ── Coefficient business (Partie 4)
    const businessCoeff = getBusinessCoeff(keyword, keywords, seoContext);

    // ── Gain final
    const gainFinal = Math.round(gainAdjusted * businessCoeff);

    // ── Score de confiance composite
    // Base : fiabilité des données d'entrée
    let confidence = hasGSCData ? 0.65 : 0.35;
    if (currentImpressions > 500) confidence += 0.15;
    else if (currentImpressions > 100) confidence += 0.08;
    if (difficulty === "easy") confidence += 0.1;
    if (difficulty === "hard") confidence -= 0.1;
    confidence = Math.round(Math.min(0.92, Math.max(0.20, confidence)) * 100) / 100;

    // ── Potential clicks affiché (clics actuels + gain final)
    const potentialClicks = currentClicks + gainFinal;

    // ── Page associée
    const page = gsc
      ? `${siteUrl}/[page-existante]`
      : `${siteUrl}/[nouvelle-page]`;

    results.push({
      keyword,
      page,
      action,
      current_position: currentPosition,
      target_position: targetPosition,
      current_clicks: Math.round(currentClicks),
      potential_clicks: Math.round(potentialClicks),
      estimated_gain: gainFinal,
      confidence_score: confidence,
      timeframe: getTimeframe(difficulty, action),
      rationale: buildRationale(keyword, currentPosition, targetPosition, difficulty, action, gainFinal),
      difficulty,
    });
  }

  // Trier par gain final décroissant
  return results.sort((a, b) => b.estimated_gain - a.estimated_gain);
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Récupérer les projections déjà calculées
    const { data: cached } = await supabase
      .from("seo_projections")
      .select("data, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return Response.json({ projections: cached?.data ?? null, computed_at: cached?.created_at ?? null });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("keywords, seo_context, seo_score_initial, site_url, gsc_site_url, google_refresh_token")
      .eq("user_id", user.id)
      .single() as { data: SiteData | null };

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const keywords: string[] = site.keywords ?? [];
    if (keywords.length === 0) return Response.json({ error: "Aucun mot-clé configuré — lancez d'abord l'analyse SEO" }, { status: 400 });

    // ── Récupération GSC (optionnel)
    let gscQueries: GSCQuery[] = [];
    let hasGSCData = false;

    if (site.gsc_site_url) {
      const token = await getValidAccessToken(user.id);
      if (token) {
        gscQueries = await fetchGSCQueries(token, site.gsc_site_url);
        hasGSCData = gscQueries.length > 0;
      }
    }

    const seoScore = site.seo_score_initial ?? 35; // fallback conservateur si pas encore analysé
    const seoContext = site.seo_context as Record<string, unknown> | null;

    // ── Calcul des projections
    const items = computeProjections(
      keywords.slice(0, 25),
      gscQueries,
      seoScore,
      seoContext,
      site.site_url
    );

    // ── Agrégats (Partie 6)
    const totalGain = items.reduce((s, i) => s + i.estimated_gain, 0);
    const totalCurrentClicks = items.reduce((s, i) => s + i.current_clicks, 0);

    // Fourchette : low = -35% (pessimiste), high = +25% (optimiste modéré)
    const result: ProjectionsResult = {
      estimated_results: items,
      total_estimated_gain: {
        low: Math.round(totalGain * 0.65),
        high: Math.round(totalGain * 1.25),
      },
      total_current_clicks: totalCurrentClicks,
      has_gsc_data: hasGSCData,
      computed_at: new Date().toISOString(),
    };

    // ── Persistance
    await supabase
      .from("seo_projections")
      .upsert(
        { user_id: user.id, data: result, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    return Response.json({ projections: result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
