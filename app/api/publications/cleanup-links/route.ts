/**
 * Cleanup Broken Internal Links API
 *
 * Source of truth: ONLY the CMS (live posts from Wix/WP/Shopify API).
 * NOT the publications DB table (which can contain stale/wrong URLs).
 *
 * For Wix: works directly on richContent/DraftJS (not HTML conversion).
 * For WP/Shopify: works on HTML content.
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, updateCmsPost, wixRemoveBrokenLinks, type CmsCredentials } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 180;

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

    // SOURCE DE VÉRITÉ : UNIQUEMENT les URLs/slugs des posts CMS réels
    const liveUrls = new Set<string>();
    const liveSlugs = new Set<string>();
    for (const p of allPosts) {
      if (p.url) {
        liveUrls.add(p.url.replace(/\/$/, "").toLowerCase());
        const slug = extractSlug(p.url);
        if (slug && slug.length > 3) liveSlugs.add(slug);
      }
    }

    logger.info(`[cleanup-links] Live CMS: ${allPosts.length} posts, ${liveUrls.size} URLs, ${liveSlugs.size} slugs`);
    logger.info(`[cleanup-links] Live URLs: ${[...liveUrls].join(" | ")}`);
    logger.info(`[cleanup-links] Live slugs: ${[...liveSlugs].join(", ")}`);

    // Function to check if an internal link URL is broken
    function isBrokenInternalLink(href: string): boolean {
      if (!href.startsWith("http")) return false;
      let linkHost: string;
      try {
        linkHost = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        return false;
      }
      // Only check internal links
      if (linkHost !== siteHost) return false;

      // Check 1: exact URL match
      const normalized = href.replace(/\/$/, "").toLowerCase();
      if (liveUrls.has(normalized)) return false;

      // Check 2: slug match
      const slug = extractSlug(href);
      if (slug && slug.length > 3 && liveSlugs.has(slug)) return false;

      // No match → broken
      logger.info(`[cleanup-links] BROKEN: ${href} (slug: "${slug}")`);
      return true;
    }

    const details: { title: string; removed: number; broken_urls: string[] }[] = [];
    let totalCleaned = 0;
    let totalLinksFound = 0;

    // ── WIX: use native richContent/DraftJS approach ──
    if (site.cms === "wix" && site.wix_api_key && site.wix_site_id) {
      for (const post of allPosts) {
        // Count internal links in converted HTML for reporting
        const linkRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>/gi;
        let match;
        while ((match = linkRegex.exec(post.content)) !== null) {
          const href = match[1];
          if (!href.startsWith("http")) continue;
          try {
            const host = new URL(href).hostname.replace(/^www\./, "");
            if (host === siteHost) totalLinksFound++;
          } catch { /* skip */ }
        }

        const result = await wixRemoveBrokenLinks(
          site.wix_api_key,
          site.wix_site_id,
          post.id as string,
          isBrokenInternalLink,
          { supabase, userId: user.id }
        );

        if (result.removed > 0) {
          details.push({ title: post.title, removed: result.removed, broken_urls: result.brokenUrls });
          totalCleaned += result.removed;
        } else if (result.error) {
          logger.warn(`[cleanup-links] "${post.title}": ${result.error}`);
        }
      }

      logger.info(`[cleanup-links] Done (Wix native): ${totalLinksFound} internal links, ${totalCleaned} broken removed`);

      return Response.json({
        cleaned: totalCleaned,
        scanned: allPosts.length,
        links_found: totalLinksFound,
        details,
      });
    }

    // ── WP / Shopify: HTML regex approach ──
    for (const post of allPosts) {
      let removedCount = 0;
      const brokenUrls: string[] = [];

      const cleanedHtml = post.content.replace(
        /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
        (fullMatch, href: string, innerText: string) => {
          if (isBrokenInternalLink(href)) {
            removedCount++;
            brokenUrls.push(href);
            return innerText;
          }
          if (href.startsWith("http")) {
            try {
              const host = new URL(href).hostname.replace(/^www\./, "");
              if (host === siteHost) totalLinksFound++;
            } catch { /* skip */ }
          }
          return fullMatch;
        }
      );
      // Count broken links as found too
      totalLinksFound += removedCount;

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
      } else {
        logger.warn(`[cleanup-links] "${post.title}": update failed — ${updateRes.error}`);
      }
    }

    logger.info(`[cleanup-links] Done: ${totalLinksFound} internal links, ${totalCleaned} broken removed`);

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
