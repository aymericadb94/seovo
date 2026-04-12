/**
 * Cleanup Broken Internal Links API
 *
 * Scans all CMS posts, identifies internal links pointing to non-existent pages
 * by actually checking if the URL responds (HEAD request), and removes broken ones
 * (keeping the anchor text, just unwrapping the <a> tag).
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, updateCmsPost, type CmsCredentials } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const maxDuration = 180;

/** Check if a URL is reachable (non-404). Cached per run. */
async function isUrlAlive(url: string, cache: Map<string, boolean>): Promise<boolean> {
  const key = url.replace(/\/$/, "").toLowerCase();
  if (cache.has(key)) return cache.get(key)!;

  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "RankPill-LinkChecker/1.0" },
    });
    // 2xx/3xx = alive, 404/410 = dead, 5xx = assume alive (server error, not missing)
    const alive = res.status < 400 || res.status >= 500;
    cache.set(key, alive);
    return alive;
  } catch {
    // Network error / timeout → assume alive (don't remove links on network issues)
    cache.set(key, true);
    return true;
  }
}

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

    const allPosts = await listCmsPosts(creds, 200);
    if (allPosts.length === 0) {
      return Response.json({ cleaned: 0, scanned: 0, details: [] });
    }

    const siteHost = new URL(site.site_url).hostname;
    const urlCache = new Map<string, boolean>();

    // Pre-populate cache: all CMS post URLs are known-alive
    for (const p of allPosts) {
      if (p.url) urlCache.set(p.url.replace(/\/$/, "").toLowerCase(), true);
    }

    const details: { title: string; removed: number; broken_urls: string[] }[] = [];
    let totalCleaned = 0;

    for (const post of allPosts) {
      // Collect all internal links first
      const linkRegex = /<a\s+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      const internalLinks: { href: string; fullMatch: string; text: string }[] = [];

      let m;
      while ((m = linkRegex.exec(post.content)) !== null) {
        try {
          const linkHost = new URL(m[1]).hostname;
          if (linkHost === siteHost) {
            internalLinks.push({ href: m[1], fullMatch: m[0], text: m[2] });
          }
        } catch { /* skip invalid URLs */ }
      }

      if (internalLinks.length === 0) continue;

      // Check each internal link
      const brokenLinks: typeof internalLinks = [];
      for (const link of internalLinks) {
        const alive = await isUrlAlive(link.href, urlCache);
        if (!alive) brokenLinks.push(link);
      }

      if (brokenLinks.length === 0) continue;

      // Remove broken links from content
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

    return Response.json({
      cleaned: totalCleaned,
      scanned: allPosts.length,
      details,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
