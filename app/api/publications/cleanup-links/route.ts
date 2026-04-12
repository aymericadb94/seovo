/**
 * Cleanup Broken Internal Links API
 *
 * Source of truth: ONLY the CMS (live posts from Wix/WP/Shopify API).
 * NOT the publications DB table (which can contain stale/wrong URLs).
 *
 * A link is broken if its slug doesn't match any live CMS post slug.
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, updateCmsPost, type CmsCredentials } from "@/lib/cms-update";
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
    // PAS la table publications (qui peut contenir des URLs fausses)
    const liveUrls = new Set<string>();
    const liveSlugs = new Set<string>();
    for (const p of allPosts) {
      if (p.url) {
        liveUrls.add(p.url.replace(/\/$/, "").toLowerCase());
        const slug = extractSlug(p.url);
        if (slug && slug.length > 3) liveSlugs.add(slug);
      }
      // Also extract slug from title (Wix uses title-based slugs)
      if (p.title) {
        const titleSlug = p.title.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (titleSlug.length > 3) liveSlugs.add(titleSlug);
      }
    }

    logger.info(`[cleanup-links] Live CMS: ${allPosts.length} posts, ${liveUrls.size} URLs, ${liveSlugs.size} slugs`);
    logger.info(`[cleanup-links] Live slugs: ${[...liveSlugs].join(", ")}`);

    const details: { title: string; removed: number; broken_urls: string[] }[] = [];
    let totalCleaned = 0;
    let totalLinksFound = 0;

    for (const post of allPosts) {
      let removedCount = 0;
      const brokenUrls: string[] = [];

      const cleanedHtml = post.content.replace(
        /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
        (fullMatch, href: string, innerText: string) => {
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

          // Check 1: exact URL match against live CMS
          const normalized = href.replace(/\/$/, "").toLowerCase();
          if (liveUrls.has(normalized)) return fullMatch;

          // Check 2: slug match against live CMS slugs
          const slug = extractSlug(href);
          if (slug && slug.length > 3 && liveSlugs.has(slug)) return fullMatch;

          // No match in live CMS → this link is BROKEN
          removedCount++;
          brokenUrls.push(href);
          logger.info(`[cleanup-links] BROKEN in "${post.title}": ${href} (slug: "${slug}")`);
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
      } else {
        logger.warn(`[cleanup-links] "${post.title}": update failed — ${updateRes.error}`);
      }
    }

    // Also clean stale DB entries: remove publications whose URL doesn't match any live CMS post
    let dbCleaned = 0;
    try {
      const { data: dbPubs } = await supabase
        .from("publications")
        .select("id, wordpress_url")
        .eq("user_id", user.id);
      for (const pub of dbPubs ?? []) {
        if (!pub.wordpress_url) continue;
        const pubNorm = pub.wordpress_url.replace(/\/$/, "").toLowerCase();
        const pubSlug = extractSlug(pub.wordpress_url);
        const matchesLive = liveUrls.has(pubNorm) || (pubSlug && pubSlug.length > 3 && liveSlugs.has(pubSlug));
        if (!matchesLive) {
          // This DB entry references a page that doesn't exist on the CMS
          logger.info(`[cleanup-links] Stale DB entry: ${pub.wordpress_url} (slug: "${pubSlug}") — no live CMS match`);
          dbCleaned++;
        }
      }
    } catch { /* non-blocking */ }

    logger.info(`[cleanup-links] Done: ${totalLinksFound} internal links, ${totalCleaned} broken removed, ${dbCleaned} stale DB entries found`);

    return Response.json({
      cleaned: totalCleaned,
      scanned: allPosts.length,
      links_found: totalLinksFound,
      stale_db_entries: dbCleaned,
      details,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
