import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import {
  computeProjections,
  type GSCQuery,
  type ProjectionsResult,
  type CocoonContext,
  type RoadmapContext,
} from "@/lib/seo-projections";
import { listAllCmsContent, type CmsCredentials } from "@/lib/cms-update";

export const maxDuration = 60;

async function fetchGSCQueries(token: string, gscSiteUrl: string): Promise<GSCQuery[]> {
  try {
    const siteUrl = encodeURIComponent(gscSiteUrl);
    const end = new Date(); end.setDate(end.getDate() - 2);
    const start = new Date(); start.setDate(start.getDate() - 32);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 200 }),
      }
    );
    if (!res.ok) return [];
    type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
    const data = (await res.json()) as { rows?: Row[] };
    return (data.rows ?? []).map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: Math.round(r.position * 10) / 10,
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: cached } = await supabase
      .from("seo_projections")
      .select("data, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    return Response.json({ projections: (cached?.data as ProjectionsResult) ?? null, computed_at: cached?.updated_at ?? null });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Fetch site + all context in parallel
    const { data: site } = await supabase
      .from("sites")
      .select("id, keywords, seo_context, seo_score_initial, site_url, cms, gsc_site_url, google_refresh_token, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const keywords: string[] = site.keywords ?? [];
    if (keywords.length === 0) return Response.json({ error: "Aucun mot-clé configuré — lancez d'abord l'analyse SEO" }, { status: 400 });

    // Fetch all data sources in parallel
    const creds: CmsCredentials = {
      cms: site.cms, site_url: site.site_url,
      wp_username: site.wp_username, wp_app_password: site.wp_app_password,
      shopify_api_key: site.shopify_api_key, shopify_store_url: site.shopify_store_url,
      wix_api_key: site.wix_api_key, wix_site_id: site.wix_site_id,
      custom_api_url: site.custom_api_url, custom_api_key: site.custom_api_key,
    };

    const [gscQueries, cocoonRes, roadmapRes, cmsContent] = await Promise.all([
      // GSC
      (async () => {
        if (!site.gsc_site_url) return [];
        const token = await getValidAccessToken(user.id);
        if (!token) return [];
        return fetchGSCQueries(token, site.gsc_site_url);
      })(),
      // Cocoon
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
      // Roadmap
      supabase.from("roadmaps").select("data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      // CMS pages
      listAllCmsContent(creds, 200).catch(() => []),
    ]);

    const cocoon = (cocoonRes.data?.data ?? null) as CocoonContext | null;
    const roadmap = (roadmapRes.data?.data ?? null) as RoadmapContext | null;
    const cmsPages = cmsContent.map(p => ({ title: p.title, url: p.url }));

    const result = computeProjections(
      keywords.slice(0, 25),
      gscQueries,
      site.seo_score_initial ?? 35,
      site.seo_context as Record<string, unknown> | null,
      site.site_url,
      cocoon,
      roadmap,
      cmsPages,
    );

    const { error: upsertError } = await supabase
      .from("seo_projections")
      .upsert(
        { user_id: user.id, data: result, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      return Response.json({ error: "Projections calculées mais non sauvegardées : " + upsertError.message }, { status: 500 });
    }

    return Response.json({ projections: result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
