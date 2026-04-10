/**
 * List ALL site pages — scans CMS directly as source of truth.
 *
 * Merges CMS data with publications table for keyword/metadata.
 * Also auto-syncs any missing pages to the publications table.
 */

import { createClient } from "@/lib/supabase/server";
import { listAllCmsContent, type CmsCredentials } from "@/lib/cms-update";

export const maxDuration = 60;

export async function GET() {
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

    // 1. Fetch ALL CMS content directly (source of truth)
    const cmsContent = await listAllCmsContent(creds, 300);

    // 2. Fetch existing publications for metadata enrichment
    const { data: publications } = await supabase
      .from("publications")
      .select("id, title, keyword, wordpress_url, published_at, cover_image_url")
      .eq("user_id", user.id);

    const pubsByUrl = new Map<string, { id: string; keyword: string; published_at: string; cover_image_url: string | null }>();
    const pubsByTitle = new Map<string, { id: string; keyword: string; published_at: string; cover_image_url: string | null }>();
    for (const pub of publications ?? []) {
      if (pub.wordpress_url) {
        pubsByUrl.set(pub.wordpress_url.replace(/\/$/, "").toLowerCase(), {
          id: pub.id,
          keyword: pub.keyword,
          published_at: pub.published_at,
          cover_image_url: pub.cover_image_url ?? null,
        });
      }
      if (pub.title) {
        pubsByTitle.set(pub.title.toLowerCase(), {
          id: pub.id,
          keyword: pub.keyword,
          published_at: pub.published_at,
          cover_image_url: pub.cover_image_url ?? null,
        });
      }
    }

    // 3. Merge CMS data with publications metadata
    const pages = cmsContent.map((item, i) => {
      const normUrl = item.url.replace(/\/$/, "").toLowerCase();
      const normTitle = item.title.toLowerCase();
      const match = pubsByUrl.get(normUrl) ?? pubsByTitle.get(normTitle);
      // Image priority: CMS featured image > DB stored image > null
      const cover_image = item.featured_image ?? match?.cover_image_url ?? null;
      // Date priority: CMS real date > DB stored date > now
      const published_at = item.published_at ?? match?.published_at ?? new Date().toISOString();
      return {
        id: match?.id ?? `cms-${i}`,
        title: item.title,
        url: item.url,
        keyword: (match?.keyword && match.keyword !== "__page__") ? match.keyword : "",
        published_at,
        page_type: item.page_type ?? "article",
        cover_image,
        in_db: !!match,
      };
    });

    // 4. Auto-sync missing pages to DB (silent)
    const toSync = cmsContent.filter(item => {
      const normUrl = item.url.replace(/\/$/, "").toLowerCase();
      const normTitle = item.title.toLowerCase();
      return !pubsByUrl.has(normUrl) && !pubsByTitle.has(normTitle);
    });

    if (toSync.length > 0) {
      const rows = toSync.map(p => ({
        site_id: site.id,
        user_id: user.id,
        title: p.title,
        keyword: p.page_type === "page" ? "__page__" : "",
        wordpress_url: p.url,
        published_at: p.published_at ?? new Date().toISOString(),
      }));
      try { await supabase.from("publications").insert(rows); } catch { /* silent */ }
    }

    return Response.json({
      pages,
      total: pages.length,
      articles: pages.filter(p => p.page_type === "article").length,
      static_pages: pages.filter(p => p.page_type === "page").length,
      synced: toSync.length,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
