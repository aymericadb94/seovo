/**
 * Sync Publications API
 *
 * Scans CMS for published articles and syncs them to the publications table.
 * Articles already in the DB (matched by URL) are skipped.
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, type CmsCredentials } from "@/lib/cms-update";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("id, site_url, cms, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

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

    // Fetch all CMS posts
    const cmsPosts = await listCmsPosts(creds, 200);

    // Fetch existing publications
    const { data: existing } = await supabase
      .from("publications")
      .select("wordpress_url, title")
      .eq("user_id", user.id);

    const existingUrls = new Set((existing ?? []).map(p => p.wordpress_url?.replace(/\/$/, "").toLowerCase()));
    const existingTitles = new Set((existing ?? []).map(p => p.title?.toLowerCase()));

    // Find missing publications
    const toSync = cmsPosts.filter(p => {
      const normUrl = p.url.replace(/\/$/, "").toLowerCase();
      const normTitle = p.title.toLowerCase();
      return !existingUrls.has(normUrl) && !existingTitles.has(normTitle);
    });

    if (toSync.length === 0) {
      return Response.json({ synced: 0, message: "Tous les articles sont déjà synchronisés" });
    }

    // Insert missing publications
    const rows = toSync.map(p => ({
      site_id: site.id,
      user_id: user.id,
      title: p.title,
      keyword: "",
      wordpress_url: p.url,
      published_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase.from("publications").insert(rows);
    if (insertError) {
      return Response.json({ error: `Erreur d'insertion: ${insertError.message}` }, { status: 500 });
    }

    return Response.json({ synced: toSync.length, articles: toSync.map(p => p.title) });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
