/**
 * Internal Linking API
 *
 * GET  — Retrieve saved linking analysis
 * POST — Run data-driven linking analysis (seo-linking engine + Claude enrichment)
 */

import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { fetchGscData, fetchGscQueriesRange } from "@/lib/seo-events";
import { listCmsPosts, type CmsCredentials } from "@/lib/cms-update";
import { analyzeLinking, type LinkingAnalysis } from "@/lib/seo-linking";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import type { GSCQuery } from "@/lib/seo-projections";

export const maxDuration = 120;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: record, error } = await supabase
      .from("internal_linking")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code === "PGRST205") {
      return Response.json({ result: null, tableNotReady: true });
    }

    return Response.json({ result: record ?? null });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Fetch site config
    const { data: site } = await supabase
      .from("sites")
      .select("id, business_name, industry, site_url, shopify_store_url, keywords, gsc_site_url, cms, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // Build CMS credentials
    const creds: CmsCredentials = {
      cms: site.cms,
      site_url: site.site_url,
      wp_username: site.wp_username,
      wp_app_password: site.wp_app_password,
      shopify_api_key: site.shopify_api_key,
      shopify_store_url: site.shopify_store_url,
      wix_api_key: site.wix_api_key,
      wix_site_id: site.wix_site_id,
      custom_api_url: site.custom_api_url,
      custom_api_key: site.custom_api_key,
    };

    // Fetch CMS posts
    const cmsPosts = await listCmsPosts(creds, 200);
    if (cmsPosts.length < 3) {
      return Response.json({ error: "Pas assez de pages CMS (minimum 3)" }, { status: 400 });
    }

    // Fetch GSC data if available (current J-32→J-2 + previous J-62→J-32 for trend)
    let gscQueries: GSCQuery[] = [];
    let gscQueriesPrev: GSCQuery[] = [];
    if (site.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const now = new Date();
          const fmt = (d: Date) => d.toISOString().split("T")[0];
          const d2 = new Date(now); d2.setDate(d2.getDate() - 2);
          const d32 = new Date(now); d32.setDate(d32.getDate() - 32);
          const d62 = new Date(now); d62.setDate(d62.getDate() - 62);

          const [gscCurrent, prevQueries] = await Promise.all([
            fetchGscData(token, site.gsc_site_url, 30),
            fetchGscQueriesRange(token, site.gsc_site_url, fmt(d62), fmt(d32)),
          ]);
          gscQueries = gscCurrent?.queries ?? [];
          gscQueriesPrev = prevQueries;
        }
      } catch { /* non-fatal — analysis works without GSC */ }
    }

    // ── Run data-driven analysis ──────────────────────────────────────────
    const analysis = await analyzeLinking(
      supabase,
      user.id,
      cmsPosts,
      gscQueries,
      site.site_url,
      gscQueriesPrev.length > 0 ? gscQueriesPrev : undefined
    );

    // ── Enrich with Claude for opportunities & commentary ─────────────────
    const opportunities = await enrichWithClaude(site, analysis);

    // ── Build final result (matches existing frontend format) ─────────────
    const result = {
      score: analysis.global_score,
      score_label: analysis.global_label,
      score_comment: buildScoreComment(analysis),
      cluster_analysis: analysis.cluster_strengths.map(c => ({
        name: c.name,
        pillar: c.pillar_url ?? "Non publié",
        pages: analysis.page_profiles
          .filter(p => p.cluster === c.name)
          .map(p => p.title),
        missing_links: c.missing_links,
        strength_score: c.strength_score,
        avg_position: c.avg_position,
        position_trend: c.position_trend,
        impressions_trend: c.impressions_trend,
      })),
      suggestions: analysis.suggestions.map(s => ({
        from_title: s.from_title,
        from_url: s.from_url,
        to_title: s.to_title,
        to_url: s.to_url,
        anchor: s.anchor,
        placement: s.placement,
        objective: s.objective,
        priority: s.priority,
        justification: s.justification,
        risk_score: s.risk_score,
      })),
      orphan_pages: analysis.orphan_pages,
      underlinked_pages: analysis.underlinked_pages,
      page_profiles: analysis.page_profiles.map(p => ({
        url: p.url,
        title: p.title,
        role: p.role,
        cluster: p.cluster,
        outgoing: p.outgoing_internal,
        incoming: p.incoming_internal,
        link_score: p.link_score,
        position: p.position,
      })),
      existing_links: analysis.existing_links.map(l => ({
        from_url: l.from_url,
        from_title: l.from_title,
        to_url: l.to_url,
        to_title: l.to_title,
      })),
      opportunities: opportunities ?? [],
    };

    // Persist
    try {
      await supabase
        .from("internal_linking")
        .upsert(
          { user_id: user.id, data: result, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch { /* table pas encore créée — non bloquant */ }

    return Response.json({ result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}

// ── Claude enrichment — adds strategic opportunities ────────────────────────

async function enrichWithClaude(
  site: { business_name: string; industry: string; site_url: string },
  analysis: LinkingAnalysis
): Promise<string[] | null> {
  try {
    const prompt = `Tu es un expert SEO senior. Voici l'analyse de maillage interne d'un site.

SITE : ${site.business_name} — ${site.industry} — ${site.site_url}
SCORE GLOBAL : ${analysis.global_score}/100 (${analysis.global_label})
PAGES ORPHELINES : ${analysis.orphan_pages.length}
PAGES SOUS-LIÉES : ${analysis.underlinked_pages.length}
SUGGESTIONS GÉNÉRÉES : ${analysis.suggestions.length}

CLUSTERS :
${analysis.cluster_strengths.map(c =>
  `- ${c.name}: ${c.published_pages}/${c.total_pages} publiées, force ${c.strength_score}/100, ${c.missing_links} liens manquants${c.avg_position ? `, pos moy ${c.avg_position}` : ""}`
).join("\n")}

TOP SUGGESTIONS (5 premières) :
${analysis.suggestions.slice(0, 5).map(s =>
  `- ${s.from_title} → ${s.to_title} (${s.priority}, risque ${s.risk_score}): ${s.justification}`
).join("\n")}

MISSION : Génère 3-5 opportunités stratégiques d'amélioration du maillage interne. Sois concis et actionnable.

RÉPONSE JSON : ["Opportunité 1", "Opportunité 2", ...]`;

    const aiResult = await aiCall(
      { task: "linking_enrichment" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const parsed = parseAiJson<string[]>(aiResult.text);
    if (parsed) return parsed;
  } catch {
    // Non-fatal — opportunities are optional
  }
  return null;
}

function buildScoreComment(analysis: LinkingAnalysis): string {
  const { global_score, orphan_pages, underlinked_pages, suggestions, cluster_strengths } = analysis;

  if (global_score >= 75) {
    return `Maillage interne solide avec ${suggestions.length} optimisation(s) possibles.`;
  }
  if (global_score >= 50) {
    const weakClusters = cluster_strengths.filter(c => c.strength_score < 40);
    return `Maillage correct mais ${underlinked_pages.length} page(s) sous-liée(s)${weakClusters.length > 0 ? ` et ${weakClusters.length} cluster(s) faible(s)` : ""}.`;
  }
  if (global_score >= 25) {
    return `Maillage insuffisant : ${orphan_pages.length} page(s) orpheline(s), ${suggestions.length} liens à ajouter en priorité.`;
  }
  return `Maillage quasi inexistant — ${orphan_pages.length} page(s) orpheline(s). Restructuration urgente du cocon sémantique nécessaire.`;
}
