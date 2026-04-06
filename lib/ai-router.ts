/**
 * AI Model Router — Intelligent model selection for Rankpill
 *
 * Architecture:
 *   OPUS  = "le stratège" — décisions, analyse, architecture SEO
 *   SONNET = "l'exécutant" — production de contenu, optimisation, application
 *   HAIKU  = "l'utilitaire" — tâches simples, extraction, formatting
 *
 * The router automatically selects the right model based on:
 *   1. Task type (decision vs execution vs utility)
 *   2. Risk level (high-risk pages → upgraded)
 *   3. Complexity (multi-factor decisions → upgraded)
 *   4. Cost optimization (batch, cache, downgrade when safe)
 */

import Anthropic from "@anthropic-ai/sdk";

// ── Models ──────────────────────────────────────────────────────────────────

export const MODELS = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type ModelTier = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelTier];

// ── Task Classification ─────────────────────────────────────────────────────

/**
 * Task taxonomy — every AI call in Rankpill maps to one of these.
 * Each task has a default tier + conditions for upgrade/downgrade.
 */
export type TaskType =
  // ── DECISION tasks (default: Opus) ──
  | "semantic_cocoon"         // Clustering, structure, cocon architecture
  | "roadmap_strategy"        // Strategic content planning
  | "seo_analysis"            // Full site SEO analysis
  | "seo_audit"               // Technical + content audit
  | "keyword_discovery"       // New keyword opportunities
  | "gsc_advanced_analysis"   // GSC data interpretation, anomaly detection
  | "risk_arbitrage"          // High-risk page modification decisions
  | "recalc_full"             // Full recalculation (cocoon restructure)
  | "intent_analysis"         // Search intent analysis before content creation
  | "cocoon_positioning"      // Strategic page positioning within cocoon
  | "keyword_strategy"        // Keyword strategy: primary, secondary, semantic field
  | "content_structure"       // SEO content structure: H1, H2, H3, featured snippet
  | "featured_snippet"        // Featured snippet (position 0) generation
  | "editorial_plan"          // Detailed editorial plan per section
  | "semantic_enrichment"     // Post-generation semantic enrichment
  | "value_enhancement"       // Add examples, tips, insights, credibility
  | "internal_linking"        // Intelligent internal link insertion
  | "roadmap_integration"     // Post-publish roadmap strategy update
  | "content_audit"           // SEO over-optimization & AI detection audit
  | "final_check"             // Final quality gate before publication

  // ── EXECUTION tasks (default: Sonnet) ──
  | "content_generation"      // Article writing
  | "content_enrichment"      // Existing content improvement
  | "meta_optimization"       // Title/meta description optimization
  | "linking_enrichment"      // Linking analysis enrichment (opportunities)
  | "recalc_intermediate"     // Intermediate recalculation
  | "seo_engine_execution"    // SEO engine content production

  // ── UTILITY tasks (default: Haiku) ──
  | "style_extraction"        // Editorial style guide extraction
  | "content_formatting"      // Formatting, cleaning, structuring
  | "translation";            // Simple translation tasks

// ── Task → Default Tier mapping ─────────────────────────────────────────────

const TASK_DEFAULTS: Record<TaskType, ModelTier> = {
  // Decision (Opus)
  semantic_cocoon: "opus",
  roadmap_strategy: "opus",
  seo_analysis: "opus",
  seo_audit: "opus",
  keyword_discovery: "opus",
  gsc_advanced_analysis: "opus",
  risk_arbitrage: "opus",
  recalc_full: "opus",
  intent_analysis: "opus",
  cocoon_positioning: "opus",
  keyword_strategy: "sonnet",
  content_structure: "sonnet",
  featured_snippet: "sonnet",
  editorial_plan: "sonnet",
  semantic_enrichment: "sonnet",
  value_enhancement: "sonnet",
  internal_linking: "sonnet",
  roadmap_integration: "sonnet",
  content_audit: "sonnet",
  final_check: "sonnet",

  // Execution (Sonnet)
  content_generation: "sonnet",
  content_enrichment: "sonnet",
  meta_optimization: "sonnet",
  linking_enrichment: "sonnet",
  recalc_intermediate: "sonnet",
  seo_engine_execution: "sonnet",

  // Utility (Haiku)
  style_extraction: "haiku",
  content_formatting: "haiku",
  translation: "haiku",
};

// ── Max tokens per task type ────────────────────────────────────────────────

const TASK_MAX_TOKENS: Record<TaskType, number> = {
  semantic_cocoon: 8000,
  roadmap_strategy: 8000,
  seo_analysis: 6000,
  seo_audit: 6000,
  keyword_discovery: 4000,
  gsc_advanced_analysis: 4000,
  risk_arbitrage: 2000,
  recalc_full: 6000,
  intent_analysis: 2000,
  cocoon_positioning: 4000,
  keyword_strategy: 3000,
  content_structure: 3000,
  featured_snippet: 1500,
  editorial_plan: 6000,
  semantic_enrichment: 10000,
  value_enhancement: 10000,
  internal_linking: 10000,
  roadmap_integration: 4000,
  content_audit: 10000,
  final_check: 10000,

  content_generation: 8000,
  content_enrichment: 4000,
  meta_optimization: 3000,
  linking_enrichment: 500,
  recalc_intermediate: 4000,
  seo_engine_execution: 8000,

  style_extraction: 600,
  content_formatting: 2000,
  translation: 4000,
};

// ── Risk & Complexity Context ───────────────────────────────────────────────

export type TaskContext = {
  task: TaskType;
  /** Risk level 0-100. Pages top 3, homepage, high-traffic → high risk */
  risk_level?: number;
  /** Complexity: number of factors, data sources, or decision dimensions */
  complexity?: "low" | "medium" | "high";
  /** Force a specific tier (override) */
  force_tier?: ModelTier;
  /** Custom max tokens override */
  max_tokens?: number;
};

// ── Model Selection Logic ───────────────────────────────────────────────────

/**
 * Core selection function.
 *
 * Rules (in priority order):
 * 1. Force override → use forced tier
 * 2. Risk level ≥ 70 → upgrade to Opus (safety)
 * 3. Complexity = "high" → upgrade to Opus (quality)
 * 4. Risk level ≤ 15 + execution task → can downgrade to Haiku for simple tasks
 * 5. Default → use task's default tier
 */
export function selectModel(ctx: TaskContext): {
  model: ModelId;
  tier: ModelTier;
  reason: string;
  max_tokens: number;
} {
  const defaultTier = TASK_DEFAULTS[ctx.task];
  const maxTokens = ctx.max_tokens ?? TASK_MAX_TOKENS[ctx.task];

  // 1. Force override
  if (ctx.force_tier) {
    return {
      model: MODELS[ctx.force_tier],
      tier: ctx.force_tier,
      reason: `Forced: ${ctx.force_tier}`,
      max_tokens: maxTokens,
    };
  }

  // 2. High risk → upgrade to Opus
  if (ctx.risk_level !== undefined && ctx.risk_level >= 70 && defaultTier !== "opus") {
    return {
      model: MODELS.opus,
      tier: "opus",
      reason: `Risk upgrade: risk_level=${ctx.risk_level} ≥ 70`,
      max_tokens: maxTokens,
    };
  }

  // 3. High complexity → upgrade to Opus
  if (ctx.complexity === "high" && defaultTier !== "opus") {
    return {
      model: MODELS.opus,
      tier: "opus",
      reason: `Complexity upgrade: high complexity for ${ctx.task}`,
      max_tokens: maxTokens,
    };
  }

  // 4. Default tier
  return {
    model: MODELS[defaultTier],
    tier: defaultTier,
    reason: `Default: ${ctx.task} → ${defaultTier}`,
    max_tokens: maxTokens,
  };
}

// ── Convenience: Create routed Claude call ──────────────────────────────────

const _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Make an AI call with automatic model routing.
 *
 * Usage:
 *   const result = await aiCall({
 *     task: "content_generation",
 *     risk_level: 15,
 *   }, {
 *     system: "You are an SEO expert...",
 *     messages: [{ role: "user", content: "Write an article about..." }],
 *   });
 */
export async function aiCall(
  ctx: TaskContext,
  params: {
    system?: string;
    messages: Anthropic.MessageParam[];
    max_tokens?: number;
    temperature?: number;
  }
): Promise<{ text: string; model: ModelId; tier: ModelTier; reason: string }> {
  const selection = selectModel(ctx);
  const maxTokens = params.max_tokens ?? selection.max_tokens;

  const msg = await _client.messages.create({
    model: selection.model,
    max_tokens: maxTokens,
    ...(params.system ? { system: params.system } : {}),
    messages: params.messages,
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";

  return {
    text,
    model: selection.model,
    tier: selection.tier,
    reason: selection.reason,
  };
}

/**
 * Parse JSON from AI response (handles markdown code blocks and extra text).
 */
export function parseAiJson<T = unknown>(text: string): T | null {
  // Try direct parse first
  try {
    return JSON.parse(text) as T;
  } catch { /* continue */ }

  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]) as T;
    } catch { /* continue */ }
  }

  // Try extracting between first { and last }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch { /* continue */ }
  }

  // Try extracting array between [ and ]
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd !== -1) {
    try {
      return JSON.parse(text.slice(arrStart, arrEnd + 1)) as T;
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Make a streaming AI call with automatic model routing.
 * Returns a ReadableStream that emits SSE-formatted chunks.
 *
 * Each chunk is: `data: {"type":"delta","text":"..."}\n\n`
 * Final chunk:   `data: {"type":"done","text":"...full text..."}\n\n`
 */
export function aiCallStream(
  ctx: TaskContext,
  params: {
    system?: string;
    messages: Anthropic.MessageParam[];
    max_tokens?: number;
    temperature?: number;
  }
): { stream: ReadableStream; model: ModelId; tier: ModelTier; reason: string } {
  const selection = selectModel(ctx);
  const maxTokens = params.max_tokens ?? selection.max_tokens;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fullText = "";

      try {
        const response = _client.messages.stream({
          model: selection.model,
          max_tokens: maxTokens,
          ...(params.system ? { system: params.system } : {}),
          messages: params.messages,
          ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
        });

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "delta", text: event.delta.text })}\n\n`)
            );
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", text: fullText })}\n\n`)
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : "Erreur inconnue" })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return { stream, model: selection.model, tier: selection.tier, reason: selection.reason };
}

// ── Pipeline helpers ────────────────────────────────────────────────────────

/**
 * Determine complexity from data dimensions.
 * Useful for auto-classifying tasks based on input data.
 */
export function assessComplexity(factors: {
  data_sources?: number;     // How many data sources are combined
  keywords_count?: number;   // Number of keywords to analyze
  pages_count?: number;      // Number of pages involved
  clusters_count?: number;   // Number of clusters
  has_gsc_data?: boolean;    // Whether GSC data is available
  has_cocoon?: boolean;      // Whether cocoon exists
}): "low" | "medium" | "high" {
  let score = 0;

  if (factors.data_sources && factors.data_sources >= 4) score += 3;
  else if (factors.data_sources && factors.data_sources >= 2) score += 1;

  if (factors.keywords_count && factors.keywords_count >= 30) score += 2;
  else if (factors.keywords_count && factors.keywords_count >= 10) score += 1;

  if (factors.pages_count && factors.pages_count >= 20) score += 2;
  else if (factors.pages_count && factors.pages_count >= 5) score += 1;

  if (factors.clusters_count && factors.clusters_count >= 5) score += 1;
  if (factors.has_gsc_data) score += 1;
  if (factors.has_cocoon) score += 1;

  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

/**
 * Determine risk level for a page based on SEO metrics.
 */
export function assessPageRisk(page: {
  position?: number | null;
  clicks?: number;
  is_homepage?: boolean;
  is_pillar?: boolean;
}): number {
  let risk = 0;

  if (page.is_homepage) risk += 50;
  if (page.is_pillar) risk += 20;

  if (page.position !== null && page.position !== undefined) {
    if (page.position <= 3) risk += 40;
    else if (page.position <= 10) risk += 20;
  }

  if (page.clicks && page.clicks > 100) risk += 15;
  else if (page.clicks && page.clicks > 30) risk += 5;

  return Math.min(100, risk);
}
