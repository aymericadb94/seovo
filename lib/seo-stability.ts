/**
 * SEO Stability Rules
 * Cooldowns, amplitude caps, smoothing, anti-chaos guards.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Cooldown Constants ───────────────────────────────────────────────────────

export const COOLDOWNS = {
  light: 24 * 60 * 60 * 1000,         // 24h
  intermediate: 7 * 24 * 60 * 60 * 1000, // 7 days
  full: 30 * 24 * 60 * 60 * 1000,     // 30 days
} as const;

export const AMPLITUDE_CAPS = {
  light: { max_reprioritized: 5 },
  intermediate: { max_clusters_modified: 1, max_articles_inserted: 3 },
  full: { max_cocoon_change_pct: 30 },
} as const;

export const NOISE_THRESHOLDS = {
  min_position_delta: 2,     // Ignore position changes < 2
  min_impressions: 20,       // Ignore queries < 20 impressions
  min_ctr_delta: 1.5,        // Ignore CTR changes < 1.5 points
  smoothing_window_days: 14, // Use 14-day average for decisions
} as const;

export type RecalcLevel = "light" | "intermediate" | "full";

// ── Cooldown checks ──────────────────────────────────────────────────────────

export async function canRecalc(
  supabase: SupabaseClient,
  userId: string,
  level: RecalcLevel
): Promise<{ allowed: boolean; reason?: string; lastRecalcAt?: string }> {
  const cooldown = COOLDOWNS[level];

  const { data } = await supabase
    .from("recalc_log")
    .select("created_at, level")
    .eq("user_id", userId)
    .eq("level", level)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { allowed: true };

  const lastAt = new Date(data.created_at).getTime();
  const elapsed = Date.now() - lastAt;

  if (elapsed < cooldown) {
    const remainingHours = Math.round((cooldown - elapsed) / (60 * 60 * 1000));
    return {
      allowed: false,
      reason: `Cooldown actif — prochain recalcul ${level} dans ~${remainingHours}h`,
      lastRecalcAt: data.created_at,
    };
  }

  return { allowed: true, lastRecalcAt: data.created_at };
}

// ── Determine recalc level from events ───────────────────────────────────────

export function determineRecalcLevel(
  events: { impact: number; event_type: string }[]
): RecalcLevel {
  if (events.length === 0) return "light";

  const maxImpact = Math.max(...events.map(e => e.impact));
  const totalImpact = events.reduce((s, e) => s + e.impact, 0);

  // Critical events force higher levels
  const hasCritical = events.some(e =>
    e.event_type === "site.page_deleted" ||
    (e.event_type === "gsc.position_down" && e.impact >= 7)
  );

  if (hasCritical || maxImpact >= 8) return "full";
  if (totalImpact >= 15 || maxImpact >= 5) return "intermediate";
  return "light";
}

// ── Determine if full recalc is overdue ──────────────────────────────────────

export async function isFullRecalcOverdue(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("recalc_log")
    .select("created_at")
    .eq("user_id", userId)
    .eq("level", "full")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return true; // Never had a full recalc
  const elapsed = Date.now() - new Date(data.created_at).getTime();
  return elapsed > COOLDOWNS.full;
}

// ── Log a recalc ─────────────────────────────────────────────────────────────

export async function logRecalc(
  supabase: SupabaseClient,
  userId: string,
  level: RecalcLevel,
  triggerReason: string,
  eventsProcessed: number,
  changesSummary: Record<string, unknown>
): Promise<void> {
  await supabase.from("recalc_log").insert({
    user_id: userId,
    level,
    trigger_reason: triggerReason,
    events_processed: eventsProcessed,
    changes_summary: changesSummary,
  });
}

// ── Deduplicate & smooth events ──────────────────────────────────────────────

export function smoothEvents(
  events: { event_type: string; impact: number; data: Record<string, unknown> }[]
): typeof events {
  // Group by keyword/query
  const byKey = new Map<string, typeof events>();
  for (const e of events) {
    const key = (e.data.query as string) ?? (e.data.keyword as string) ?? (e.data.url as string) ?? "global";
    const group = byKey.get(key) ?? [];
    group.push(e);
    byKey.set(key, group);
  }

  const smoothed: typeof events = [];
  for (const [, group] of byKey) {
    // Remove contradictions (position up + down on same keyword)
    const hasUp = group.some(e => e.event_type === "gsc.position_up");
    const hasDown = group.some(e => e.event_type === "gsc.position_down");
    if (hasUp && hasDown) {
      // Keep neither — contradictory signals cancel out
      const filtered = group.filter(e => e.event_type !== "gsc.position_up" && e.event_type !== "gsc.position_down");
      smoothed.push(...filtered);
      continue;
    }

    // Deduplicate: keep highest impact per event_type per key
    const byType = new Map<string, (typeof events)[0]>();
    for (const e of group) {
      const existing = byType.get(e.event_type);
      if (!existing || e.impact > existing.impact) {
        byType.set(e.event_type, e);
      }
    }
    smoothed.push(...byType.values());
  }

  return smoothed;
}

// ── Check publication milestones ─────────────────────────────────────────────

export async function checkPhaseCompletion(
  supabase: SupabaseClient,
  userId: string
): Promise<{ phase1PctDone: number; shouldTriggerFullRecalc: boolean }> {
  const [pubsRes, roadmapRes] = await Promise.all([
    supabase
      .from("publications")
      .select("keyword")
      .eq("user_id", userId),
    supabase
      .from("roadmaps")
      .select("data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const publishedKeywords = new Set(
    (pubsRes.data ?? []).map((p: { keyword: string }) => p.keyword.toLowerCase())
  );

  type RoadmapData = { phases?: { phase: number; ids: number[] }[]; articles?: { id: number; keyword: string }[] };
  const roadmap = roadmapRes.data?.data as RoadmapData | null;
  if (!roadmap?.phases || !roadmap?.articles) {
    return { phase1PctDone: 0, shouldTriggerFullRecalc: false };
  }

  const phase1Ids = new Set(roadmap.phases.find(p => p.phase === 1)?.ids ?? []);
  const phase1Articles = roadmap.articles.filter(a => phase1Ids.has(a.id));
  const phase1Published = phase1Articles.filter(a => publishedKeywords.has(a.keyword.toLowerCase()));
  const pct = phase1Articles.length > 0 ? Math.round((phase1Published.length / phase1Articles.length) * 100) : 0;

  return {
    phase1PctDone: pct,
    shouldTriggerFullRecalc: pct >= 50,
  };
}
