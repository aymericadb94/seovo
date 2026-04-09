/**
 * GSC (Google Search Console) utilities — shared across pipeline & keyword suggest
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GscSiteData = {
  google_access_token: string;
  google_refresh_token?: string;
  google_token_expiry?: number;
  gsc_site_url: string;
};

/**
 * Get a valid GSC access token, refreshing if expired.
 * Works in both request context and cron context (no cookies needed).
 */
export async function getValidGscToken(
  supabase: SupabaseClient,
  userId: string,
  site: { google_access_token: string; google_refresh_token?: string; google_token_expiry?: number },
): Promise<string | null> {
  // Token still valid (60s margin)
  if (site.google_token_expiry && Date.now() < site.google_token_expiry - 60000) {
    return site.google_access_token;
  }
  // Refresh
  if (!site.google_refresh_token) return site.google_access_token;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: site.google_refresh_token,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await res.json() as { access_token?: string; expires_in?: number };
    if (!tokens.access_token) return site.google_access_token;
    await supabase.from("sites").update({
      google_access_token: tokens.access_token,
      google_token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    }).eq("user_id", userId);
    return tokens.access_token;
  } catch {
    return site.google_access_token;
  }
}

/**
 * Fetch GSC query data for a site.
 */
export async function fetchGscQueries(
  token: string,
  siteUrl: string,
  options?: { days?: number; rowLimit?: number },
): Promise<{ query: string; clicks: number; impressions: number; ctr: number; position: number }[]> {
  const days = options?.days ?? 30;
  const rowLimit = options?.rowLimit ?? 100;

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  try {
    const encoded = encodeURIComponent(siteUrl);
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query"],
          rowLimit,
        }),
      },
    );
    if (!res.ok) return [];
    const data = await res.json() as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
    return (data.rows ?? []).map(r => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: Math.round(r.ctr * 1000) / 10,
      position: Math.round(r.position * 10) / 10,
    }));
  } catch {
    return [];
  }
}
