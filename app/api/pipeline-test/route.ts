/**
 * Pipeline Test API
 *
 * Tests each post-generation step by calling AI directly (no fetch).
 * Returns detailed success/failure status for each step.
 *
 * GET /api/pipeline-test — runs all 6 content steps
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson, type TaskType } from "@/lib/ai-router";

export const maxDuration = 120;

type StepResult = {
  step: number;
  name: string;
  status: "success" | "failed";
  duration_ms: number;
  detail: string;
  model?: string;
};

const TEST_HTML = `<h1>Comment choisir son fournisseur vintage</h1>
<h2>Les critères essentiels</h2>
<p>Choisir un fournisseur de vêtements vintage demande de la rigueur. La qualité des pièces et la transparence des prix sont les deux piliers d'un bon partenariat.</p>
<h2>Les erreurs à éviter</h2>
<p>Beaucoup de débutants commandent de gros volumes sans tester la qualité. Commencez petit puis augmentez progressivement.</p>`;

const KW = "fournisseur vêtements vintage";

async function testAiStep(
  stepNum: number,
  name: string,
  task: TaskType,
  prompt: string,
  validate: (parsed: unknown) => string,
): Promise<StepResult> {
  const start = Date.now();
  try {
    const result = await aiCall(
      { task },
      { messages: [{ role: "user", content: prompt }], max_tokens: 2000 }
    );
    const duration = Date.now() - start;

    if (!result.text) {
      return { step: stepNum, name, status: "failed", duration_ms: duration, detail: "AI returned empty text", model: result.model };
    }

    const parsed = parseAiJson(result.text);
    if (!parsed) {
      return { step: stepNum, name, status: "failed", duration_ms: duration, detail: `JSON parse failed. Raw (200ch): ${result.text.slice(0, 200)}`, model: result.model };
    }

    const validation = validate(parsed);
    return {
      step: stepNum,
      name,
      status: validation.startsWith("ok") ? "success" : "failed",
      duration_ms: duration,
      detail: validation,
      model: result.model,
    };
  } catch (err) {
    return { step: stepNum, name, status: "failed", duration_ms: Date.now() - start, detail: `Exception: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const results: StepResult[] = [];

  // ── Step 7: Enrichissement sémantique ──────────────────────────────
  results.push(await testAiStep(7, "Enrichissement sémantique", "semantic_enrichment",
    `Enrichis ce contenu HTML SEO en ajoutant des synonymes et du micro-contenu. Mot-clé: "${KW}". Langue: fr.

CONTENU:
${TEST_HTML}

FORMAT JSON uniquement:
{"improved_content": "le HTML enrichi", "improvements": ["amélioration 1"], "semantic_additions": ["terme 1"]}`,
    (d) => {
      const data = d as { improved_content?: string };
      if (!data.improved_content) return "Pas de improved_content";
      if (data.improved_content.length < 50) return `Contenu trop court: ${data.improved_content.length}ch`;
      return `ok (${data.improved_content.length} chars)`;
    }
  ));

  // ── Step 8: Valeur ajoutée & crédibilité ───────────────────────────
  results.push(await testAiStep(8, "Valeur ajoutée & crédibilité", "value_enhancement",
    `Ajoute des exemples concrets et des conseils pratiques à ce contenu. Mot-clé: "${KW}". Langue: fr.

CONTENU:
${TEST_HTML}

FORMAT JSON uniquement:
{"enhanced_content": "le HTML amélioré", "added_examples": ["ex1"], "added_tips": ["tip1"]}`,
    (d) => {
      const data = d as { enhanced_content?: string };
      if (!data.enhanced_content) return "Pas de enhanced_content";
      return `ok (${data.enhanced_content.length} chars)`;
    }
  ));

  // ── Step 9: Maillage interne intelligent ───────────────────────────
  results.push(await testAiStep(9, "Maillage interne intelligent", "internal_linking",
    `Ajoute 2 liens internes naturels dans ce contenu. Mot-clé: "${KW}". Langue: fr.
Pages existantes:
- /post/ouvrir-friperie-en-ligne (Ouvrir une friperie en ligne)
- /post/vetements-vintage-tendance (Vêtements vintage tendance 2024)

CONTENU:
${TEST_HTML}

FORMAT JSON uniquement:
{"updated_content": "le HTML avec liens ajoutés", "links_added": [{"anchor": "texte", "target": "/url"}]}`,
    (d) => {
      const data = d as { updated_content?: string };
      if (!data.updated_content) return "Pas de updated_content";
      const hasLinks = data.updated_content.includes("<a ");
      return hasLinks ? `ok (liens trouvés, ${data.updated_content.length} chars)` : `ok mais aucun <a> trouvé (${data.updated_content.length} chars)`;
    }
  ));

  // ── Step 10: Audit qualité SEO ─────────────────────────────────────
  results.push(await testAiStep(10, "Audit qualité SEO", "content_audit",
    `Audite ce contenu SEO: détecte la sur-optimisation, les patterns IA, la naturalité. Corrige si nécessaire. Mot-clé: "${KW}".

CONTENU:
${TEST_HTML}

FORMAT JSON uniquement:
{"corrected_content": "le HTML corrigé", "naturalness_score": 85, "issues_detected": [], "risk_level": "low"}`,
    (d) => {
      const data = d as { corrected_content?: string; naturalness_score?: number };
      if (!data.corrected_content) return "Pas de corrected_content";
      return `ok (naturalness: ${data.naturalness_score ?? "?"}/100, ${data.corrected_content.length} chars)`;
    }
  ));

  // ── Step 11: Optimisation title & meta ─────────────────────────────
  results.push(await testAiStep(11, "Optimisation title & meta", "meta_optimization",
    `Génère 3 titres SEO (50-60 chars) et 2 meta descriptions (140-160 chars) pour: "${KW}". Langue: fr.

FORMAT JSON uniquement:
{"titles": ["titre1", "titre2", "titre3"], "meta_descriptions": ["meta1", "meta2"], "ctr_strategy": "stratégie"}`,
    (d) => {
      const data = d as { titles?: string[]; meta_descriptions?: string[] };
      if (!data.titles?.length) return "Pas de titles";
      if (!data.meta_descriptions?.length) return "Pas de meta_descriptions";
      return `ok (${data.titles.length} titres: "${data.titles[0]}", ${data.meta_descriptions.length} metas)`;
    }
  ));

  // ── Step 12: Contrôle final qualité ────────────────────────────────
  results.push(await testAiStep(12, "Contrôle final qualité", "final_check",
    `Tu es un expert SEO. Effectue un contrôle final qualité de ce contenu avant publication.

Mot-clé principal : "${KW}"

CONTENU HTML :
${TEST_HTML}

IMPORTANT : Tu DOIS retourner le champ "final_content" avec le HTML complet (corrigé ou identique si déjà bon).

FORMAT JSON uniquement, sans texte avant ou après :
{
  "quality_score": 85,
  "seo_score": 80,
  "readability_score": 85,
  "issues": ["problème éventuel"],
  "improvements": ["amélioration appliquée"],
  "final_verdict": "ready",
  "final_content": "<h1>Le contenu HTML complet ici</h1>..."
}`,
    (d) => {
      const data = d as Record<string, unknown>;
      // Try multiple field names in case AI uses different naming
      const content = (data.final_content ?? data.finalContent ?? data.content ?? data.corrected_content) as string | undefined;
      const verdict = (data.final_verdict ?? data.finalVerdict ?? data.verdict) as string | undefined;
      if (!content) return `Pas de final_content. Clés retournées: ${Object.keys(data).join(", ")}`;
      if (!verdict) return `ok mais pas de verdict (${content.length} chars)`;
      return `ok (verdict: ${verdict}, quality: ${(data.quality_score as number) ?? "?"}/100)`;
    }
  ));

  // Summary
  const passed = results.filter(r => r.status === "success").length;
  const failed = results.filter(r => r.status === "failed").length;
  const totalTime = results.reduce((s, r) => s + r.duration_ms, 0);

  return Response.json({
    summary: `${passed}/${results.length} étapes OK, ${failed} échec(s), ${Math.round(totalTime / 1000)}s total`,
    results,
  });
}
