/**
 * SEO Feedback Loop
 * Tracks actions, measures results at J+7/J+14/J+30, adjusts confidence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCQuery } from "@/lib/seo-projections";

// ── Types ────────────────────────────────────────────────────────────────────

export type ActionType = "publication" | "optimization" | "linking" | "content_upgrade";
export type Outcome = "success" | "progressing" | "stagnant" | "underperforming" | "not_indexed" | null;

type ActionMetrics = {
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
};

// ── Record a new action ──────────────────────────────────────────────────────

export async function recordAction(
  supabase: SupabaseClient,
  userId: string,
  actionType: ActionType,
  keyword: string,
  pageUrl: string,
  clusterName: string | null,
  gscQueries: GSCQuery[],
  projectedGain: number
): Promise<void> {
  // Capture baseline metrics from GSC
  const gsc = gscQueries.find(q => q.query.toLowerCase() === keyword.toLowerCase());
  const metricsBefore: ActionMetrics = gsc
    ? { position: gsc.position, impressions: gsc.impressions, clicks: gsc.clicks, ctr: gsc.ctr }
    : { position: null, impressions: 0, clicks: 0, ctr: 0 };

  await supabase.from("seo_actions").insert({
    user_id: userId,
    action_type: actionType,
    keyword,
    page_url: pageUrl,
    cluster_name: clusterName,
    metrics_before: metricsBefore,
    projection_gain: projectedGain,
  });
}

// ── Measure feedback for pending actions ─────────────────────────────────────

export async function measureFeedback(
  supabase: SupabaseClient,
  userId: string,
  gscQueries: GSCQuery[]
): Promise<{ measured: number; outcomes: Record<string, number> }> {
  const gscMap = new Map(gscQueries.map(q => [q.query.toLowerCase(), q]));

  // Get actions that need measurement (no outcome yet)
  const { data: pendingActions } = await supabase
    .from("seo_actions")
    .select("*")
    .eq("user_id", userId)
    .is("outcome", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!pendingActions || pendingActions.length === 0) {
    return { measured: 0, outcomes: {} };
  }

  const outcomeCounts: Record<string, number> = {};
  let measured = 0;

  for (const action of pendingActions) {
    const createdAt = new Date(action.created_at).getTime();
    const daysSince = Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000));

    const gsc = gscMap.get((action.keyword as string).toLowerCase());
    const currentMetrics: ActionMetrics = gsc
      ? { position: gsc.position, impressions: gsc.impressions, clicks: gsc.clicks, ctr: gsc.ctr }
      : { position: null, impressions: 0, clicks: 0, ctr: 0 };

    const before = (action.metrics_before ?? {}) as ActionMetrics;

    // Checkpoint J+7
    if (daysSince >= 7 && !action.metrics_7d) {
      await supabase
        .from("seo_actions")
        .update({ metrics_7d: currentMetrics })
        .eq("id", action.id);
    }

    // Checkpoint J+14
    if (daysSince >= 14 && !action.metrics_14d) {
      await supabase
        .from("seo_actions")
        .update({ metrics_14d: currentMetrics })
        .eq("id", action.id);
    }

    // Final evaluation at J+30
    if (daysSince >= 30 && !action.outcome) {
      const outcome = evaluateOutcome(before, currentMetrics, action.projection_gain ?? 0);
      const actualGain = currentMetrics.clicks - (before.clicks ?? 0);

      await supabase
        .from("seo_actions")
        .update({
          metrics_30d: currentMetrics,
          outcome,
          actual_gain: actualGain,
        })
        .eq("id", action.id);

      if (outcome) outcomeCounts[outcome] = (outcomeCounts[outcome] ?? 0) + 1;
      measured++;
    }
    // Early success detection at J+14
    else if (daysSince >= 14 && daysSince < 30 && !action.outcome) {
      const posImproved = before.position !== null && currentMetrics.position !== null
        && (before.position - currentMetrics.position) >= 5;

      if (posImproved) {
        await supabase
          .from("seo_actions")
          .update({ outcome: "progressing" })
          .eq("id", action.id);
        outcomeCounts["progressing"] = (outcomeCounts["progressing"] ?? 0) + 1;
        measured++;
      }
    }
  }

  return { measured, outcomes: outcomeCounts };
}

// ── Evaluate outcome ─────────────────────────────────────────────────────────

function evaluateOutcome(
  before: ActionMetrics,
  after: ActionMetrics,
  projectedGain: number
): Outcome {
  // Not indexed
  if (after.position === null && after.impressions === 0) {
    return "not_indexed";
  }

  const clicksDelta = after.clicks - (before.clicks ?? 0);
  const positionDelta = before.position !== null && after.position !== null
    ? before.position - after.position // positive = improvement
    : 0;

  // Success: clicks >= 80% of projected gain
  if (projectedGain > 0 && clicksDelta >= projectedGain * 0.8) {
    return "success";
  }

  // Success: significant position improvement
  if (positionDelta >= 5 && after.clicks > (before.clicks ?? 0)) {
    return "success";
  }

  // Progressing: moderate improvement
  if (positionDelta >= 3 || clicksDelta > 0) {
    return "progressing";
  }

  // Underperforming: clicks < 30% of projected
  if (projectedGain > 0 && clicksDelta < projectedGain * 0.3) {
    return "underperforming";
  }

  // Stagnant: no meaningful change
  return "stagnant";
}

// ── Calibrate projection model ───────────────────────────────────────────────

export async function calibrateProjectionModel(
  supabase: SupabaseClient,
  userId: string
): Promise<{ adjustment: number; reason: string } | null> {
  // Get completed actions from last 60 days with both projected and actual gains
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const { data: completedActions } = await supabase
    .from("seo_actions")
    .select("projection_gain, actual_gain, outcome")
    .eq("user_id", userId)
    .not("outcome", "is", null)
    .not("actual_gain", "is", null)
    .gte("created_at", cutoff.toISOString())
    .limit(50);

  if (!completedActions || completedActions.length < 5) {
    return null; // Not enough data to calibrate
  }

  // Calculate average deviation
  let totalProjected = 0;
  let totalActual = 0;
  for (const a of completedActions) {
    totalProjected += (a.projection_gain as number) ?? 0;
    totalActual += (a.actual_gain as number) ?? 0;
  }

  if (totalProjected === 0) return null;

  const ratio = totalActual / totalProjected;
  const deviation = ratio - 1; // positive = model too pessimistic, negative = too optimistic

  if (Math.abs(deviation) < 0.2) {
    return null; // Within acceptable range
  }

  // Cap adjustment at ±15%
  const adjustment = Math.max(-0.15, Math.min(0.15, deviation * 0.5));
  const reason = deviation > 0
    ? `Modèle trop pessimiste (réel ${Math.round(ratio * 100)}% du projeté) — ajustement +${Math.round(adjustment * 100)}%`
    : `Modèle trop optimiste (réel ${Math.round(ratio * 100)}% du projeté) — ajustement ${Math.round(adjustment * 100)}%`;

  return { adjustment, reason };
}

// ── Get feedback summary ─────────────────────────────────────────────────────

export async function getFeedbackSummary(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  total_actions: number;
  outcomes: Record<string, number>;
  avg_gain: number;
  model_accuracy: number;
}> {
  const { data } = await supabase
    .from("seo_actions")
    .select("outcome, projection_gain, actual_gain")
    .eq("user_id", userId)
    .not("outcome", "is", null);

  const actions = data ?? [];
  const outcomes: Record<string, number> = {};
  let totalProjected = 0;
  let totalActual = 0;

  for (const a of actions) {
    const outcome = a.outcome as string;
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    totalProjected += (a.projection_gain as number) ?? 0;
    totalActual += (a.actual_gain as number) ?? 0;
  }

  return {
    total_actions: actions.length,
    outcomes,
    avg_gain: actions.length > 0 ? Math.round(totalActual / actions.length) : 0,
    model_accuracy: totalProjected > 0 ? Math.round((totalActual / totalProjected) * 100) : 0,
  };
}
