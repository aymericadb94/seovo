// ── Types du moteur SEO intelligent ──────────────────────────────────────────

// Contexte d'entrée pour le moteur
export type PageContext = {
  keyword: string;
  language: string;
  business_name: string;
  industry: string;

  // Intent (de l'analyse pré-gen)
  intent?: {
    type: string;         // informational, transactional, navigational, commercial
    user_intent: string;
    content_type: string; // guide, comparison, tutorial, landing, tool
    angle: string;
  };

  // GSC data
  gsc?: {
    current_position: number | null;
    impressions: number;
    clicks: number;
    ctr: number;
    trend: "up" | "down" | "stable";
    competing_pages: string[];
  } | null;

  // Cocon sémantique
  cocoon?: {
    page_type: "pillar" | "support" | "complementary";
    cluster: string;
    pillar_relation: string;
    outgoing_links: { target: string; anchor: string; reason: string }[];
    incoming_links: { source: string; anchor: string; reason: string }[];
    sibling_pages: string[];
  } | null;

  // Roadmap SEO
  roadmap?: {
    phase: number;
    priority: "haute" | "moyenne" | "faible";
    objective: string;
    deadline: string | null;
  } | null;

  // SERP analysis
  serp?: {
    patterns: string;
    weaknesses: string[];
    opportunities: string[];
    differentiation: string;
    content_upgrades: string[];
    enhanced_structure: string[];
    avg_word_count: number;
    dominant_format: string; // list, guide, comparison, FAQ
  } | null;

  // Keyword strategy
  keywords?: {
    primary: string;
    secondary: string[];
    semantic_field: string[];
    seo_angle: string;
  } | null;

  // Style guide existant
  style_guide?: string | null;
};

// Bloc de page — chaque type a sa propre structure
export type HeroBlock = {
  type: "hero";
  priority: number;
  data: {
    title: string;
    subtitle: string;
    promise: string;
    cta: string | null;
  };
};

export type QuickAnswerBlock = {
  type: "quick_answer";
  priority: number;
  data: {
    answer: string;
    snippet_type: "definition" | "list" | "steps" | "table";
  };
};

export type StatsBlock = {
  type: "key_stats";
  priority: number;
  data: {
    stats: { value: string; label: string; source?: string }[];
  };
};

export type SimulationBlock = {
  type: "simulation";
  priority: number;
  data: {
    title: string;
    scenario: string; // HTML
    result: string;
  };
};

export type SectionBlock = {
  type: "section";
  priority: number;
  data: {
    title: string;
    content: string; // HTML
    tip?: string;
    example?: string;
  };
};

export type InsightBlock = {
  type: "insight";
  priority: number;
  data: {
    insights: { type: "tip" | "warning" | "pro"; text: string }[];
  };
};

export type MistakesBlock = {
  type: "mistakes";
  priority: number;
  data: {
    mistakes: { title: string; why: string; consequence: string }[];
  };
};

export type FaqBlock = {
  type: "faq";
  priority: number;
  data: {
    questions: { question: string; answer: string }[];
  };
};

export type CtaBlock = {
  type: "cta";
  priority: number;
  data: {
    text: string;
    button_text: string;
    button_url: string | null;
  };
};

export type GscInsightBlock = {
  type: "gsc_insight";
  priority: number;
  data: {
    position: number | null;
    trend: "up" | "down" | "stable";
    insight: string;
    recommendation: string;
  };
};

export type ComparisonBlock = {
  type: "comparison";
  priority: number;
  data: {
    title: string;
    headers: string[];
    rows: string[][];
  };
};

export type PageBlock =
  | HeroBlock
  | QuickAnswerBlock
  | StatsBlock
  | SimulationBlock
  | SectionBlock
  | InsightBlock
  | MistakesBlock
  | FaqBlock
  | CtaBlock
  | GscInsightBlock
  | ComparisonBlock;

// Page assemblée
export type AssembledPage = {
  title: string;
  meta_description: string;
  blocks: PageBlock[];
  internal_links: { anchor: string; target: string }[];
  pexels_query: string;
  cover_alt_text: string;
  // Metadata moteur
  engine: {
    version: string;
    decisions: string[];  // log des décisions prises
    context_hash: string; // pour le versioning
    generated_at: string;
  };
};

// Décisions du moteur
export type BlockDecision = {
  block_type: PageBlock["type"];
  include: boolean;
  priority: number;
  reason: string;
};
