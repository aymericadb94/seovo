/**
 * Smart Keyword Suggestions API
 *
 * Returns keywords prioritized from:
 * 1. Roadmap (unpublished articles — highest priority)
 * 2. Cocoon (cluster keywords not yet covered)
 * 3. Site keywords (fallback)
 *
 * Each keyword is tagged with its source and priority.
 */

import { createClient } from "@/lib/supabase/server";

type SuggestedKeyword = {
  keyword: string;
  source: "roadmap" | "cocoon" | "settings";
  role: "pillar" | "support" | "unknown";
  cluster: string | null;
  phase: number | null;
  priority: "haute" | "moyenne" | "faible";
  reason: string;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Fetch all data in parallel
    const [siteRes, pubsRes, roadmapRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("keywords").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("keyword").eq("user_id", user.id),
      supabase.from("roadmaps").select("data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const siteKeywords: string[] = siteRes.data?.keywords ?? [];
    const publishedKeywords = new Set(
      (pubsRes.data ?? []).map(p => p.keyword?.toLowerCase()).filter(Boolean)
    );

    const suggestions: SuggestedKeyword[] = [];
    const seenKeywords = new Set<string>();

    // ── 1. Roadmap keywords (highest priority) ────────────────────────────
    type RoadmapArticle = {
      title: string;
      keyword: string;
      role: string;
      cluster?: string;
      phase?: number;
      priority?: string;
    };

    const roadmapData = roadmapRes.data?.data as { articles?: RoadmapArticle[] } | null;
    const roadmapArticles = roadmapData?.articles ?? [];

    for (const article of roadmapArticles) {
      const kw = article.keyword?.trim();
      if (!kw) continue;
      const kwLower = kw.toLowerCase();
      if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;

      seenKeywords.add(kwLower);
      suggestions.push({
        keyword: kw,
        source: "roadmap",
        role: article.role === "pilier" || article.role === "pillar" ? "pillar" : "support",
        cluster: article.cluster ?? null,
        phase: article.phase ?? null,
        priority: article.phase === 1 || article.priority === "haute" ? "haute"
          : article.phase === 2 || article.priority === "moyenne" ? "moyenne"
          : "faible",
        reason: article.phase
          ? `Roadmap phase ${article.phase} — ${article.role}`
          : `Roadmap — ${article.role}`,
      });
    }

    // ── 2. Cocoon keywords (not published, not in roadmap) ────────────────
    type CocoonCluster = {
      name: string;
      priority: string;
      pillar: { title: string; keyword: string; status: string };
      support_pages: { title: string; keyword: string; status: string }[];
    };

    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];

    for (const cluster of clusters) {
      // Pillar
      const pillarKw = cluster.pillar?.keyword?.trim();
      if (pillarKw && cluster.pillar.status !== "existing") {
        const kwLower = pillarKw.toLowerCase();
        if (!publishedKeywords.has(kwLower) && !seenKeywords.has(kwLower)) {
          seenKeywords.add(kwLower);
          suggestions.push({
            keyword: pillarKw,
            source: "cocoon",
            role: "pillar",
            cluster: cluster.name,
            phase: null,
            priority: cluster.priority === "haute" ? "haute" : "moyenne",
            reason: `Page pilier du cluster "${cluster.name}"`,
          });
        }
      }

      // Supports
      for (const sp of cluster.support_pages ?? []) {
        const spKw = sp.keyword?.trim();
        if (!spKw || sp.status === "existing") continue;
        const kwLower = spKw.toLowerCase();
        if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;

        seenKeywords.add(kwLower);
        suggestions.push({
          keyword: spKw,
          source: "cocoon",
          role: "support",
          cluster: cluster.name,
          phase: null,
          priority: "moyenne",
          reason: `Page support du cluster "${cluster.name}"`,
        });
      }
    }

    // ── 3. Site keywords (fallback — not in roadmap or cocoon) ────────────
    for (const kw of siteKeywords) {
      const kwLower = kw.toLowerCase();
      if (publishedKeywords.has(kwLower) || seenKeywords.has(kwLower)) continue;

      seenKeywords.add(kwLower);
      suggestions.push({
        keyword: kw,
        source: "settings",
        role: "unknown",
        cluster: null,
        phase: null,
        priority: "faible",
        reason: "Mot-clé configuré",
      });
    }

    // ── Sort: haute > moyenne > faible, then roadmap > cocoon > settings ──
    const priorityOrder = { haute: 0, moyenne: 1, faible: 2 };
    const sourceOrder = { roadmap: 0, cocoon: 1, settings: 2 };
    suggestions.sort((a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      sourceOrder[a.source] - sourceOrder[b.source]
    );

    return Response.json({
      suggestions,
      stats: {
        total: suggestions.length,
        from_roadmap: suggestions.filter(s => s.source === "roadmap").length,
        from_cocoon: suggestions.filter(s => s.source === "cocoon").length,
        from_settings: suggestions.filter(s => s.source === "settings").length,
        already_published: publishedKeywords.size,
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
