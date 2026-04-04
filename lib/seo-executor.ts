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

  // 2. Build URL → post mapping
  const urlToPost = new Map<string, CmsPost>();
  const urlToPub = new Map<string, { title: string; keyword: string }>();
  for (const post of cmsPosts) {
    urlToPost.set(normalizeUrl(post.url), post);
  }
  for (const pub of publications) {
    if (pub.wordpress_url) {
      urlToPub.set(normalizeUrl(pub.wordpress_url), { title: pub.title, keyword: pub.keyword });
    }
  }

  // 3. Plan internal linking actions
  const linkActions = planInternalLinks(cocoon, cmsPosts, publications, urlToPost, urlToPub);
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
// INTERNAL LINKING PLANNER
// ══════════════════════════════════════════════════════════════════════════════

function planInternalLinks(
  cocoon: CocoonData,
  cmsPosts: CmsPost[],
  publications: { title: string; keyword: string; wordpress_url: string | null }[],
  urlToPost: Map<string, CmsPost>,
  urlToPub: Map<string, { title: string; keyword: string }>
): SeoAction[] {
  const actions: SeoAction[] = [];
  let totalPagesTargeted = 0;

  for (const cluster of cocoon.clusters) {
    if (totalPagesTargeted >= MAX_PAGES_PER_RUN) break;

    // Find published pages in this cluster
    const clusterPages: { title: string; keyword: string; url: string; role: "pillar" | "support" }[] = [];

    // Check pillar
    if (cluster.pillar.status === "existing" && cluster.pillar.url) {
      clusterPages.push({
        title: cluster.pillar.title,
        keyword: cluster.pillar.keyword,
        url: cluster.pillar.url,
        role: "pillar",
      });
    }

    // Check support pages
    for (const sp of cluster.support_pages) {
      if (sp.status === "existing" && sp.url) {
        clusterPages.push({
          title: sp.title,
          keyword: sp.keyword,
          url: sp.url,
          role: "support",
        });
      }
    }

    // Also match by keyword from publications
    for (const pub of publications) {
      if (!pub.wordpress_url) continue;
      const pubKw = pub.keyword.toLowerCase();
      const alreadyMapped = clusterPages.some(p => normalizeUrl(p.url) === normalizeUrl(pub.wordpress_url!));
      if (alreadyMapped) continue;

      if (cluster.pillar.keyword.toLowerCase() === pubKw) {
        clusterPages.push({ title: pub.title, keyword: pub.keyword, url: pub.wordpress_url, role: "pillar" });
      } else if (cluster.support_pages.some(sp => sp.keyword.toLowerCase() === pubKw)) {
        clusterPages.push({ title: pub.title, keyword: pub.keyword, url: pub.wordpress_url, role: "support" });
      }
    }

    if (clusterPages.length < 2) continue; // Need at least 2 pages to link

    // Find pillar page
    const pillar = clusterPages.find(p => p.role === "pillar");
    const supports = clusterPages.filter(p => p.role === "support");

    // Generate link injections for each page
    for (const page of clusterPages) {
      if (totalPagesTargeted >= MAX_PAGES_PER_RUN) break;

      const post = findPostByUrl(cmsPosts, page.url);
      if (!post) continue;
      if (post.content.length < MIN_CONTENT_LENGTH) continue;

      // Count existing internal links in content
      const existingLinks = countInternalLinks(post.content, cmsPosts.map(p => p.url));
      if (existingLinks >= 5) continue; // Already well-linked

      const linksToAdd: LinkInjection[] = [];

      // Rule: support → pillar (mandatory)
      if (page.role === "support" && pillar) {
        const alreadyLinked = post.content.toLowerCase().includes(pillar.url.toLowerCase());
        if (!alreadyLinked) {
          linksToAdd.push({
            anchor: pillar.keyword,
            target_url: pillar.url,
            target_title: pillar.title,
          });
        }
      }

      // Rule: pillar → supports
      if (page.role === "pillar") {
        for (const sp of supports.slice(0, 3)) {
          const alreadyLinked = post.content.toLowerCase().includes(sp.url.toLowerCase());
          if (!alreadyLinked) {
            linksToAdd.push({
              anchor: sp.keyword,
              target_url: sp.url,
              target_title: sp.title,
            });
          }
        }
      }

      // Rule: support → other support in same cluster (max 1)
      if (page.role === "support") {
        const otherSupports = supports.filter(s => s.url !== page.url);
        for (const other of otherSupports.slice(0, 1)) {
          const alreadyLinked = post.content.toLowerCase().includes(other.url.toLowerCase());
          if (!alreadyLinked) {
            linksToAdd.push({
              anchor: other.keyword,
              target_url: other.url,
              target_title: other.title,
            });
          }
        }
      }

      if (linksToAdd.length > 0) {
        actions.push({
          type: "add_internal_links",
          level: "automatic", // Link injection is safe and reversible
          target_post_id: post.id,
          target_url: page.url,
          target_title: page.title,
          details: {
            cluster: cluster.name,
            links: linksToAdd,
            existing_internal_links: existingLinks,
          },
          reason: `${linksToAdd.length} lien(s) interne(s) manquant(s) dans le cluster "${cluster.name}"`,
        });
        totalPagesTargeted++;
      }
    }
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
