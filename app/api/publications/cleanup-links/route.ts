/**
 * Cleanup Broken Internal Links API
 *
 * Scans all CMS posts, identifies internal links pointing to non-existent pages,
 * and removes them (keeping the anchor text, just unwrapping the <a> tag).
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, updateCmsPost, type CmsCredentials } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 180;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "cleanup-links", maxRequests: 3, windowSeconds: 3600 });
    if (limited) return limited;

    const { data: site } = await supabase
      .from("sites")
      .select("id, site_url, cms, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const creds: CmsCredentials = {
      cms: site.cms, site_url: site.site_url,
      wp_username: site.wp_username, wp_app_password: site.wp_app_password,
      shopify_api_key: site.shopify_api_key, shopify_store_url: site.shopify_store_url,
      wix_api_key: site.wix_api_key, wix_site_id: site.wix_site_id,
      custom_api_url: site.custom_api_url, custom_api_key: site.custom_api_key,
    };

    // Fetch all CMS posts
    const allPosts = await listCmsPosts(creds, 200);
    if (allPosts.length === 0) {
      return Response.json({ cleaned: 0, scanned: 0, details: [] });
    }

    // Build set of real URLs from CMS
    const realUrls = new Set(
      allPosts.map(p => p.url.replace(/\/$/, "").toLowerCase()).filter(Boolean)
    );

    // Also add the site root
    const siteHost = new URL(site.site_url).hostname;
    realUrls.add(site.site_url.replace(/\/$/, "").toLowerCase());

    const details: { title: string; removed: number }[] = [];
    let totalCleaned = 0;

    for (const post of allPosts) {
      // Find all internal <a href="..."> in content
      const linkRegex = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let modified = false;
      let removedCount = 0;

      const cleanedHtml = post.content.replace(linkRegex, (match, href: string, text: string) => {
        try {
          const linkHost = new URL(href).hostname;
          // Only check internal links (same domain)
          if (linkHost !== siteHost) return match;

          const normalized = href.replace(/\/$/, "").toLowerCase();
          if (realUrls.has(normalized)) return match; // URL exists, keep it

          // Broken internal link — unwrap (keep text, remove <a>)
          modified = true;
          removedCount++;
          return text;
        } catch {
          return match; // invalid URL format, leave as-is
        }
      });

      if (modified && removedCount > 0) {
        const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
        const updateRes = await updateCmsPost(
          creds, post.id,
          { content: cleanedHtml },
          { blog_id: blogId, supabase, userId: user.id, actionType: "cleanup_broken_links" }
        );

        if (updateRes.success) {
          details.push({ title: post.title, removed: removedCount });
          totalCleaned += removedCount;
          logger.info(`[cleanup-links] "${post.title}": ${removedCount} broken link(s) removed`);
        } else {
          logger.warn(`[cleanup-links] "${post.title}": update failed — ${updateRes.error}`);
        }
      }
    }

    return Response.json({
      cleaned: totalCleaned,
      scanned: allPosts.length,
      details,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
