/**
 * Daily SEO Recalculation Cron
 *
 * Pipeline:
 * 1. Fetch fresh GSC data
 * 2. Save snapshot
 * 3. Detect events (compare with previous snapshot)
 * 4. Measure feedback on past actions
 * 5. Run recalculation engine (light/intermediate/full)
 * 6. Execute automatic SEO actions (maillage interne)
 * 7. Return summary
 */

import { createClient } from "@supabase/supabase-js";
import { getValidAccessToken } from "@/lib/google";
import {
  fetchGscData,
  saveGscSnapshot,
  detectGscEvents,
  emitEvents,
} from "@/lib/seo-events";
import { planSeoActions, executeSeoActions } from "@/lib/seo-executor";
import type { CmsCredentials } from "@/lib/cms-update";
import { runRecalc } from "@/lib/seo-recalc";
import { measureFeedback, calibrateProjectionModel } from "@/lib/seo-feedback";
import type { GSCQuery } from "@/lib/seo-projections";
import type { RecalcLevel } from "@/lib/seo-stability";

export const maxDuration = 120;

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  // Auth: cron secret or manual trigger
  const authHeader = request.headers.get("authorization");
  const url = new URL(request.url);
  const forceLevel = url.searchParams.get("level") as RecalcLevel | null;
  const targetUserId = url.searchParams.get("userId");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: Record<string, unknown>[] = [];

  // Get all sites with SEO analysis done (or a specific user)
  let query = supabase
    .from("sites")
    .select("user_id, gsc_site_url, google_access_token, seo_analysis_done, cms, site_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
    .eq("seo_analysis_done", true);

  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }

  const { data: sites } = await query;

  if (!sites || sites.length === 0) {
    return Response.json({ message: "No sites to process", results: [] });
  }

  for (const site of sites) {
    const userId = site.user_id as string;
    const gscSiteUrl = site.gsc_site_url as string | null;

    try {
      let gscQueries: GSCQuery[] = [];
      let gscPages: { url: string; clicks: number; impressions: number; ctr: number; position: number }[] = [];

      // 1. Fetch GSC data if available
      if (gscSiteUrl && site.google_access_token) {
        try {
          const token = await getValidAccessToken(userId);
          if (token) {
            const gscData = await fetchGscData(token, gscSiteUrl, 30);
            gscQueries = gscData.queries.map(q => ({
              query: q.query,
              clicks: q.clicks,
              impressions: q.impressions,
              ctr: q.ctr,
              position: q.position,
            }));
            gscPages = gscData.pages;

            // 2. Save snapshot
            await saveGscSnapshot(supabase, userId, gscData.queries, gscData.pages);

            // 3. Detect events
            const events = await detectGscEvents(supabase, userId, gscData.queries, gscData.pages);
            if (events.length > 0) {
              await emitEvents(supabase, userId, events);
            }
          }
        } catch (err) {
          console.error(`[cron/recalc] GSC fetch failed for ${userId}:`, err);
          // Continue without GSC data — recalc still works with cached projections
        }
      }

      // 4. Measure feedback on past actions
      let feedbackResult = { measured: 0, outcomes: {} as Record<string, number> };
      try {
        feedbackResult = await measureFeedback(supabase, userId, gscQueries);
      } catch (err) {
        console.error(`[cron/recalc] feedback measurement failed for ${userId}:`, err);
      }

      // 5. Calibrate model (monthly, non-blocking)
      let calibration: { adjustment: number; reason: string } | null = null;
      try {
        calibration = await calibrateProjectionModel(supabase, userId);
      } catch {
        // Non-fatal
      }

      // 6. Run recalculation
      const recalcResult = await runRecalc(
        supabase,
        userId,
        gscQueries,
        forceLevel ?? undefined
      );

      // 7. Execute automatic SEO actions (maillage interne)
      let seoExecResult: Record<string, unknown> = {};
      try {
        const creds: CmsCredentials = {
          cms: (site as Record<string, unknown>).cms as CmsCredentials["cms"],
          site_url: (site as Record<string, unknown>).site_url as string,
          wp_username: (site as Record<string, unknown>).wp_username as string | undefined,
          wp_app_password: (site as Record<string, unknown>).wp_app_password as string | undefined,
          shopify_api_key: (site as Record<string, unknown>).shopify_api_key as string | undefined,
          wix_api_key: (site as Record<string, unknown>).wix_api_key as string | undefined,
          wix_site_id: (site as Record<string, unknown>).wix_site_id as string | undefined,
          custom_api_url: (site as Record<string, unknown>).custom_api_url as string | undefined,
          custom_api_key: (site as Record<string, unknown>).custom_api_key as string | undefined,
        };
        const actions = await planSeoActions(supabase, userId, creds, gscQueries);
        if (actions.length > 0) {
          const execResults = await executeSeoActions(supabase, userId, creds, actions, gscQueries);
          seoExecResult = {
            planned: actions.length,
            executed: execResults.filter(r => r.executed).length,
            failed: execResults.filter(r => !r.executed && r.error).length,
            pending: actions.filter(a => a.level !== "automatic").length,
          };
        }
      } catch (err) {
        console.error(`[cron/recalc] SEO executor failed for ${userId}:`, err);
        seoExecResult = { error: err instanceof Error ? err.message : "Unknown" };
      }

      results.push({
        user_id: userId,
        has_gsc: !!gscSiteUrl,
        gsc_queries: gscQueries.length,
        gsc_pages: gscPages.length,
        recalc: recalcResult,
        feedback: feedbackResult,
        calibration,
        seo_executor: seoExecResult,
      });
    } catch (err) {
      console.error(`[cron/recalc] failed for ${userId}:`, err);
      results.push({
        user_id: userId,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return Response.json({
    processed: results.length,
    timestamp: new Date().toISOString(),
    results,
  });
}
