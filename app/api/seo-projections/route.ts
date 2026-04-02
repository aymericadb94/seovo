import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { computeProjections, type GSCQuery, type ProjectionsResult } from "@/lib/seo-projections";

export const maxDuration = 60;

type SiteData = {
  keywords: string[];
  seo_context: Record<string, unknown> | null;
  seo_score_initial: number | null;
  site_url: string;
  gsc_site_url: string | null;
  google_refresh_token: string | null;
};

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
        body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 100 }),
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

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("keywords, seo_context, seo_score_initial, site_url, gsc_site_url, google_refresh_token")
      .eq("user_id", user.id)
      .maybeSingle() as { data: SiteData | null; error: { message: string } | null };

    if (siteError) return Response.json({ error: siteError.message }, { status: 500 });
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const keywords: string[] = site.keywords ?? [];
    if (keywords.length === 0) return Response.json({ error: "Aucun mot-clé configuré — lancez d'abord l'analyse SEO" }, { status: 400 });

    let gscQueries: GSCQuery[] = [];
    if (site.gsc_site_url) {
      const token = await getValidAccessToken(user.id);
      if (token) gscQueries = await fetchGSCQueries(token, site.gsc_site_url);
    }

    const result = computeProjections(
      keywords.slice(0, 25),
      gscQueries,
      site.seo_score_initial ?? 35,
      site.seo_context as Record<string, unknown> | null,
      site.site_url
    );

    const { error: upsertError } = await supabase
      .from("seo_projections")
      .upsert(
        { user_id: user.id, data: result, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[seo-projections] upsert failed:", upsertError.message);
      return Response.json({ error: "Projections calculées mais non sauvegardées : " + upsertError.message }, { status: 500 });
    }

    return Response.json({ projections: result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
