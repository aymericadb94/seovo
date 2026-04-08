// ── Moteur décisionnel — décide quels blocs afficher et dans quel ordre ──────
// Chaque fonction analyse le contexte et retourne include/priority/reason

import type { PageContext, BlockDecision, PageBlock } from "./types";

// ── Décisions individuelles par bloc ────────────────────────────────────────

function shouldShowHero(ctx: PageContext): BlockDecision {
  // Le hero est TOUJOURS affiché — c'est le hook
  return {
    block_type: "hero",
    include: true,
    priority: 100,
    reason: "Hero obligatoire — premier point de contact",
  };
}

function shouldShowQuickAnswer(ctx: PageContext): BlockDecision {
  // Featured snippet : toujours pour intent informationnelle
  // Priorité renforcée si position 1-10 (chance de position 0)
  const isInfo = ctx.intent?.type === "informational" || ctx.intent?.type === "navigational";
  const inTopTen = ctx.gsc?.current_position != null && ctx.gsc.current_position <= 10;

  if (isInfo || inTopTen) {
    return {
      block_type: "quick_answer",
      include: true,
      priority: inTopTen ? 95 : 85,
      reason: inTopTen
        ? "Position top 10 — optimiser pour featured snippet / position 0"
        : "Intent informationnelle — réponse immédiate attendue",
    };
  }

  // Pour le transactionnel/commercial, moins prioritaire mais utile
  return {
    block_type: "quick_answer",
    include: true,
    priority: 60,
    reason: "Réponse rapide pour accrocher le lecteur",
  };
}

function shouldShowStats(ctx: PageContext): BlockDecision {
  // Stats pertinentes si on a des données GSC ou si le secteur a des chiffres
  const hasGsc = !!ctx.gsc && ctx.gsc.impressions > 0;
  const isDataHeavy = ctx.intent?.content_type === "comparison" || ctx.intent?.content_type === "guide";
  const serpHasData = ctx.serp?.content_upgrades?.some(u =>
    u.toLowerCase().includes("chiffr") || u.toLowerCase().includes("stat") || u.toLowerCase().includes("donn"),
  );

  if (hasGsc || isDataHeavy || serpHasData) {
    return {
      block_type: "key_stats",
      include: true,
      priority: hasGsc ? 88 : 75,
      reason: hasGsc
        ? "Données GSC disponibles — renforcer avec des stats concrètes"
        : "Type de contenu data-driven — les stats renforcent la crédibilité",
    };
  }

  return {
    block_type: "key_stats",
    include: true,
    priority: 55,
    reason: "Stats recommandées pour différenciation SERP",
  };
}

function shouldShowSimulation(ctx: PageContext): BlockDecision {
  const isTransactional = ctx.intent?.type === "transactional" || ctx.intent?.type === "commercial";
  const isGuide = ctx.intent?.content_type === "guide" || ctx.intent?.content_type === "tutorial";
  const serpLacksTools = ctx.serp?.weaknesses?.some(w =>
    w.toLowerCase().includes("outil") || w.toLowerCase().includes("calcul") || w.toLowerCase().includes("simulat"),
  );

  if (isTransactional || serpLacksTools) {
    return {
      block_type: "simulation",
      include: true,
      priority: 90,
      reason: isTransactional
        ? "Intent transactionnelle — la simulation pousse à l'action"
        : "Les concurrents manquent d'outils interactifs — opportunité de différenciation",
    };
  }

  if (isGuide) {
    return {
      block_type: "simulation",
      include: true,
      priority: 70,
      reason: "Un exemple concret renforce un guide",
    };
  }

  return {
    block_type: "simulation",
    include: false,
    priority: 30,
    reason: "Simulation non pertinente pour ce type de contenu",
  };
}

function shouldShowGscInsight(ctx: PageContext): BlockDecision {
  if (!ctx.gsc || ctx.gsc.current_position === null) {
    return {
      block_type: "gsc_insight",
      include: false,
      priority: 0,
      reason: "Pas de données GSC pour ce mot-clé",
    };
  }

  // Position 4-20 = opportunité d'amélioration visible
  if (ctx.gsc.current_position >= 4 && ctx.gsc.current_position <= 20) {
    return {
      block_type: "gsc_insight",
      include: true,
      priority: 80,
      reason: `Position ${ctx.gsc.current_position} — page à optimiser, forte marge de progression`,
    };
  }

  // Position 1-3 = déjà forte, maintenir
  if (ctx.gsc.current_position <= 3) {
    return {
      block_type: "gsc_insight",
      include: true,
      priority: 65,
      reason: `Position ${ctx.gsc.current_position} — maintenir et renforcer la position`,
    };
  }

  // Position > 20 = page faible, besoin de boost
  return {
    block_type: "gsc_insight",
    include: true,
    priority: 85,
    reason: `Position ${ctx.gsc.current_position} — page faible, optimisation agressive nécessaire`,
  };
}

function shouldShowInsights(ctx: PageContext): BlockDecision {
  // Les insights sont toujours utiles — ajustement de priorité
  const isPro = ctx.intent?.content_type === "tutorial" || ctx.intent?.content_type === "guide";

  return {
    block_type: "insight",
    include: true,
    priority: isPro ? 80 : 65,
    reason: isPro
      ? "Audience pro — les insights experts renforcent l'autorité"
      : "Insights pour valeur ajoutée rapide",
  };
}

function shouldShowMistakes(ctx: PageContext): BlockDecision {
  const isInfo = ctx.intent?.type === "informational";
  const serpMissesMistakes = ctx.serp?.opportunities?.some(o =>
    o.toLowerCase().includes("erreur") || o.toLowerCase().includes("piège") || o.toLowerCase().includes("éviter"),
  );

  if (isInfo || serpMissesMistakes) {
    return {
      block_type: "mistakes",
      include: true,
      priority: serpMissesMistakes ? 82 : 70,
      reason: serpMissesMistakes
        ? "Concurrents ne couvrent pas les erreurs — opportunité de différenciation"
        : "Intent informationnelle — les erreurs enrichissent le contenu",
    };
  }

  return {
    block_type: "mistakes",
    include: true,
    priority: 50,
    reason: "Section erreurs standard pour complétude",
  };
}

function shouldShowFaq(ctx: PageContext): BlockDecision {
  // FAQ = toujours utile pour le SEO (schema markup, People Also Ask)
  const inTopTwenty = ctx.gsc?.current_position != null && ctx.gsc.current_position <= 20;

  return {
    block_type: "faq",
    include: true,
    priority: inTopTwenty ? 85 : 60,
    reason: inTopTwenty
      ? "Position top 20 — FAQ pour cibler 'People Also Ask'"
      : "FAQ standard pour couverture sémantique",
  };
}

function shouldShowComparison(ctx: PageContext): BlockDecision {
  const isComparison = ctx.intent?.content_type === "comparison";
  const serpHasComparison = ctx.serp?.dominant_format === "comparison";

  if (isComparison || serpHasComparison) {
    return {
      block_type: "comparison",
      include: true,
      priority: 88,
      reason: "Format comparatif attendu par l'audience et Google",
    };
  }

  return {
    block_type: "comparison",
    include: false,
    priority: 0,
    reason: "Pas de comparaison pertinente pour cette page",
  };
}

function shouldShowCta(ctx: PageContext): BlockDecision {
  const isTransactional = ctx.intent?.type === "transactional" || ctx.intent?.type === "commercial";
  const isPillar = ctx.cocoon?.page_type === "pillar";

  return {
    block_type: "cta",
    include: true,
    priority: isTransactional || isPillar ? 90 : 50,
    reason: isTransactional
      ? "Intent transactionnelle — CTA fort pour conversion"
      : isPillar
        ? "Page pilier — CTA pour capturer le trafic SEO"
        : "CTA léger pour engagement",
  };
}

// ── Fonctions de section ────────────────────────────────────────────────────

function decideSectionCount(ctx: PageContext): number {
  // Nombre de sections basé sur la concurrence et le type de contenu
  const serpAvg = ctx.serp?.avg_word_count ?? 1200;
  const isGuide = ctx.intent?.content_type === "guide" || ctx.intent?.content_type === "tutorial";
  const isPillar = ctx.cocoon?.page_type === "pillar";

  if (isPillar) return 6; // Les piliers sont les plus développés
  if (isGuide && serpAvg > 2000) return 5;
  if (isGuide) return 4;
  return 3; // Minimum pour les pages support/complémentaires
}

function decideSectionPriority(ctx: PageContext, index: number, total: number): number {
  // Les premières sections sont les plus importantes
  const basePriority = 90 - (index * (40 / total));
  return Math.round(basePriority);
}

// ── Moteur principal ────────────────────────────────────────────────────────

export function makeDecisions(ctx: PageContext): {
  decisions: BlockDecision[];
  section_count: number;
  content_strategy: string;
} {
  const decisions: BlockDecision[] = [
    shouldShowHero(ctx),
    shouldShowQuickAnswer(ctx),
    shouldShowStats(ctx),
    shouldShowSimulation(ctx),
    shouldShowGscInsight(ctx),
    shouldShowInsights(ctx),
    shouldShowMistakes(ctx),
    shouldShowFaq(ctx),
    shouldShowComparison(ctx),
    shouldShowCta(ctx),
  ];

  const sectionCount = decideSectionCount(ctx);

  // Ajouter les décisions de sections
  for (let i = 0; i < sectionCount; i++) {
    decisions.push({
      block_type: "section",
      include: true,
      priority: decideSectionPriority(ctx, i, sectionCount),
      reason: `Section ${i + 1}/${sectionCount}`,
    });
  }

  // Déterminer la stratégie globale de contenu
  const contentStrategy = buildContentStrategy(ctx);

  return { decisions, section_count: sectionCount, content_strategy: contentStrategy };
}

// Filtre et ordonne les blocs à inclure
export function getBlockOrder(decisions: BlockDecision[]): PageBlock["type"][] {
  // Ordre fixe pour la structure UX (indépendant de la priorité)
  const blockOrder: PageBlock["type"][] = [
    "hero",
    "quick_answer",
    "gsc_insight",
    "key_stats",
    "simulation",
    "section",      // placeholder — les sections seront intercalées
    "comparison",
    "insight",
    "mistakes",
    "faq",
    "cta",
  ];

  const included = new Set(
    decisions.filter(d => d.include).map(d => d.block_type),
  );

  return blockOrder.filter(type => included.has(type));
}

// Stratégie de contenu basée sur le contexte
function buildContentStrategy(ctx: PageContext): string {
  const parts: string[] = [];

  // Type de page
  if (ctx.cocoon?.page_type === "pillar") {
    parts.push("Page pilier : contenu exhaustif, ancre du cluster, autorité maximale.");
  } else if (ctx.cocoon?.page_type === "support") {
    parts.push(`Page support du cluster "${ctx.cocoon.cluster}" : contenu ciblé, liens vers le pilier.`);
  }

  // Intent
  if (ctx.intent?.type === "transactional") {
    parts.push("Intent transactionnelle : focus conversion, CTA fort, simulation/outil.");
  } else if (ctx.intent?.type === "informational") {
    parts.push("Intent informationnelle : focus valeur, éducation, featured snippet.");
  } else if (ctx.intent?.type === "commercial") {
    parts.push("Intent commerciale : comparaisons, preuves, données chiffrées.");
  }

  // Position GSC
  if (ctx.gsc?.current_position != null) {
    if (ctx.gsc.current_position <= 3) {
      parts.push(`Position ${ctx.gsc.current_position} : maintenir en enrichissant le contenu, cibler position 0.`);
    } else if (ctx.gsc.current_position <= 10) {
      parts.push(`Position ${ctx.gsc.current_position} : optimiser pour top 3 — renforcer E-E-A-T et contenu.`);
    } else if (ctx.gsc.current_position <= 20) {
      parts.push(`Position ${ctx.gsc.current_position} : potentiel fort — contenu supérieur pour percer en page 1.`);
    } else {
      parts.push(`Position ${ctx.gsc.current_position} : page faible — contenu agressif, longue traîne, liens internes.`);
    }
  }

  // SERP
  if (ctx.serp?.differentiation) {
    parts.push(`Différenciation SERP : ${ctx.serp.differentiation}`);
  }

  // Roadmap
  if (ctx.roadmap) {
    parts.push(`Roadmap phase ${ctx.roadmap.phase}, priorité ${ctx.roadmap.priority} : ${ctx.roadmap.objective}`);
  }

  return parts.join(" ");
}
