/**
 * Cleanup Broken Internal Links API
 *
 * Scans all CMS posts, finds internal links, checks them against
 * the known CMS post slugs, and removes broken ones.
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, updateCmsPost, type CmsCredentials } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 180;

/** Extract the last meaningful path segment (slug) from a URL */
function extractSlug(urlStr: string): string {
  try {
    const path = new URL(urlStr).pathname.replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1]?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "cleanup-links", maxRequests: 5, windowSeconds: 3600 });
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

    const allPosts = await listCmsPosts(creds, 200);
    if (allPosts.length === 0) {
      return Response.json({ cleaned: 0, scanned: 0, details: [] });
    }

    const siteHost = new URL(site.site_url).hostname.replace(/^www\./, "");

    // Build sets of known-good identifiers (exact URLs + slugs)
    const knownUrls = new Set<string>();
    const knownSlugs = new Set<string>();
    for (const p of allPosts) {
      if (p.url) {
        knownUrls.add(p.url.replace(/\/$/, "").toLowerCase());
        const slug = extractSlug(p.url);
        if (slug && slug.length > 3) knownSlugs.add(slug);
      }
    }

    // Also add publications from DB
    const { data: pubs } = await supabase
      .from("publications")
      .select("wordpress_url")
      .eq("user_id", user.id);
    for (const p of pubs ?? []) {
      if (p.wordpress_url) {
        knownUrls.add(p.wordpress_url.replace(/\/$/, "").toLowerCase());
        const slug = extractSlug(p.wordpress_url);
        if (slug && slug.length > 3) knownSlugs.add(slug);
      }
    }

    logger.info(`[cleanup-links] Known slugs (${knownSlugs.size}): ${[...knownSlugs].join(", ")}`);

    const details: { title: string; removed: number; broken_urls: string[] }[] = [];
    let totalCleaned = 0;
    let totalLinksFound = 0;

    for (const post of allPosts) {
      // Use replace to find AND fix in one pass
      let removedCount = 0;
      const brokenUrls: string[] = [];

      const cleanedHtml = post.content.replace(
        /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
        (fullMatch, href: string, innerText: string) => {
          // Only process http(s) links
          if (!href.startsWith("http")) return fullMatch;

          let linkBase: string;
          try {
            linkBase = new URL(href).hostname.replace(/^www\./, "");
          } catch {
            return fullMatch;
          }

          // Skip external links
          if (linkBase !== siteHost) return fullMatch;

          totalLinksFound++;

          // Check: exact URL match
          const normalized = href.replace(/\/$/, "").toLowerCase();
          if (knownUrls.has(normalized)) return fullMatch;

          // Check: slug match
          const slug = extractSlug(href);
          if (slug && slug.length > 3 && knownSlugs.has(slug)) return fullMatch;

          // Broken — unwrap link, keep text
          removedCount++;
          brokenUrls.push(href);
          return innerText;
        }
      );

      if (removedCount === 0) continue;

      const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
      const updateRes = await updateCmsPost(
        creds, post.id,
        { content: cleanedHtml },
        { blog_id: blogId, supabase, userId: user.id, actionType: "cleanup_broken_links" }
      );

      if (updateRes.success) {
        details.push({ title: post.title, removed: removedCount, broken_urls: brokenUrls });
        totalCleaned += removedCount;
        logger.info(`[cleanup-links] "${post.title}": ${removedCount} broken link(s) removed — ${brokenUrls.join(", ")}`);
      } else {
        logger.warn(`[cleanup-links] "${post.title}": update failed — ${updateRes.error}`);
      }
    }

    logger.info(`[cleanup-links] Done: ${totalLinksFound} internal links found, ${totalCleaned} broken removed across ${allPosts.length} posts`);

    return Response.json({
      cleaned: totalCleaned,
      scanned: allPosts.length,
      links_found: totalLinksFound,
      details,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
