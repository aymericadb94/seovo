/**
 * Pipeline Test API
 *
 * Tests each post-generation step individually with minimal content.
 * Returns detailed success/failure status for each step.
 *
 * GET /api/pipeline-test — runs all 6 content steps + meta
 */

import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

type StepResult = {
  step: number;
  name: string;
  status: "success" | "failed" | "skipped";
  duration_ms: number;
  detail: string;
};

const TEST_CONTENT = `<h1>Comment choisir son fournisseur de vêtements vintage</h1>
<h2>Les critères essentiels</h2>
<p>Choisir un fournisseur de vêtements vintage demande de la rigueur. La qualité des pièces, la régularité des stocks et la transparence des prix sont les trois piliers d'un bon partenariat.</p>
<h2>Les erreurs à éviter</h2>
<p>Beaucoup de débutants font l'erreur de commander de gros volumes sans avoir testé la qualité. Commencez petit, évaluez, puis augmentez progressivement vos commandes.</p>`;

const TEST_KEYWORD = "fournisseur vêtements vintage";

async function testStep(
  stepNum: number,
  name: string,
  url: string,
  body: Record<string, unknown>,
  validate: (data: unknown) => string,
): Promise<StepResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const duration = Date.now() - start;

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { step: stepNum, name, status: "failed", duration_ms: duration, detail: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json();
    if (data.error) {
      return { step: stepNum, name, status: "failed", duration_ms: duration, detail: `API error: ${data.error}` };
    }

    const validation = validate(data);
    return { step: stepNum, name, status: validation === "ok" ? "success" : "failed", duration_ms: duration, detail: validation };
  } catch (err) {
    return { step: stepNum, name, status: "failed", duration_ms: Date.now() - start, detail: `Exception: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const results: StepResult[] = [];

  // Step 7: Enrichissement sémantique
  results.push(await testStep(7, "Enrichissement sémantique", `${baseUrl}/api/content/enrich`, {
    content: TEST_CONTENT,
    title: "Comment choisir son fournisseur de vêtements vintage",
    keyword: TEST_KEYWORD,
    language: "fr",
  }, (d: unknown) => {
    const data = d as { enrichment?: { improved_content?: string } };
    if (!data.enrichment?.improved_content) return "Pas de improved_content dans la réponse";
    if (data.enrichment.improved_content.length < 100) return `Contenu trop court: ${data.enrichment.improved_content.length} chars`;
    return "ok";
  }));

  // Step 8: Valeur ajoutée
  results.push(await testStep(8, "Valeur ajoutée & crédibilité", `${baseUrl}/api/content/enhance`, {
    content: TEST_CONTENT,
    title: "Comment choisir son fournisseur de vêtements vintage",
    keyword: TEST_KEYWORD,
    language: "fr",
  }, (d: unknown) => {
    const data = d as { enhancement?: { enhanced_content?: string } };
    if (!data.enhancement?.enhanced_content) return "Pas de enhanced_content dans la réponse";
    if (data.enhancement.enhanced_content.length < 100) return `Contenu trop court: ${data.enhancement.enhanced_content.length} chars`;
    return "ok";
  }));

  // Step 9: Maillage interne
  results.push(await testStep(9, "Maillage interne intelligent", `${baseUrl}/api/content/linking`, {
    content: TEST_CONTENT,
    title: "Comment choisir son fournisseur de vêtements vintage",
    keyword: TEST_KEYWORD,
    language: "fr",
  }, (d: unknown) => {
    const data = d as { linking?: { updated_content?: string } };
    if (!data.linking?.updated_content) return "Pas de updated_content dans la réponse";
    return "ok";
  }));

  // Step 10: Audit qualité SEO
  results.push(await testStep(10, "Audit qualité SEO", `${baseUrl}/api/content/audit`, {
    content: TEST_CONTENT,
    primary_keyword: TEST_KEYWORD,
    language: "fr",
  }, (d: unknown) => {
    const data = d as { audit?: { corrected_content?: string; naturalness_score?: number } };
    if (!data.audit?.corrected_content) return "Pas de corrected_content dans la réponse";
    return `ok (naturalness: ${data.audit.naturalness_score ?? "?"}/100)`;
  }));

  // Step 11: Optimisation title & meta
  results.push(await testStep(11, "Optimisation title & meta", `${baseUrl}/api/content/meta`, {
    primary_keyword: TEST_KEYWORD,
    content_summary: TEST_CONTENT.replace(/<[^>]+>/g, "").slice(0, 500),
    language: "fr",
  }, (d: unknown) => {
    const data = d as { meta?: { titles?: string[]; meta_descriptions?: string[] } };
    if (!data.meta?.titles?.length) return "Pas de titles dans la réponse";
    if (!data.meta?.meta_descriptions?.length) return "Pas de meta_descriptions dans la réponse";
    return `ok (${data.meta.titles.length} titres, ${data.meta.meta_descriptions.length} metas)`;
  }));

  // Step 12: Contrôle final qualité
  results.push(await testStep(12, "Contrôle final qualité", `${baseUrl}/api/content/final-check`, {
    content: TEST_CONTENT,
    title: "Comment choisir son fournisseur de vêtements vintage",
    primary_keyword: TEST_KEYWORD,
    language: "fr",
  }, (d: unknown) => {
    const data = d as { check?: { final_content?: string; final_verdict?: string; quality_score?: number } };
    if (!data.check?.final_content) return "Pas de final_content dans la réponse";
    if (!data.check?.final_verdict) return "Pas de final_verdict dans la réponse";
    return `ok (verdict: ${data.check.final_verdict}, quality: ${data.check.quality_score ?? "?"}/100)`;
  }));

  // Summary
  const passed = results.filter(r => r.status === "success").length;
  const failed = results.filter(r => r.status === "failed").length;
  const totalTime = results.reduce((s, r) => s + r.duration_ms, 0);

  return Response.json({
    summary: `${passed}/${results.length} étapes OK, ${failed} échec(s), ${Math.round(totalTime / 1000)}s total`,
    results,
  });
}
