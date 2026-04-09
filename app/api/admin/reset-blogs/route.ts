/**
 * Admin: Reset Rankpill blogs for a specific user
 *
 * GET  — dry-run: lists what WOULD be deleted (safe)
 * POST — actually deletes (requires confirm=true)
 *
 * Only deletes articles tracked in the publications table (= created by Rankpill).
 * Pre-existing CMS content is NOT touched.
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, type CmsCredentials } from "@/lib/cms-update";

export const maxDuration = 120;

// Target user email for safety
const ALLOWED_RESET_EMAIL = "pawpickvintage@gmail.com";

function wixHeaders(apiKey: string, siteId: string) {
  return { "Content-Type": "application/json", Authorization: apiKey, "wix-site-id": siteId };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Fetch publications (= articles created by Rankpill)
    const { data: pubs } = await supabase
      .from("publications")
      .select("id, title, keyword, wordpress_url, published_at")
      .eq("user_id", user.id);

    // Fetch site info
    const { data: site } = await supabase
      .from("sites")
      .select("cms, site_url, wix_api_key, wix_site_id, wp_username, wp_app_password, shopify_api_key, shopify_store_url")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch CMS posts to match IDs
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
    };

    const cmsPosts = await listCmsPosts(creds, 300);

    // Match publications with CMS posts
    const toDelete: { cms_id: string | number; title: string; url: string; pub_id: string }[] = [];
    const unmatched: { title: string; url: string; pub_id: string }[] = [];

    for (const pub of pubs ?? []) {
      // Skip __page__ entries (static pages, not Rankpill articles)
      if (pub.keyword === "__page__") continue;

      const normUrl = pub.wordpress_url?.replace(/\/$/, "").toLowerCase();
      const normTitle = pub.title?.toLowerCase();

      const match = cmsPosts.find(p => {
        const cmsUrl = p.url.replace(/\/$/, "").toLowerCase();
        const cmsTitle = p.title.toLowerCase();
        return cmsUrl === normUrl || cmsTitle === normTitle;
      });

      if (match) {
        toDelete.push({ cms_id: match.id, title: pub.title, url: pub.wordpress_url, pub_id: pub.id });
      } else {
        unmatched.push({ title: pub.title, url: pub.wordpress_url, pub_id: pub.id });
      }
    }

    return Response.json({
      mode: "DRY RUN — rien ne sera supprimé",
      cms: site.cms,
      total_publications: (pubs ?? []).length,
      will_delete_from_cms: toDelete.length,
      will_delete_from_db: toDelete.length + unmatched.length,
      articles_to_delete: toDelete.map(d => ({ title: d.title, url: d.url, cms_id: d.cms_id })),
      unmatched_db_only: unmatched.map(u => ({ title: u.title, url: u.url })),
      total_cms_posts: cmsPosts.length,
      cms_posts_kept: cmsPosts.length - toDelete.length,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { confirm } = await request.json() as { confirm?: boolean };
    if (!confirm) {
      return Response.json({ error: "Envoyez { confirm: true } pour confirmer la suppression" }, { status: 400 });
    }

    // Check user email for safety
    if (user.email !== ALLOWED_RESET_EMAIL) {
      return Response.json({ error: `Reset non autorisé pour ${user.email}. Seul ${ALLOWED_RESET_EMAIL} est autorisé.` }, { status: 403 });
    }

    const { data: site } = await supabase
      .from("sites")
      .select("cms, site_url, wix_api_key, wix_site_id, wp_username, wp_app_password, shopify_api_key, shopify_store_url")
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
    };

    // Fetch publications (only real articles, not __page__)
    const { data: pubs } = await supabase
      .from("publications")
      .select("id, title, keyword, wordpress_url")
      .eq("user_id", user.id);

    const cmsPosts = await listCmsPosts(creds, 300);

    const results: { title: string; cms_deleted: boolean; db_deleted: boolean; error?: string }[] = [];

    for (const pub of pubs ?? []) {
      if (pub.keyword === "__page__") continue;

      const normUrl = pub.wordpress_url?.replace(/\/$/, "").toLowerCase();
      const normTitle = pub.title?.toLowerCase();
      const match = cmsPosts.find(p => {
        return p.url.replace(/\/$/, "").toLowerCase() === normUrl || p.title.toLowerCase() === normTitle;
      });

      let cmsDeleted = false;

      if (match) {
        // Delete from CMS
        try {
          if (site.cms === "wix" && site.wix_api_key && site.wix_site_id) {
            const res = await fetch(`https://www.wixapis.com/blog/v3/posts/${match.id}`, {
              method: "DELETE",
              headers: wixHeaders(site.wix_api_key, site.wix_site_id),
            });
            cmsDeleted = res.ok;
            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              results.push({ title: pub.title, cms_deleted: false, db_deleted: false, error: `CMS delete ${res.status}: ${errText.slice(0, 100)}` });
              continue;
            }
          }
          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 300));
        } catch (err) {
          results.push({ title: pub.title, cms_deleted: false, db_deleted: false, error: err instanceof Error ? err.message : "Unknown" });
          continue;
        }
      }

      // Delete from DB
      await supabase.from("publications").delete().eq("id", pub.id);
      results.push({ title: pub.title, cms_deleted: cmsDeleted || !match, db_deleted: true });
    }

    // Also clean related data
    await supabase.from("internal_linking").delete().eq("user_id", user.id);
    await supabase.from("content_snapshots").delete().eq("user_id", user.id);

    return Response.json({
      mode: "EXECUTED",
      total_processed: results.length,
      cms_deleted: results.filter(r => r.cms_deleted).length,
      db_deleted: results.filter(r => r.db_deleted).length,
      errors: results.filter(r => r.error),
      details: results,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
