/**
 * Cleanup Broken Internal Links API
 *
 * Scans all CMS posts, finds internal links, checks them against
 * the known CMS post URLs (by slug matching), and removes broken ones.
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

    const siteHost = new URL(site.site_url).hostname;

    // Build sets of known-good identifiers (exact URLs + slugs)
    const knownUrls = new Set<string>();
    const knownSlugs = new Set<string>();
    for (const p of allPosts) {
      if (p.url) {
        knownUrls.add(p.url.replace(/\/$/, "").toLowerCase());
        const slug = extractSlug(p.url);
        if (slug) knownSlugs.add(slug);
      }
    }

    // Also add publications from DB (may have different URL format)
    const { data: pubs } = await supabase
      .from("publications")
      .select("wordpress_url")
      .eq("user_id", user.id);
    for (const p of pubs ?? []) {
      if (p.wordpress_url) {
        knownUrls.add(p.wordpress_url.replace(/\/$/, "").toLowerCase());
        const slug = extractSlug(p.wordpress_url);
        if (slug) knownSlugs.add(slug);
      }
    }

    logger.info(`[cleanup-links] Known URLs: ${knownUrls.size}, Known slugs: ${knownSlugs.size}, Site host: ${siteHost}`);

    const details: { title: string; removed: number; broken_urls: string[] }[] = [];
    let totalCleaned = 0;
    let totalLinksFound = 0;

    for (const post of allPosts) {
      // Find all <a href="..."> in content
      const linkRegex = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const internalLinks: { href: string; fullMatch: string; text: string }[] = [];

      let m;
      while ((m = linkRegex.exec(post.content)) !== null) {
        try {
          const linkHost = new URL(m[1]).hostname;
          // Internal link = same domain (support both www and non-www)
          const siteBase = siteHost.replace(/^www\./, "");
          const linkBase = linkHost.replace(/^www\./, "");
          if (linkBase === siteBase || linkHost === siteHost) {
            internalLinks.push({ href: m[1], fullMatch: m[0], text: m[2] });
          }
        } catch { /* skip invalid URLs */ }
      }

      totalLinksFound += internalLinks.length;
      if (internalLinks.length === 0) continue;

      // Check each link: is it in known URLs or does its slug match?
      const brokenLinks: typeof internalLinks = [];
      for (const link of internalLinks) {
        const normalized = link.href.replace(/\/$/, "").toLowerCase();
        if (knownUrls.has(normalized)) continue; // exact match — alive

        const slug = extractSlug(link.href);
        if (slug && knownSlugs.has(slug)) continue; // slug match — alive

        // No match found — this link is broken
        brokenLinks.push(link);
      }

      if (brokenLinks.length === 0) continue;

      // Remove broken links from content (keep text, unwrap <a>)
      let cleanedHtml = post.content;
      for (const link of brokenLinks) {
        cleanedHtml = cleanedHtml.replace(link.fullMatch, link.text);
      }

      const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
      const updateRes = await updateCmsPost(
        creds, post.id,
        { content: cleanedHtml },
        { blog_id: blogId, supabase, userId: user.id, actionType: "cleanup_broken_links" }
      );

      if (updateRes.success) {
        details.push({
          title: post.title,
          removed: brokenLinks.length,
          broken_urls: brokenLinks.map(l => l.href),
        });
        totalCleaned += brokenLinks.length;
        logger.info(`[cleanup-links] "${post.title}": ${brokenLinks.length} broken link(s) removed — ${brokenLinks.map(l => l.href).join(", ")}`);
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
