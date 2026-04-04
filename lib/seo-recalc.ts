/**
 * SEO Recalculation Engine
 * 3 levels: light (no Claude), intermediate (1 Claude call), full (rebuild all).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { computeProjections, type GSCQuery } from "@/lib/seo-projections";
import {
  type SeoEventType,
  getUnprocessedEvents,
  markEventsProcessed,
} from "@/lib/seo-events";
import {
  type RecalcLevel,
  determineRecalcLevel,
  canRecalc,
  logRecalc,
  smoothEvents,
  isFullRecalcOverdue,
  checkPhaseCompletion,
  AMPLITUDE_CAPS,
} from "@/lib/seo-stability";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ────────────────────────────────────────────────────────────────────

type RecalcResult = {
  level: RecalcLevel;
  executed: boolean;
  skipped_reason?: string;
  events_processed: number;
  changes: Record<string, unknown>;
};

type RoadmapArticle = {
  id: number;
  title: string;
  keyword: string;
  role: string;
  priority: number;
  difficulty?: string;
  conversion?: string;
  objective?: string;
  related?: number[];
  intent?: string;
  angle?: string;
  why_rank?: string;
  summary?: string;
};

type RoadmapData = {
  articles: RoadmapArticle[];
  phases: { phase: number; label: string; weeks: string; ids: number[]; rationale: string }[];
  business_analysis?: Record<string, unknown>;
  internal_linking_rules?: string[];
  editorial_guidelines?: string;
};

type CocoonCluster = {
  name: string;
  objective: string;
  priority: string;
  traffic_potential: number;
  pillar: { title: string; keyword: string; status: string; url?: string };
  support_pages: { title: string; keyword: string; status: string; url?: string }[];
  internal_links?: { from: string; to: string; anchor: string; direction: string }[];
};

type CocoonData = {
  score: number;
  score_label: string;
  diagnosis: string;
  clusters: CocoonCluster[];
  orphan_pages?: { title: string; url: string; recommendation: string }[];
  missing_pages?: { title: string; keyword: string; cluster: string; priority: string; reason: string }[];
  optimization_actions?: { action: string; impact: string; effort: string; cluster: string }[];
  traffic_potential?: { current_estimated: number; potential_6_months: number; growth_percentage: number };
};

// ── Main orchestrator ────────────────────────────────────────────────────────

export async function runRecalc(
  supabase: SupabaseClient,
  userId: string,
  gscQueries: GSCQuery[],
  forceLevel?: RecalcLevel
): Promise<RecalcResult> {
  // 1. Get unprocessed events
  const rawEvents = await getUnprocessedEvents(supabase, userId);
  const events = smoothEvents(rawEvents);

  // 2. Determine level
  let level = forceLevel ?? determineRecalcLevel(events);

  // Check if full recalc is overdue
  if (level !== "full") {
    const overdue = await isFullRecalcOverdue(supabase, userId);
    const phaseCheck = await checkPhaseCompletion(supabase, userId);
    if (overdue || phaseCheck.shouldTriggerFullRecalc) {
      level = "full";
    }
  }

  // 3. Check cooldowns (bypass for forced recalcs)
  if (!forceLevel) {
    const { allowed, reason } = await canRecalc(supabase, userId, level);
    if (!allowed) {
      // Try a lower level
      if (level === "full") {
        const intermediateCheck = await canRecalc(supabase, userId, "intermediate");
        if (intermediateCheck.allowed) {
          level = "intermediate";
        } else {
          const lightCheck = await canRecalc(supabase, userId, "light");
          if (lightCheck.allowed) {
            level = "light";
          } else {
            return { level, executed: false, skipped_reason: reason, events_processed: 0, changes: {} };
          }
        }
      } else if (level === "intermediate") {
        const lightCheck = await canRecalc(supabase, userId, "light");
        if (lightCheck.allowed) {
          level = "light";
        } else {
          return { level, executed: false, skipped_reason: reason, events_processed: 0, changes: {} };
        }
      } else {
        return { level, executed: false, skipped_reason: reason, events_processed: 0, changes: {} };
      }
    }
  }

  // 4. Execute recalc
  let changes: Record<string, unknown> = {};
  try {
    switch (level) {
      case "light":
        changes = await recalcLight(supabase, userId, gscQueries, events);
        break;
      case "intermediate":
        changes = await recalcIntermediate(supabase, userId, gscQueries, events);
        break;
      case "full":
        changes = await recalcFull(supabase, userId, gscQueries, events);
        break;
    }
  } catch (err) {
    console.error(`[seo-recalc] ${level} recalc failed:`, err);
    changes = { error: err instanceof Error ? err.message : "Unknown error" };
  }

  // 5. Mark events as processed
  const eventIds = rawEvents.map(e => e.id);
  await markEventsProcessed(supabase, eventIds);

  // 6. Log the recalc
  const triggerReason = events.length > 0
    ? `${events.length} events (max impact: ${Math.max(...events.map(e => e.impact))})`
    : forceLevel ? `forced ${forceLevel}` : "scheduled";

  await logRecalc(supabase, userId, level, triggerReason, events.length, changes);

  return { level, executed: true, events_processed: events.length, changes };
}

// ══════════════════════════════════════════════════════════════════════════════
// LIGHT RECALC — No Claude, pure computation
// ══════════════════════════════════════════════════════════════════════════════

async function recalcLight(
  supabase: SupabaseClient,
  userId: string,
  gscQueries: GSCQuery[],
  events: { event_type: string; impact: number; data: Record<string, unknown> }[]
): Promise<Record<string, unknown>> {
  const changes: Record<string, unknown> = { level: "light", actions: [] };
  const actions: string[] = [];

  // 1. Fetch site info
  const { data: site } = await supabase
    .from("sites")
    .select("keywords, seo_score_initial, seo_context, site_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!site) return { ...changes, error: "Site not found" };

  // 2. Recompute projections with fresh GSC data
  const projections = computeProjections(
    site.keywords ?? [],
    gscQueries,
    site.seo_score_initial ?? 35,
    site.seo_context as Record<string, unknown> | null,
    site.site_url
  );

  await supabase
    .from("seo_projections")
    .upsert(
      { user_id: userId, data: projections, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  actions.push("projections_updated");

  // 3. Re-prioritize roadmap based on events
  const { data: roadmapRec } = await supabase
    .from("roadmaps")
    .select("id, data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (roadmapRec?.data) {
    const roadmap = roadmapRec.data as RoadmapData;
    const published = await getPublishedKeywords(supabase, userId);
    const reprioritized = reprioritizeRoadmap(roadmap, gscQueries, events, published);

    if (reprioritized.changed > 0) {
      await supabase
        .from("roadmaps")
        .update({ data: reprioritized.roadmap })
        .eq("id", roadmapRec.id);
      actions.push(`roadmap_reprioritized:${reprioritized.changed}`);
    }
  }

  changes.actions = actions;
  changes.projections_gain = projections.total_estimated_gain;
  return changes;
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERMEDIATE RECALC — 1 Claude call for linking/cluster adjustments
// ══════════════════════════════════════════════════════════════════════════════

async function recalcIntermediate(
  supabase: SupabaseClient,
  userId: string,
  gscQueries: GSCQuery[],
  events: { event_type: string; impact: number; data: Record<string, unknown> }[]
): Promise<Record<string, unknown>> {
  // First do everything the light recalc does
  const lightChanges = await recalcLight(supabase, userId, gscQueries, events);
  const actions = (lightChanges.actions as string[]) ?? [];

  // Fetch cocoon
  const { data: cocoonRec } = await supabase
    .from("semantic_cocoons")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  if (!cocoonRec?.data) {
    return { ...lightChanges, intermediate_skipped: "no cocoon data" };
  }

  const cocoon = cocoonRec.data as CocoonData;

  // Fetch published articles
  const { data: pubs } = await supabase
    .from("publications")
    .select("title, keyword, wordpress_url")
    .eq("user_id", userId);

  const published = pubs ?? [];

  // Fetch site info
  const { data: site } = await supabase
    .from("sites")
    .select("business_name, industry, keywords, site_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!site) return { ...lightChanges, intermediate_skipped: "no site" };

  // Build event summary for Claude
  const eventSummary = events.slice(0, 15).map(e => {
    switch (e.event_type) {
      case "gsc.new_query": return `Nouvelle requête: "${e.data.query}" (${e.data.impressions} impr., pos. ${e.data.position})`;
      case "gsc.position_up": return `Progression: "${e.data.query}" pos. ${e.data.old_position} → ${e.data.new_position}`;
      case "gsc.position_down": return `Chute: "${e.data.query}" pos. ${e.data.old_position} → ${e.data.new_position}`;
      case "gsc.ctr_anomaly": return `CTR anormal: "${e.data.query}" ${e.data.observed_ctr}% vs attendu ${e.data.expected_ctr}%`;
      case "rp.content_generated": return `Article publié: "${e.data.title}" (${e.data.keyword})`;
      default: return `${e.event_type}: ${JSON.stringify(e.data).slice(0, 80)}`;
    }
  }).join("\n");

  const clusterSummary = cocoon.clusters.map((c, i) => {
    const publishedInCluster = published.filter(p =>
      c.support_pages.some(sp => sp.keyword.toLowerCase() === p.keyword.toLowerCase()) ||
      c.pillar.keyword.toLowerCase() === p.keyword.toLowerCase()
    );
    const total = 1 + c.support_pages.length;
    return `${i + 1}. "${c.name}" (${c.priority}) — ${publishedInCluster.length}/${total} publié(s) — pilier: ${c.pillar.status === "existing" ? "publié" : "à créer"}`;
  }).join("\n");

  const prompt = `Tu es un expert SEO. Analyse les événements SEO récents et ajuste le maillage interne et les clusters.

SITE : ${site.business_name} (${site.industry})
URL : ${site.site_url}

ÉVÉNEMENTS RÉCENTS :
${eventSummary || "Aucun événement significatif"}

CLUSTERS ACTUELS :
${clusterSummary}

ARTICLES PUBLIÉS : ${published.length}
${published.slice(0, 15).map(p => `- "${p.title}" (${p.keyword})`).join("\n")}

MISSION : Ajuste le cocon sémantique en réponse aux événements. Pas de changements majeurs — uniquement :
1. Mettre à jour le statut des pages (existing/to_create) en fonction des publications
2. Ajouter des liens internes entre les pages récemment publiées et leur cluster
3. Si une nouvelle requête GSC correspond à un cluster, proposer de l'ajouter comme page support
4. Identifier les pages orphelines (publiées mais pas dans un cluster)

CONTRAINTES :
- Ne PAS créer de nouveaux clusters
- Ne PAS modifier les piliers
- Max ${AMPLITUDE_CAPS.intermediate.max_articles_inserted} nouvelles pages support ajoutées
- Max ${AMPLITUDE_CAPS.intermediate.max_clusters_modified} cluster modifié

RÉPONSE : JSON uniquement.
{
  "cluster_updates": [
    {
      "cluster_name": "Nom du cluster",
      "new_support_pages": [{"title": "...", "keyword": "...", "status": "to_create", "reason": "..."}],
      "status_changes": [{"keyword": "...", "new_status": "existing"}],
      "new_internal_links": [{"from": "...", "to": "...", "anchor": "...", "direction": "support_to_pillar|pillar_to_support"}]
    }
  ],
  "orphan_pages": [{"title": "...", "keyword": "...", "recommendation": "rattacher au cluster X"}],
  "actions_summary": ["Action 1", "Action 2"]
}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end !== -1) {
      let adjustments: {
        cluster_updates?: {
          cluster_name: string;
          new_support_pages?: { title: string; keyword: string; status: string; reason: string }[];
          status_changes?: { keyword: string; new_status: string }[];
          new_internal_links?: { from: string; to: string; anchor: string; direction: string }[];
        }[];
        orphan_pages?: { title: string; keyword: string; recommendation: string }[];
        actions_summary?: string[];
      };

      try {
        adjustments = JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        const repaired = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
        adjustments = JSON.parse(repaired);
      }

      // Apply cluster updates to cocoon data
      const updatedCocoon = { ...cocoon };
      let clustersModified = 0;
      let pagesAdded = 0;

      for (const update of adjustments.cluster_updates ?? []) {
        if (clustersModified >= AMPLITUDE_CAPS.intermediate.max_clusters_modified) break;

        const cluster = updatedCocoon.clusters.find(c => c.name === update.cluster_name);
        if (!cluster) continue;

        // Apply status changes
        for (const sc of update.status_changes ?? []) {
          const page = cluster.support_pages.find(p => p.keyword.toLowerCase() === sc.keyword.toLowerCase());
          if (page) page.status = sc.new_status;
          if (cluster.pillar.keyword.toLowerCase() === sc.keyword.toLowerCase()) {
            cluster.pillar.status = sc.new_status;
          }
        }

        // Add new support pages (respecting cap)
        for (const sp of update.new_support_pages ?? []) {
          if (pagesAdded >= AMPLITUDE_CAPS.intermediate.max_articles_inserted) break;
          cluster.support_pages.push({ title: sp.title, keyword: sp.keyword, status: sp.status, url: "" });
          pagesAdded++;
        }

        // Add internal links
        for (const link of update.new_internal_links ?? []) {
          cluster.internal_links = cluster.internal_links ?? [];
          cluster.internal_links.push(link);
        }

        clustersModified++;
      }

      // Save updated cocoon
      await supabase
        .from("semantic_cocoons")
        .upsert(
          { user_id: userId, data: updatedCocoon, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      actions.push(`cocoon_adjusted:${clustersModified}_clusters,${pagesAdded}_pages`);
      return {
        level: "intermediate",
        actions,
        cluster_updates: adjustments.cluster_updates?.length ?? 0,
        orphan_pages_detected: adjustments.orphan_pages?.length ?? 0,
        actions_summary: adjustments.actions_summary ?? [],
      };
    }
  } catch (err) {
    console.error("[seo-recalc] intermediate Claude call failed:", err);
    actions.push("intermediate_claude_failed");
  }

  return { level: "intermediate", actions };
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL RECALC — Rebuild cocoon + roadmap via Claude
// ══════════════════════════════════════════════════════════════════════════════

async function recalcFull(
  supabase: SupabaseClient,
  userId: string,
  gscQueries: GSCQuery[],
  events: { event_type: string; impact: number; data: Record<string, unknown> }[]
): Promise<Record<string, unknown>> {
  // First do intermediate
  const intermediateChanges = await recalcIntermediate(supabase, userId, gscQueries, events);
  const actions = (intermediateChanges.actions as string[]) ?? [];

  // For full recalc, we trigger the existing cocoon and roadmap generation endpoints
  // via internal function calls rather than HTTP to avoid auth issues.
  // We delegate the actual Claude calls to the existing API handlers.

  // Mark that a full recalc happened — the actual cocoon + roadmap regeneration
  // will be triggered via the dashboard or a separate mechanism to avoid
  // cascading long-running operations in a single cron tick.

  // Instead, we flag the need for regeneration
  const { data: site } = await supabase
    .from("sites")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (site) {
    // Store a flag indicating full regeneration is needed
    // The dashboard will pick this up and offer to regenerate
    await supabase
      .from("recalc_log")
      .insert({
        user_id: userId,
        level: "full",
        trigger_reason: "full_recalc_flagged_for_regeneration",
        events_processed: events.length,
        changes_summary: {
          needs_cocoon_regen: true,
          needs_roadmap_regen: true,
          reason: events.length > 0
            ? `${events.length} events accumulated`
            : "Monthly full recalc due",
        },
      });

    actions.push("full_recalc_flagged");
  }

  return {
    level: "full",
    actions,
    intermediate_changes: intermediateChanges,
    full_regen_flagged: true,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function getPublishedKeywords(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("publications")
    .select("keyword")
    .eq("user_id", userId);
  return new Set((data ?? []).map((p: { keyword: string }) => p.keyword.toLowerCase()));
}

function reprioritizeRoadmap(
  roadmap: RoadmapData,
  gscQueries: GSCQuery[],
  events: { event_type: string; impact: number; data: Record<string, unknown> }[],
  published: Set<string>
): { roadmap: RoadmapData; changed: number } {
  const gscMap = new Map(gscQueries.map(q => [q.query.toLowerCase(), q]));
  let changed = 0;
  const maxMoves = AMPLITUDE_CAPS.light.max_reprioritized;

  // Build urgency scores for unpublished articles
  const scoredArticles = roadmap.articles
    .filter(a => !published.has(a.keyword.toLowerCase()))
    .map(a => {
      const kw = a.keyword.toLowerCase();
      const gsc = gscMap.get(kw);
      let urgency = 41 - a.priority; // Base: invert priority (1=most urgent → score 40)

      // Position boost: striking distance gets huge boost
      if (gsc) {
        if (gsc.position > 5 && gsc.position <= 15) urgency += 15; // striking distance
        else if (gsc.position > 15 && gsc.position <= 25) urgency += 8;
        if (gsc.impressions > 200) urgency += 10;
        else if (gsc.impressions > 50) urgency += 5;
      }

      // Cluster need: pillar role gets boost
      if (a.role === "pilier" || a.role === "pillar") urgency += 20;

      // Event boost: if this keyword appeared in recent events
      const relatedEvents = events.filter(e =>
        (e.data.query as string)?.toLowerCase() === kw ||
        (e.data.keyword as string)?.toLowerCase() === kw
      );
      for (const e of relatedEvents) {
        if (e.event_type === "gsc.position_down") urgency += 12;
        if (e.event_type === "gsc.new_query") urgency += 8;
        if (e.event_type === "gsc.ctr_anomaly") urgency += 5;
      }

      // Already ranking penalty
      if (gsc && gsc.position <= 3 && gsc.clicks > 10) urgency -= 20;

      return { ...a, _urgency: urgency };
    });

  // Sort by urgency
  scoredArticles.sort((a, b) => b._urgency - a._urgency);

  // Apply new priorities (only move up to maxMoves articles)
  const newArticles = [...roadmap.articles];
  for (let i = 0; i < scoredArticles.length && changed < maxMoves; i++) {
    const scored = scoredArticles[i];
    const original = newArticles.find(a => a.id === scored.id);
    if (!original) continue;

    const newPriority = i + 1;
    if (Math.abs(original.priority - newPriority) >= 3) { // Only count significant moves
      original.priority = newPriority;
      changed++;
    }
  }

  return { roadmap: { ...roadmap, articles: newArticles }, changed };
}
