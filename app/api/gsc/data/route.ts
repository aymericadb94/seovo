import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("gsc_site_url, google_access_token")
      .eq("user_id", user.id)
      .single();

    if (!site?.gsc_site_url) return Response.json({ error: "GSC non configuré" }, { status: 404 });

    const token = await getValidAccessToken(user.id);
    if (!token) return Response.json({ error: "Google non connecté" }, { status: 403 });

    const siteUrl = encodeURIComponent(site.gsc_site_url);
    const endDate = daysAgo(2); // GSC has ~2 day delay
    const startDate = daysAgo(30);

    // Global metrics — parallel requests
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const apiBase = `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`;

    const [globalRes, pagesRes, queriesRes] = await Promise.all([
      fetch(apiBase, {
        method: "POST", headers,
        body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 30 }),
      }),
      fetch(apiBase, {
        method: "POST", headers,
        body: JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit: 50 }),
      }),
      fetch(apiBase, {
        method: "POST", headers,
        body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 100 }),
      }),
    ]);

    type GSCRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
    type GSCResponse = { rows?: GSCRow[] };

    if (!globalRes.ok) {
      const errBody = await globalRes.json().catch(() => ({})) as { error?: { message?: string } };
      return Response.json({ error: errBody?.error?.message ?? "Erreur Google Search Console" }, { status: 502 });
    }

    const globalData = await globalRes.json() as GSCResponse;
    const pagesData = pagesRes.ok ? await pagesRes.json() as GSCResponse : { rows: [] };
    const queriesData = queriesRes.ok ? await queriesRes.json() as GSCResponse : { rows: [] };

    const rows = globalData.rows ?? [];
    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const avgCtr = rows.length > 0 ? rows.reduce((s, r) => s + r.ctr, 0) / rows.length : 0;
    const avgPosition = rows.length > 0 ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0;

    const dailyChart = rows.map(r => ({
      date: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
    }));

    const pages = (pagesData.rows ?? []).map(r => ({
      url: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }));

    const queries = (queriesData.rows ?? []).map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }));

    return Response.json({ totalClicks, totalImpressions, avgCtr, avgPosition, dailyChart, pages, queries });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
