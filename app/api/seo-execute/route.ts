/**
 * SEO Executor API
 *
 * GET  — List planned SEO actions (what would be done)
 * POST — Execute SEO actions (auto actions only, validated actions need explicit approval)
 */

import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { fetchGscData } from "@/lib/seo-events";
import { planSeoActions, executeSeoActions } from "@/lib/seo-executor";
import type { CmsCredentials } from "@/lib/cms-update";
import type { GSCQuery } from "@/lib/seo-projections";

export const maxDuration = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSiteAndCreds(supabase: any, userId: string) {
  const { data: site } = await supabase
    .from("sites")
    .select("id, cms, site_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id, custom_api_url, custom_api_key, gsc_site_url, keywords, seo_context")
    .eq("user_id", userId)
    .maybeSingle();

  if (!site) return null;

  const creds: CmsCredentials = {
    cms: site.cms,
    site_url: site.site_url,
    wp_username: site.wp_username,
    wp_app_password: site.wp_app_password,
    shopify_api_key: site.shopify_api_key,
    wix_api_key: site.wix_api_key,
    wix_site_id: site.wix_site_id,
    custom_api_url: site.custom_api_url,
    custom_api_key: site.custom_api_key,
  };

  return { site, creds };
}

// GET — Plan and return actions without executing
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const result = await getSiteAndCreds(supabase, user.id);
    if (!result) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const { site, creds } = result;

    // Fetch GSC data
    let gscQueries: GSCQuery[] = [];
    if (site.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const gsc = await fetchGscData(token, site.gsc_site_url, 30);
          gscQueries = gsc.queries;
        }
      } catch { /* non-fatal */ }
    }

    const actions = await planSeoActions(supabase, user.id, creds, gscQueries);

    return Response.json({
      actions,
      summary: {
        total: actions.length,
        automatic: actions.filter(a => a.level === "automatic").length,
        validated: actions.filter(a => a.level === "validated").length,
        suggested: actions.filter(a => a.level === "suggested").length,
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

// POST — Execute automatic actions
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const result = await getSiteAndCreds(supabase, user.id);
    if (!result) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const { site, creds } = result;

    // Fetch GSC data
    let gscQueries: GSCQuery[] = [];
    if (site.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const gsc = await fetchGscData(token, site.gsc_site_url, 30);
          gscQueries = gsc.queries;
        }
      } catch { /* non-fatal */ }
    }

    // Plan actions
    const actions = await planSeoActions(supabase, user.id, creds, gscQueries);

    // Execute automatic ones
    const results = await executeSeoActions(supabase, user.id, creds, actions, gscQueries);

    return Response.json({
      executed: results.filter(r => r.executed).length,
      failed: results.filter(r => !r.executed && r.error).length,
      pending_validation: actions.filter(a => a.level === "validated").length,
      results,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
