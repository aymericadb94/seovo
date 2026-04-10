/**
 * SEO Event Detection System
 * Compares GSC snapshots, detects events, and stores them for processing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GSCQuery } from "@/lib/seo-projections";

// ── Types ────────────────────────────────────────────────────────────────────

export type SeoEventType =
  | "gsc.new_query"
  | "gsc.position_up"
  | "gsc.position_down"
  | "gsc.ctr_anomaly"
  | "gsc.new_page_indexed"
  | "site.page_created"
  | "site.page_deleted"
  | "rp.content_generated"
  | "rp.optimization_done"
  | "rp.linking_added"
  | "rp.milestone_reached";

export type SeoEventCategory = "gsc" | "site" | "rankpill";

export type SeoEvent = {
  event_type: SeoEventType;
  category: SeoEventCategory;
  impact: number; // 1-10
  data: Record<string, unknown>;
};

type GscSnapshotRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageRow = {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

// ── CTR table (expected CTR by position, for anomaly detection) ──────────────

const EXPECTED_CTR: Record<number, number> = {
  1: 0.25, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
};

function expectedCtr(position: number): number {
  const pos = Math.round(Math.max(1, Math.min(10, position)));
  return EXPECTED_CTR[pos] ?? 0.01;
}

// ── Snapshot storage ─────────────────────────────────────────────────────────

export async function saveGscSnapshot(
  supabase: SupabaseClient,
  userId: string,
  queries: GscSnapshotRow[],
  pages: GscPageRow[]
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("gsc_snapshots")
    .upsert(
      { user_id: userId, snapshot_date: today, queries, pages },
      { onConflict: "user_id,snapshot_date" }
    );
}

async function getPreviousSnapshot(
  supabase: SupabaseClient,
  userId: string,
  daysAgo: number = 7
): Promise<{ queries: GscSnapshotRow[]; pages: GscPageRow[] } | null> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - daysAgo);
  const dateStr = targetDate.toISOString().split("T")[0];

  const { data } = await supabase
    .from("gsc_snapshots")
    .select("queries, pages")
    .eq("user_id", userId)
    .lte("snapshot_date", dateStr)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    queries: (data.queries ?? []) as GscSnapshotRow[],
    pages: (data.pages ?? []) as GscPageRow[],
  };
}

// ── Event Detection ──────────────────────────────────────────────────────────

export async function detectGscEvents(
  supabase: SupabaseClient,
  userId: string,
  currentQueries: GscSnapshotRow[],
  currentPages: GscPageRow[]
): Promise<SeoEvent[]> {
  const events: SeoEvent[] = [];
  const prev = await getPreviousSnapshot(supabase, userId, 7);
  if (!prev) return events; // First snapshot, no comparison possible

  const prevQueryMap = new Map(prev.queries.map(q => [q.query, q]));
  const prevPageMap = new Map(prev.pages.map(p => [p.url, p]));

  // 1. New queries
  for (const q of currentQueries) {
    if (!prevQueryMap.has(q.query) && q.impressions >= 50) {
      events.push({
        event_type: "gsc.new_query",
        category: "gsc",
        impact: q.impressions > 200 ? 6 : 4,
        data: { query: q.query, impressions: q.impressions, position: q.position, clicks: q.clicks },
      });
    }
  }

  // 2. Position changes (using 7-day comparison for smoothing)
  for (const q of currentQueries) {
    const old = prevQueryMap.get(q.query);
    if (!old) continue;
    const delta = old.position - q.position; // positive = improvement

    if (delta >= 3) {
      events.push({
        event_type: "gsc.position_up",
        category: "gsc",
        impact: q.position <= 5 ? 5 : 4,
        data: { query: q.query, old_position: old.position, new_position: q.position, delta, impressions: q.impressions },
      });
    } else if (delta <= -5) {
      events.push({
        event_type: "gsc.position_down",
        category: "gsc",
        impact: old.position <= 10 ? 7 : 5,
        data: { query: q.query, old_position: old.position, new_position: q.position, delta: Math.abs(delta), impressions: q.impressions },
      });
    }
  }

  // 3. CTR anomalies
  for (const q of currentQueries) {
    if (q.impressions < 100 || q.position > 10) continue;
    const expected = expectedCtr(q.position);
    if (q.ctr < expected * 0.5) {
      events.push({
        event_type: "gsc.ctr_anomaly",
        category: "gsc",
        impact: 5,
        data: {
          query: q.query,
          position: q.position,
          observed_ctr: Math.round(q.ctr * 1000) / 10,
          expected_ctr: Math.round(expected * 1000) / 10,
          impressions: q.impressions,
        },
      });
    }
  }

  // 4. New pages indexed
  for (const p of currentPages) {
    if (!prevPageMap.has(p.url)) {
      events.push({
        event_type: "gsc.new_page_indexed",
        category: "gsc",
        impact: 3,
        data: { url: p.url, clicks: p.clicks, impressions: p.impressions },
      });
    }
  }

  return events;
}

// ── Emit events ──────────────────────────────────────────────────────────────

export async function emitEvent(
  supabase: SupabaseClient,
  userId: string,
  event: SeoEvent
): Promise<void> {
  await supabase.from("seo_events").insert({
    user_id: userId,
    event_type: event.event_type,
    category: event.category,
    impact: event.impact,
    data: event.data,
    processed: false,
  });
}

export async function emitEvents(
  supabase: SupabaseClient,
  userId: string,
  events: SeoEvent[]
): Promise<void> {
  if (events.length === 0) return;
  await supabase.from("seo_events").insert(
    events.map(e => ({
      user_id: userId,
      event_type: e.event_type,
      category: e.category,
      impact: e.impact,
      data: e.data,
      processed: false,
    }))
  );
}

// ── Emit Rankpill-specific events ────────────────────────────────────────────

export function createPublicationEvent(
  keyword: string,
  title: string,
  url: string,
  clusterName?: string
): SeoEvent {
  return {
    event_type: "rp.content_generated",
    category: "rankpill",
    impact: 5,
    data: { keyword, title, url, cluster: clusterName ?? null },
  };
}

export function createMilestoneEvent(
  totalPublications: number
): SeoEvent | null {
  if ([10, 20, 30, 50, 75, 100].includes(totalPublications)) {
    return {
      event_type: "rp.milestone_reached",
      category: "rankpill",
      impact: totalPublications >= 30 ? 5 : 4,
      data: { total: totalPublications },
    };
  }
  return null;
}

// ── Fetch unprocessed events ─────────────────────────────────────────────────

export async function getUnprocessedEvents(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; event_type: SeoEventType; category: SeoEventCategory; impact: number; data: Record<string, unknown> }[]> {
  const { data } = await supabase
    .from("seo_events")
    .select("id, event_type, category, impact, data")
    .eq("user_id", userId)
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []) as { id: string; event_type: SeoEventType; category: SeoEventCategory; impact: number; data: Record<string, unknown> }[];
}

export async function markEventsProcessed(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<void> {
  if (eventIds.length === 0) return;
  await supabase
    .from("seo_events")
    .update({ processed: true })
    .in("id", eventIds);
}

// ── GSC Data Fetching Helper ─────────────────────────────────────────────────

export async function fetchGscData(
  token: string,
  gscSiteUrl: string,
  days: number = 30
): Promise<{ queries: GscSnapshotRow[]; pages: GscPageRow[] }> {
  const now = new Date();
  const endDate = new Date(now); endDate.setDate(endDate.getDate() - 2);
  const startDate = new Date(now); startDate.setDate(startDate.getDate() - days);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const apiBase = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/searchAnalytics/query`;

  const [queriesRes, pagesRes] = await Promise.all([
    fetch(apiBase, {
      method: "POST", headers,
      body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ["query"], rowLimit: 500 }),
    }),
    fetch(apiBase, {
      method: "POST", headers,
      body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ["page"], rowLimit: 100 }),
    }),
  ]);

  type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
  type Res = { rows?: Row[] };

  const queries: GscSnapshotRow[] = [];
  const pages: GscPageRow[] = [];

  if (queriesRes.ok) {
    const data = await queriesRes.json() as Res;
    for (const r of data.rows ?? []) {
      queries.push({
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: Math.round(r.position * 10) / 10,
      });
    }
  }

  if (pagesRes.ok) {
    const data = await pagesRes.json() as Res;
    for (const r of data.rows ?? []) {
      pages.push({
        url: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: Math.round(r.position * 10) / 10,
      });
    }
  }

  return { queries, pages };
}
