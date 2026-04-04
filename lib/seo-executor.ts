/**
 * SEO Executor — Automatic SEO optimization engine
 *
 * 3 automation levels:
 * - automatic: executed without user approval (safe actions only)
 * - validated: queued for user approval
 * - suggested: displayed as recommendations
 *
 * Actions: maillage interne, meta optimization, content enrichment
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  type CmsCredentials,
  type CmsPost,
  type LinkInjection,
  listCmsPosts,
  updateCmsPost,
  injectLinks,
} from "@/lib/cms-update";
import { emitEvent, type SeoEvent } from "@/lib/seo-events";
import { recordAction } from "@/lib/seo-feedback";
import { assessRisk, getModificationHistory, type ActionContext, type RiskAssessment } from "@/lib/seo-risk";
import { analyzeLinking } from "@/lib/seo-linking";
import type { GSCQuery } from "@/lib/seo-projections";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ────────────────────────────────────────────────────────────────────

export type ActionLevel = "automatic" | "validated" | "suggested";

export type SeoAction = {
  type: "add_internal_links" | "optimize_meta" | "optimize_title" | "content_enrich";
  level: ActionLevel;
  target_post_id: string | number;
  target_url: string;
  target_title: string;
  details: Record<string, unknown>;
  reason: string;
};

type ExecutionResult = {
  action: SeoAction;
  executed: boolean;
  result?: Record<string, unknown>;
  error?: string;
};

type CocoonCluster = {
  name: string;
  pillar: { title: string; keyword: string; status: string; url?: string };
  support_pages: { title: string; keyword: string; status: string; url?: string }[];
  internal_links?: { from: string; to: string; anchor: string; direction: string }[];
};

type CocoonData = {
  clusters: CocoonCluster[];
};

// ── Safety constants ─────────────────────────────────────────────────────────

const MAX_LINKS_PER_PAGE = 3;        // Max links injected per page per run
const MAX_PAGES_PER_RUN = 5;          // Max pages modified per run
const MAX_LINK_DENSITY = 0.03;        // Max 3% of content = links
const MIN_CONTENT_LENGTH = 500;       // Don't modify very short pages

// ══════════════════════════════════════════════════════════════════════════════
// MAIN: Plan & Execute SEO actions
// ══════════════════════════════════════════════════════════════════════════════

export async function planSeoActions(
  supabase: SupabaseClient,
  userId: string,
  creds: CmsCredentials,
  gscQueries: GSCQuery[]
): Promise<SeoAction[]> {
  const actions: SeoAction[] = [];

  // 1. Fetch all required data
  const [cocoonRes, pubsRes, cmsPosts] = await Promise.all([
    supabase.from("semantic_cocoons").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("publications").select("id, title, keyword, wordpress_url").eq("user_id", userId),
    listCmsPosts(creds, 100),
  ]);

  const cocoon = (cocoonRes.data?.data ?? null) as CocoonData | null;
  const publications = pubsRes.data ?? [];

  if (!cocoon?.clusters || publications.length < 3 || cmsPosts.length === 0) {
    return actions; // Not enough data to plan actions
  }

  // 2. Plan internal linking actions (using intelligent linking engine)
  const linkActions = await planInternalLinksIntelligent(
    supabase, userId, cmsPosts, gscQueries, creds.site_url, cocoon, publications
  );
  actions.push(...linkActions);

  // 4. Plan meta optimizations (CTR anomalies)
  const gscMap = new Map(gscQueries.map(q => [q.query.toLowerCase(), q]));
  for (const pub of publications) {
    const gsc = gscMap.get(pub.keyword.toLowerCase());
    if (!gsc) continue;

    // CTR anomaly: position good but CTR bad
    if (gsc.position <= 10 && gsc.impressions > 100) {
      const expectedCtr = getExpectedCtr(gsc.position);
      if (gsc.ctr < expectedCtr * 0.5) {
        const post = findPostByUrl(cmsPosts, pub.wordpress_url);
        if (post) {
          actions.push({
            type: "optimize_meta",
            level: "validated", // Meta changes need user approval
            target_post_id: post.id,
            target_url: pub.wordpress_url ?? "",
            target_title: pub.title,
            details: {
              keyword: pub.keyword,
              current_position: gsc.position,
              current_ctr: Math.round(gsc.ctr * 1000) / 10,
              expected_ctr: Math.round(expectedCtr * 1000) / 10,
              impressions: gsc.impressions,
            },
            reason: `CTR anormalement bas (${Math.round(gsc.ctr * 1000) / 10}% vs ${Math.round(expectedCtr * 1000) / 10}% attendu en position ${gsc.position})`,
          });
        }
      }
    }
  }

  return actions;
}

// ══════════════════════════════════════════════════════════════════════════════
// INTERNAL LINKING PLANNER — Uses intelligent seo-linking engine
// ══════════════════════════════════════════════════════════════════════════════

async function planInternalLinksIntelligent(
  supabase: SupabaseClient,
  userId: string,
  cmsPosts: CmsPost[],
  gscQueries: GSCQuery[],
  siteUrl: string,
  cocoon: CocoonData | null,
  publications: { title: string; keyword: string; wordpress_url: string | null }[]
): Promise<SeoAction[]> {
  const actions: SeoAction[] = [];

  // Run the intelligent linking analysis
  const analysis = await analyzeLinking(supabase, userId, cmsPosts, gscQueries, siteUrl);

  // Convert high/medium priority suggestions into executable actions
  // Only take automatic-safe suggestions (risk_score <= 30)
  const executableSuggestions = analysis.suggestions
    .filter(s => s.risk_score <= 30 && (s.priority === "haute" || s.priority === "moyenne"))
    .slice(0, MAX_PAGES_PER_RUN * MAX_LINKS_PER_PAGE); // Cap total links

  // Group suggestions by source page
  const bySource = new Map<string, typeof executableSuggestions>();
  for (const s of executableSuggestions) {
    const existing = bySource.get(s.from_url) ?? [];
    existing.push(s);
    bySource.set(s.from_url, existing);
  }

  let pagesTargeted = 0;
  for (const [sourceUrl, suggestions] of bySource) {
    if (pagesTargeted >= MAX_PAGES_PER_RUN) break;

    const post = findPostByUrl(cmsPosts, sourceUrl);
    if (!post) continue;
    if (post.content.length < MIN_CONTENT_LENGTH) continue;

    const existingLinks = countInternalLinks(post.content, cmsPosts.map(p => p.url));
    if (existingLinks >= 5) continue;

    // Cap links per page
    const capped = suggestions.slice(0, MAX_LINKS_PER_PAGE);
    const linksToAdd: LinkInjection[] = capped.map(s => ({
      anchor: s.anchor,
      target_url: s.to_url,
      target_title: s.to_title,
    }));

    // Find cluster name from page profile
    const profile = analysis.page_profiles.find(p => p.url === sourceUrl);
    const clusterName = profile?.cluster ?? "inconnu";

    actions.push({
      type: "add_internal_links",
      level: "automatic",
      target_post_id: post.id,
      target_url: sourceUrl,
      target_title: post.title,
      details: {
        cluster: clusterName,
        links: linksToAdd,
        existing_internal_links: existingLinks,
        justifications: capped.map(s => s.justification),
      },
      reason: `${linksToAdd.length} lien(s) suggéré(s) par l'analyse de maillage (cluster "${clusterName}")`,
    });
    pagesTargeted++;
  }

  return actions;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXECUTOR — Apply actions to CMS
// ══════════════════════════════════════════════════════════════════════════════

export async function executeSeoActions(
  supabase: SupabaseClient,
  userId: string,
  creds: CmsCredentials,
  actions: SeoAction[],
  gscQueries: GSCQuery[]
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  // Only execute automatic actions — but verify risk first
  const autoActions = actions.filter(a => a.level === "automatic");
  const gscMap = new Map(gscQueries.map(q => [q.query.toLowerCase(), q]));

  for (const action of autoActions) {
    try {
      // ── Risk assessment gate ──
      const history = await getModificationHistory(supabase, userId, action.target_url);
      const gsc = gscMap.get((action.details.keyword as string ?? "").toLowerCase());
      const riskCtx: ActionContext = {
        action_type: action.type,
        target_url: action.target_url,
        target_title: action.target_title,
        keyword: (action.details.keyword as string) ?? "",
        position: gsc?.position ?? null,
        impressions: gsc?.impressions ?? 0,
        clicks: gsc?.clicks ?? 0,
        ctr: gsc?.ctr ?? 0,
        is_homepage: isHomepage(action.target_url, creds.site_url),
        is_pillar: (action.details.cluster as string)?.includes("pilier") ?? false,
        content_length: 0, // Will be checked during execution
        existing_internal_links: (action.details.existing_internal_links as number) ?? 0,
        links_to_add: ((action.details.links as unknown[]) ?? []).length,
      };
      const risk = assessRisk(riskCtx, history);

      // If risk is too high, downgrade action
      if (risk.allowed_action === "blocked") {
        results.push({
          action: { ...action, level: "suggested" },
          executed: false,
          error: `Blocked by risk assessment (score ${risk.risk_score}): ${risk.reason}`,
          result: { risk },
        });
        continue;
      }
      if (risk.allowed_action === "semi") {
        // Downgrade to validated — store for user approval
        results.push({
          action: { ...action, level: "validated" },
          executed: false,
          result: { risk, stored_for_validation: true },
        });
        continue;
      }

      switch (action.type) {
        case "add_internal_links": {
          const result = await executeAddLinks(creds, action);
          results.push(result);

          if (result.executed) {
            // Record for feedback loop
            await recordAction(supabase, userId, "linking", "", action.target_url, null, gscQueries, 0);

            // Emit event
            const event: SeoEvent = {
              event_type: "rp.linking_added",
              category: "rankpill",
              impact: 2,
              data: {
                page: action.target_url,
                links_added: (result.result as Record<string, unknown>)?.injected ?? 0,
                cluster: (action.details.cluster as string) ?? "",
              },
            };
            await emitEvent(supabase, userId, event);
          }
          break;
        }

        case "optimize_meta": {
          // Meta optimization requires Claude — generate new title/meta
          const result = await executeOptimizeMeta(supabase, userId, creds, action, gscQueries);
          results.push(result);
          break;
        }

        default:
          results.push({ action, executed: false, error: `Action type ${action.type} not implemented` });
      }
    } catch (err) {
      results.push({
        action,
        executed: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Store validated/suggested actions for dashboard display
  const pendingActions = actions.filter(a => a.level !== "automatic");
  if (pendingActions.length > 0) {
    // Store in a new field in the existing internal_linking table or a new pending_actions table
    try {
      await supabase
        .from("internal_linking")
        .upsert(
          {
            user_id: userId,
            data: { pending_actions: pendingActions, updated_at: new Date().toISOString() },
          },
          { onConflict: "user_id" }
        );
    } catch {
      // Non-fatal
    }
  }

  return results;
}

// ── Execute: Add internal links ──────────────────────────────────────────────

async function executeAddLinks(
  creds: CmsCredentials,
  action: SeoAction
): Promise<ExecutionResult> {
  const links = (action.details.links ?? []) as LinkInjection[];
  if (links.length === 0) {
    return { action, executed: false, error: "No links to inject" };
  }

  // For Wix, we can't modify HTML content directly (needs RichContent format)
  if (creds.cms === "wix") {
    return {
      action: { ...action, level: "suggested" },
      executed: false,
      error: "Wix ne supporte pas l'injection de liens automatique (format RichContent requis)",
    };
  }

  // For custom API, no update support
  if (creds.cms === "custom") {
    return {
      action: { ...action, level: "suggested" },
      executed: false,
      error: "API custom ne supporte pas les mises à jour",
    };
  }

  // Get current post content
  const posts = await listCmsPosts(creds, 100);
  const post = posts.find(p => String(p.id) === String(action.target_post_id));
  if (!post) {
    return { action, executed: false, error: "Post not found in CMS" };
  }

  // Inject links
  const { html, injected, injectedLinks } = injectLinks(
    post.content,
    links,
    action.target_url,
    MAX_LINKS_PER_PAGE
  );

  if (injected === 0) {
    return {
      action,
      executed: false,
      result: { injected: 0, reason: "No matching anchor text found in content" },
    };
  }

  // Check link density
  const linkCount = (html.match(/<a /gi) ?? []).length;
  const wordCount = html.replace(/<[^>]+>/g, " ").split(/\s+/).length;
  if (linkCount / Math.max(wordCount, 1) > MAX_LINK_DENSITY) {
    return {
      action,
      executed: false,
      error: `Link density too high (${linkCount} links for ${wordCount} words)`,
    };
  }

  // Apply update
  const extra = creds.cms === "shopify" && "blog_id" in post
    ? { blog_id: (post as CmsPost & { blog_id: number }).blog_id }
    : undefined;

  const updateResult = await updateCmsPost(creds, action.target_post_id, { content: html }, extra);

  return {
    action,
    executed: updateResult.success,
    result: {
      injected,
      injectedLinks: injectedLinks.map(l => ({ anchor: l.anchor, target: l.target_url })),
      post_url: updateResult.url,
    },
    error: updateResult.error,
  };
}

// ── Execute: Optimize meta ───────────────────────────────────────────────────

async function executeOptimizeMeta(
  supabase: SupabaseClient,
  userId: string,
  creds: CmsCredentials,
  action: SeoAction,
  gscQueries: GSCQuery[]
): Promise<ExecutionResult> {
  // Meta optimization is "validated" level — don't auto-execute
  // Instead, generate the suggestion and store it
  const keyword = action.details.keyword as string;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Génère un title SEO et une meta description optimisés pour ce mot-clé.

MOT-CLÉ : ${keyword}
TITRE ACTUEL : ${action.target_title}
POSITION ACTUELLE : ${action.details.current_position}
CTR ACTUEL : ${action.details.current_ctr}%
CTR ATTENDU : ${action.details.expected_ctr}%

CONTRAINTES :
- Title : 55-60 caractères, mot-clé au début, accrocheur
- Meta description : 150-155 caractères, call-to-action, mot-clé inclus
- Naturel, pas de keyword stuffing

RÉPONSE JSON : {"title": "...", "meta_description": "..."}`
      }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const suggestion = JSON.parse(raw.slice(start, end + 1)) as { title: string; meta_description: string };
      return {
        action: { ...action, details: { ...action.details, suggestion } },
        executed: false, // Not auto-executed — stored for validation
        result: { suggestion, stored_for_validation: true },
      };
    }
  } catch (err) {
    console.error("[seo-executor] meta optimization failed:", err);
  }

  return { action, executed: false, error: "Failed to generate meta suggestion" };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.replace(/\/$/, "").toLowerCase();
  }
}

function findPostByUrl(cmsPosts: CmsPost[], url: string | null): CmsPost | null {
  if (!url) return null;
  const normalized = normalizeUrl(url);
  return cmsPosts.find(p => normalizeUrl(p.url) === normalized) ?? null;
}

function countInternalLinks(html: string, siteUrls: string[]): number {
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/gi;
  let count = 0;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (siteUrls.some(u => {
      try {
        return new URL(href).hostname === new URL(u).hostname;
      } catch {
        return href.startsWith("/");
      }
    })) {
      count++;
    }
  }
  return count;
}

const CTR_TABLE: Record<number, number> = {
  1: 0.25, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
};

function getExpectedCtr(position: number): number {
  const pos = Math.round(Math.max(1, Math.min(10, position)));
  return CTR_TABLE[pos] ?? 0.01;
}

function isHomepage(url: string, siteUrl: string): boolean {
  try {
    const u = new URL(url);
    return u.pathname === "/" || u.pathname === "";
  } catch {
    return url === siteUrl || url === siteUrl + "/";
  }
}
