// ── Moteur SEO intelligent Rankpill v2 ──────────────────────────────────────
// Point d'entrée unique du moteur

export { buildPageContext } from "./context";
export { makeDecisions, getBlockOrder } from "./decision";
export { buildPage, generatePageStream, generatePageSync, assembleCmsHtml } from "./builder";
export type {
  PageContext,
  PageBlock,
  AssembledPage,
  BlockDecision,
  HeroBlock,
  QuickAnswerBlock,
  StatsBlock,
  SimulationBlock,
  SectionBlock,
  InsightBlock,
  MistakesBlock,
  FaqBlock,
  CtaBlock,
  GscInsightBlock,
  ComparisonBlock,
} from "./types";
