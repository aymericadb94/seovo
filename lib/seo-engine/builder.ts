// ── Page Builder — assemble le prompt IA basé sur les décisions du moteur ───

import type { PageContext, BlockDecision, AssembledPage, PageBlock } from "./types";
import { makeDecisions, getBlockOrder } from "./decision";
import { aiCallStream, aiCall, parseAiJson } from "@/lib/ai-router";
import crypto from "crypto";

const ENGINE_VERSION = "2.0.0";

// ── Construire le prompt système ────────────────────────────────────────────

function buildSystemPrompt(ctx: PageContext): string {
  return `Tu es un expert senior en SEO, UX writing et Product Design. 10+ ans d'expérience. Spécialisé dans :
- Pages SEO modernes (landing page + outil + article)
- UX orientée conversion
- Contenu scannable et visuellement structuré
- Stratégie différenciante basée sur l'analyse SERP

Tu travailles pour Rankpill. Tu produis des pages SEO qui donnent envie de lire et d'agir. Pas des articles blog classiques. Tu écris toujours en ${ctx.language} — non négociable.

${ctx.style_guide ? `DIRECTION ARTISTIQUE :\n${ctx.style_guide}` : ""}`;
}

// ── Construire le prompt utilisateur dynamique ──────────────────────────────

function buildUserPrompt(
  ctx: PageContext,
  decisions: BlockDecision[],
  blockOrder: PageBlock["type"][],
  sectionCount: number,
  contentStrategy: string,
): string {
  const includedBlocks = decisions.filter(d => d.include);
  const decisionLog = includedBlocks
    .map(d => `- ${d.block_type} (priorité ${d.priority}) : ${d.reason}`)
    .join("\n");

  // Contexte SEO dynamique
  const contextParts: string[] = [];

  if (ctx.gsc) {
    contextParts.push(`DONNÉES GSC :
- Position actuelle : ${ctx.gsc.current_position ?? "non classé"}
- Impressions (28j) : ${ctx.gsc.impressions}
- Clics (28j) : ${ctx.gsc.clicks}
- CTR : ${ctx.gsc.ctr}%
- Tendance : ${ctx.gsc.trend === "up" ? "↗ en hausse" : ctx.gsc.trend === "down" ? "↘ en baisse" : "→ stable"}`);
  }

  if (ctx.cocoon) {
    contextParts.push(`COCON SÉMANTIQUE :
- Type de page : ${ctx.cocoon.page_type}
- Cluster : ${ctx.cocoon.cluster}
- Relation pilier : ${ctx.cocoon.pillar_relation}
- Pages sœurs : ${ctx.cocoon.sibling_pages.slice(0, 5).join(", ")}
- Liens sortants obligatoires :
${ctx.cocoon.outgoing_links.map(l => `  → "${l.target}" (ancre: "${l.anchor}")`).join("\n")}`);
  }

  if (ctx.roadmap) {
    contextParts.push(`ROADMAP SEO :
- Phase : ${ctx.roadmap.phase}
- Priorité : ${ctx.roadmap.priority}
- Objectif : ${ctx.roadmap.objective}`);
  }

  if (ctx.serp) {
    contextParts.push(`ANALYSE SERP :
- Patterns : ${ctx.serp.patterns}
- Faiblesses concurrents : ${ctx.serp.weaknesses.join(" | ")}
- Opportunités : ${ctx.serp.opportunities.join(" | ")}
- Stratégie différenciation : ${ctx.serp.differentiation}
- Améliorations : ${ctx.serp.content_upgrades.join(" | ")}`);
  }

  if (ctx.keywords) {
    contextParts.push(`STRATÉGIE MOTS-CLÉS :
- Principal : "${ctx.keywords.primary}"
- Secondaires : ${ctx.keywords.secondary.join(", ")}
- Champ sémantique : ${ctx.keywords.semantic_field.join(", ")}
- Angle SEO : ${ctx.keywords.seo_angle}`);
  }

  // Construire les instructions de blocs dynamiques
  const blockInstructions = buildBlockInstructions(blockOrder, sectionCount, ctx);

  return `Secteur : "${ctx.industry}". Entreprise : "${ctx.business_name}".
LANGUE : Tout en ${ctx.language}.
MOT-CLÉ : "${ctx.keyword}"

---

STRATÉGIE DE CONTENU (décidée par le moteur Rankpill) :
${contentStrategy}

DÉCISIONS DU MOTEUR :
${decisionLog}

${contextParts.join("\n\n")}

---

BLOCS À GÉNÉRER (dans cet ordre) :
${blockInstructions}

---

QUALITÉ — RÈGLES ABSOLUES :
- Aucun bloc de texte long. Tout est scannable.
- Écrit par un humain expert. INTERDITES : "il est important de noter", "dans le monde actuel", "en conclusion", "il convient de", "force est de constater", "il est essentiel de".
- Style : humain, fluide, direct, pédagogique.
- Aucune sur-optimisation. Densité mot-clé < 2%.
- Aucun contenu de remplissage. Chaque phrase apporte de la valeur.
- Voix active. Direct. Concret.
- Contenu total : 1500-2200 mots.

IMAGES — OBLIGATOIRE :
- Génère "section_image_queries" : un tableau de 2-4 requêtes Pexels en anglais (3-5 mots chacune).
- Chaque requête doit correspondre à une section différente de l'article.
- Requêtes spécifiques et visuelles (ex: "vintage clothing wholesale warehouse" pas "clothes").
- Aucune requête ne doit être identique à "pexels_query" (cover image).

---

FORMAT DE SORTIE : JSON valide uniquement.
${buildJsonSchema(blockOrder, sectionCount, ctx)}`;
}

// ── Instructions dynamiques par type de bloc ────────────────────────────────

function buildBlockInstructions(
  blockOrder: PageBlock["type"][],
  sectionCount: number,
  ctx: PageContext,
): string {
  const instructions: string[] = [];

  for (const blockType of blockOrder) {
    switch (blockType) {
      case "hero":
        instructions.push(`1. HERO — Titre puissant orienté résultat, sous-titre clair, promesse forte, CTA optionnel.`);
        break;
      case "quick_answer":
        instructions.push(`2. RÉPONSE RAPIDE — 40-60 mots. Optimisé featured snippet / position 0. Réponse immédiate.`);
        break;
      case "gsc_insight":
        if (ctx.gsc) {
          instructions.push(`3. INSIGHT GSC — Basé sur la position ${ctx.gsc.current_position}, tendance ${ctx.gsc.trend}. Recommandation actionnable.`);
        }
        break;
      case "key_stats":
        instructions.push(`4. CHIFFRES CLÉS — 3-5 stats du secteur "${ctx.industry}". Réelles, sourcées, impact visuel.`);
        break;
      case "simulation":
        instructions.push(`5. SIMULATION — Exemple concret, projection chiffrée, calcul reproductible.`);
        break;
      case "section":
        instructions.push(`6. ${sectionCount} SECTIONS DE CONTENU — Chacune avec : H2 court, paragraphes courts, listes, 1 conseil concret, 1 exemple.${ctx.cocoon ? " Intégrer les liens sortants du cocon naturellement." : ""}`);
        break;
      case "comparison":
        instructions.push(`7. COMPARAISON — Tableau comparatif structuré avec headers et données claires.`);
        break;
      case "insight":
        instructions.push(`8. INSIGHTS — 3-5 blocs (tip/warning/pro). 1-2 phrases max chacun.`);
        break;
      case "mistakes":
        instructions.push(`9. ERREURS — 3-5 erreurs avec titre, explication, conséquence concrète.`);
        break;
      case "faq":
        instructions.push(`10. FAQ — 3-4 questions réelles. Réponses 40-60 mots optimisées position 0.`);
        break;
      case "cta":
        instructions.push(`11. CTA — Conclusion 2-3 phrases + bouton naturel connecté à "${ctx.business_name}".`);
        break;
    }
  }

  return instructions.join("\n");
}

// ── Schéma JSON dynamique ───────────────────────────────────────────────────

function buildJsonSchema(
  blockOrder: PageBlock["type"][],
  sectionCount: number,
  ctx: PageContext,
): string {
  const schema: Record<string, string> = {
    title: '"H1 SEO optimisé"',
    meta_description: '"150-160 caractères"',
  };

  for (const blockType of blockOrder) {
    switch (blockType) {
      case "hero":
        schema.hero = '{ "title": "...", "subtitle": "...", "promise": "...", "cta": "..." }';
        break;
      case "quick_answer":
        schema.quick_answer = '"Réponse 40-60 mots"';
        break;
      case "gsc_insight":
        schema.gsc_insight = '{ "position": number, "trend": "up|down|stable", "insight": "...", "recommendation": "..." }';
        break;
      case "key_stats":
        schema.key_stats = '[{ "value": "85%", "label": "...", "source": "..." }]';
        break;
      case "simulation":
        schema.simulation = '{ "title": "...", "scenario": "<p>HTML</p>", "result": "..." }';
        break;
      case "section":
        schema.sections = `[${sectionCount} objets: { "title": "H2 court", "content": "<p>HTML</p>", "tip": "...", "example": "..." }]`;
        break;
      case "comparison":
        schema.comparison = '{ "title": "...", "headers": ["col1", "col2"], "rows": [["val1", "val2"]] }';
        break;
      case "insight":
        schema.insights = '[{ "type": "tip|warning|pro", "text": "..." }]';
        break;
      case "mistakes":
        schema.mistakes = '[{ "title": "...", "why": "...", "consequence": "..." }]';
        break;
      case "faq":
        schema.faq = '[{ "question": "...", "answer": "..." }]';
        break;
      case "cta":
        schema.cta = '{ "text": "...", "button_text": "...", "button_url": null }';
        break;
    }
  }

  schema.internal_links = '[{ "anchor": "...", "target": "..." }]';
  schema.pexels_query = '"3-5 english keywords for cover image"';
  schema.section_image_queries = '["3-5 english keywords for section 1 image", "for section 2", "for section 3"]';
  schema.cover_alt_text = '"Texte alt SEO"';

  const entries = Object.entries(schema)
    .map(([key, val]) => `  "${key}": ${val}`)
    .join(",\n");

  return `{\n${entries}\n}`;
}

// ── Assembler la page complète ──────────────────────────────────────────────

export function buildPage(ctx: PageContext): {
  systemPrompt: string;
  userPrompt: string;
  decisions: BlockDecision[];
  blockOrder: PageBlock["type"][];
  sectionCount: number;
  contentStrategy: string;
  contextHash: string;
} {
  const { decisions, section_count, content_strategy } = makeDecisions(ctx);
  const blockOrder = getBlockOrder(decisions);

  const systemPrompt = buildSystemPrompt(ctx);
  const userPrompt = buildUserPrompt(ctx, decisions, blockOrder, section_count, content_strategy);

  // Hash du contexte pour le versioning
  const contextHash = crypto
    .createHash("md5")
    .update(JSON.stringify({ keyword: ctx.keyword, gsc: ctx.gsc, cocoon: ctx.cocoon, roadmap: ctx.roadmap }))
    .digest("hex")
    .slice(0, 12);

  return {
    systemPrompt,
    userPrompt,
    decisions,
    blockOrder,
    sectionCount: section_count,
    contentStrategy: content_strategy,
    contextHash,
  };
}

// ── Générer via streaming ───────────────────────────────────────────────────

export function generatePageStream(ctx: PageContext): {
  stream: ReadableStream;
  decisions: BlockDecision[];
  blockOrder: PageBlock["type"][];
  contextHash: string;
} {
  const { systemPrompt, userPrompt, decisions, blockOrder, contextHash } = buildPage(ctx);

  const { stream } = aiCallStream(
    { task: "content_generation" },
    { system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
  );

  return { stream, decisions, blockOrder, contextHash };
}

// ── Générer en mode synchrone ───────────────────────────────────────────────

export async function generatePageSync(ctx: PageContext): Promise<AssembledPage | null> {
  const { systemPrompt, userPrompt, decisions, blockOrder, contextHash } = buildPage(ctx);

  const result = await aiCall(
    { task: "content_generation" },
    { system: systemPrompt, messages: [{ role: "user", content: userPrompt }] },
  );

  const parsed = parseAiJson<Record<string, unknown>>(result.text);
  if (!parsed) return null;

  // Construire les blocs à partir du JSON parsé
  const blocks: PageBlock[] = [];

  for (const type of blockOrder) {
    switch (type) {
      case "hero":
        if (parsed.hero) {
          const h = parsed.hero as { title: string; subtitle: string; promise: string; cta: string | null };
          blocks.push({ type: "hero", priority: 100, data: h });
        }
        break;
      case "quick_answer":
        if (parsed.quick_answer) {
          blocks.push({
            type: "quick_answer",
            priority: 85,
            data: { answer: parsed.quick_answer as string, snippet_type: "definition" },
          });
        }
        break;
      case "gsc_insight":
        if (parsed.gsc_insight) {
          const g = parsed.gsc_insight as { position: number; trend: string; insight: string; recommendation: string };
          blocks.push({
            type: "gsc_insight",
            priority: 80,
            data: { position: g.position, trend: g.trend as "up" | "down" | "stable", insight: g.insight, recommendation: g.recommendation },
          });
        }
        break;
      case "key_stats":
        if (parsed.key_stats) {
          blocks.push({
            type: "key_stats",
            priority: 75,
            data: { stats: parsed.key_stats as { value: string; label: string; source?: string }[] },
          });
        }
        break;
      case "simulation":
        if (parsed.simulation) {
          blocks.push({
            type: "simulation",
            priority: 70,
            data: parsed.simulation as { title: string; scenario: string; result: string },
          });
        }
        break;
      case "section":
        if (parsed.sections) {
          const sections = parsed.sections as { title: string; content: string; tip?: string; example?: string }[];
          sections.forEach((s, i) => {
            blocks.push({
              type: "section",
              priority: 90 - i * 5,
              data: s,
            });
          });
        }
        break;
      case "comparison":
        if (parsed.comparison) {
          blocks.push({
            type: "comparison",
            priority: 72,
            data: parsed.comparison as { title: string; headers: string[]; rows: string[][] },
          });
        }
        break;
      case "insight":
        if (parsed.insights) {
          blocks.push({
            type: "insight",
            priority: 65,
            data: { insights: parsed.insights as { type: "tip" | "warning" | "pro"; text: string }[] },
          });
        }
        break;
      case "mistakes":
        if (parsed.mistakes) {
          blocks.push({
            type: "mistakes",
            priority: 60,
            data: { mistakes: parsed.mistakes as { title: string; why: string; consequence: string }[] },
          });
        }
        break;
      case "faq":
        if (parsed.faq) {
          blocks.push({
            type: "faq",
            priority: 55,
            data: { questions: parsed.faq as { question: string; answer: string }[] },
          });
        }
        break;
      case "cta":
        if (parsed.cta) {
          blocks.push({
            type: "cta",
            priority: 50,
            data: parsed.cta as { text: string; button_text: string; button_url: string | null },
          });
        }
        break;
    }
  }

  return {
    title: (parsed.title as string) ?? ctx.keyword,
    meta_description: (parsed.meta_description as string) ?? "",
    blocks,
    internal_links: (parsed.internal_links as { anchor: string; target: string }[]) ?? [],
    pexels_query: (parsed.pexels_query as string) ?? "",
    section_image_queries: (parsed.section_image_queries as string[]) ?? [],
    cover_alt_text: (parsed.cover_alt_text as string) ?? "",
    engine: {
      version: ENGINE_VERSION,
      decisions: decisions.filter(d => d.include).map(d => `${d.block_type}: ${d.reason}`),
      context_hash: contextHash,
      generated_at: new Date().toISOString(),
    },
  };
}

// ── Assembler le HTML pour le CMS ───────────────────────────────────────────

export function assembleCmsHtml(page: AssembledPage): string {
  const parts: string[] = [];

  for (const block of page.blocks) {
    switch (block.type) {
      case "hero":
        parts.push(`<p><strong>${block.data.subtitle}</strong></p>`);
        parts.push(`<p>${block.data.promise}</p>`);
        break;
      case "quick_answer":
        parts.push(`<h2>En bref</h2><p>${block.data.answer}</p>`);
        break;
      case "gsc_insight":
        parts.push(`<p><strong>📊 Position Google : ${block.data.position ?? "—"}</strong> — ${block.data.insight}</p>`);
        break;
      case "key_stats":
        parts.push(`<h2>Chiffres clés</h2><ul>${block.data.stats.map(s =>
          `<li><strong>${s.value}</strong> — ${s.label}${s.source ? ` <em>(${s.source})</em>` : ""}</li>`
        ).join("")}</ul>`);
        break;
      case "simulation":
        parts.push(`<h2>${block.data.title}</h2>${block.data.scenario}<p><strong>${block.data.result}</strong></p>`);
        break;
      case "section":
        parts.push(`<h2>${block.data.title}</h2>${block.data.content}`);
        if (block.data.tip) parts.push(`<p><strong>💡</strong> ${block.data.tip}</p>`);
        if (block.data.example) parts.push(`<p><em>Exemple : ${block.data.example}</em></p>`);
        break;
      case "comparison":
        parts.push(`<h2>${block.data.title}</h2>`);
        parts.push(`<table><thead><tr>${block.data.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`);
        parts.push(`<tbody>${block.data.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
        break;
      case "insight":
        for (const i of block.data.insights) {
          const icon = i.type === "tip" ? "💡" : i.type === "warning" ? "⚠️" : "🔥";
          parts.push(`<p><strong>${icon}</strong> ${i.text}</p>`);
        }
        break;
      case "mistakes":
        parts.push(`<h2>Erreurs à éviter</h2><ul>${block.data.mistakes.map(m =>
          `<li><strong>${m.title}</strong> — ${m.why} <em>${m.consequence}</em></li>`
        ).join("")}</ul>`);
        break;
      case "faq":
        parts.push(`<h2>Questions fréquentes</h2>`);
        for (const q of block.data.questions) {
          parts.push(`<h3>${q.question}</h3><p>${q.answer}</p>`);
        }
        break;
      case "cta":
        parts.push(`<p>${block.data.text}</p>`);
        break;
    }
  }

  return parts.join("\n");
}
