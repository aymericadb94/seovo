// ── Collecte du contexte SEO complet pour une page ──────────────────────────
// Ce module rassemble toutes les données nécessaires au moteur décisionnel

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageContext } from "./types";

type GscRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type GscResponse = {
  rows?: GscRow[];
};

// Récupérer les données GSC pour un mot-clé
async function fetchGscData(
  accessToken: string,
  siteUrl: string,
  keyword: string,
): Promise<PageContext["gsc"]> {
  try {
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 28 * 86400000).toISOString().split("T")[0];

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query"],
          dimensionFilterGroups: [{
            filters: [{ dimension: "query", operator: "contains", expression: keyword.toLowerCase() }],
          }],
          rowLimit: 10,
        }),
      },
    );

    if (!res.ok) return null;
    const data = (await res.json()) as GscResponse;
    if (!data.rows?.length) return null;

    // Trouver la meilleure correspondance
    const exact = data.rows.find(r => r.keys[0]?.toLowerCase() === keyword.toLowerCase());
    const best = exact ?? data.rows[0];

    // Déterminer la tendance (comparer avec les 28 jours précédents)
    const prevStart = new Date(Date.now() - 56 * 86400000).toISOString().split("T")[0];
    const prevEnd = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];

    let trend: "up" | "down" | "stable" = "stable";
    try {
      const prevRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            startDate: prevStart,
            endDate: prevEnd,
            dimensions: ["query"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "query", operator: "contains", expression: keyword.toLowerCase() }],
            }],
            rowLimit: 5,
          }),
        },
      );
      if (prevRes.ok) {
        const prevData = (await prevRes.json()) as GscResponse;
        const prevBest = prevData.rows?.[0];
        if (prevBest) {
          const posDiff = prevBest.position - best.position;
          trend = posDiff > 2 ? "up" : posDiff < -2 ? "down" : "stable";
        }
      }
    } catch { /* trend = stable */ }

    return {
      current_position: Math.round(best.position * 10) / 10,
      impressions: best.impressions,
      clicks: best.clicks,
      ctr: Math.round(best.ctr * 10000) / 100,
      trend,
      competing_pages: data.rows.slice(0, 5).map(r => r.keys[0]),
    };
  } catch {
    return null;
  }
}

// Récupérer le positionnement cocon pour un mot-clé
type CocoonData = {
  data: {
    clusters?: {
      name: string;
      pillar: string;
      pages: { keyword: string; role: string }[];
    }[];
  };
};

async function fetchCocoonPosition(
  supabase: SupabaseClient,
  userId: string,
  keyword: string,
): Promise<PageContext["cocoon"]> {
  try {
    const { data: cocoon } = await supabase
      .from("semantic_cocoons")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();

    if (!cocoon?.data) return null;
    const cocoonData = cocoon as CocoonData;

    const clusters = cocoonData.data.clusters ?? [];

    for (const cluster of clusters) {
      const page = cluster.pages.find(
        (p) => p.keyword.toLowerCase() === keyword.toLowerCase(),
      );
      if (!page) continue;

      const isPillar = page.role === "pillar" || cluster.pillar.toLowerCase() === keyword.toLowerCase();
      const siblings = cluster.pages
        .filter((p) => p.keyword.toLowerCase() !== keyword.toLowerCase())
        .map((p) => p.keyword);

      return {
        page_type: isPillar ? "pillar" : "support",
        cluster: cluster.name,
        pillar_relation: isPillar ? "self" : cluster.pillar,
        outgoing_links: siblings.slice(0, 4).map((s) => ({
          target: s,
          anchor: s,
          reason: "même cluster sémantique",
        })),
        incoming_links: [],
        sibling_pages: siblings,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Récupérer la position roadmap
type RoadmapData = {
  data: {
    phases?: {
      phase: number;
      actions: { keyword?: string; priority?: string; objective?: string; deadline?: string }[];
    }[];
  };
};

async function fetchRoadmapPosition(
  supabase: SupabaseClient,
  userId: string,
  keyword: string,
): Promise<PageContext["roadmap"]> {
  try {
    const { data: roadmap } = await supabase
      .from("roadmaps")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();

    if (!roadmap?.data) return null;
    const rmData = roadmap as RoadmapData;

    const phases = rmData.data.phases ?? [];
    for (const phase of phases) {
      const action = phase.actions.find(
        (a) => a.keyword?.toLowerCase() === keyword.toLowerCase(),
      );
      if (action) {
        return {
          phase: phase.phase,
          priority: (action.priority as "haute" | "moyenne" | "faible") ?? "moyenne",
          objective: action.objective ?? "",
          deadline: action.deadline ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Fonction principale : assembler tout le contexte ────────────────────────

export async function buildPageContext(
  supabase: SupabaseClient,
  userId: string,
  params: {
    keyword: string;
    language: string;
    business_name: string;
    industry: string;
    intent?: PageContext["intent"];
    keywords?: PageContext["keywords"];
    serp?: PageContext["serp"];
    style_guide?: string;
  },
): Promise<PageContext> {
  // Récupérer le site pour les tokens
  const { data: site } = await supabase
    .from("sites")
    .select("google_access_token, gsc_site_url")
    .eq("user_id", userId)
    .maybeSingle();

  // Requêtes en parallèle
  const [gsc, cocoon, roadmap] = await Promise.all([
    site?.google_access_token && site?.gsc_site_url
      ? fetchGscData(site.google_access_token, site.gsc_site_url, params.keyword)
      : Promise.resolve(null),
    fetchCocoonPosition(supabase, userId, params.keyword),
    fetchRoadmapPosition(supabase, userId, params.keyword),
  ]);

  return {
    keyword: params.keyword,
    language: params.language,
    business_name: params.business_name,
    industry: params.industry,
    intent: params.intent,
    gsc,
    cocoon,
    roadmap,
    serp: params.serp ?? null,
    keywords: params.keywords,
    style_guide: params.style_guide,
  };
}
