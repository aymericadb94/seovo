/**
 * Apply Internal Linking Suggestions API
 *
 * Takes link suggestions from the analysis engine (seo-linking.ts)
 * and applies them to the actual CMS content.
 *
 * Uses injectLinks() for safe HTML manipulation with snapshot backup.
 */

import { createClient } from "@/lib/supabase/server";
import { listCmsPosts, updateCmsPost, injectLinks, type CmsCredentials, type LinkInjection } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "").replace(/^https?:\/\//, "").toLowerCase();
}

function extractSlug(url: string): string {
  return url.replace(/\/$/, "").split("/").filter(Boolean).pop() ?? "";
}

export const maxDuration = 120;

type Suggestion = {
  from_url: string;
  from_title: string;
  to_url: string;
  to_title: string;
  anchor: string;
};

type ApplyResult = {
  applied: { from_title: string; to_title: string; anchor: string }[];
  skipped: { from_title: string; reason: string }[];
  errors: string[];
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "apply-linking", maxRequests: 10, windowSeconds: 3600 });
    if (limited) return limited;

    const { suggestions } = await request.json() as { suggestions: Suggestion[] };

    if (!suggestions?.length) {
      return Response.json({ error: "Aucune suggestion à appliquer" }, { status: 400 });
    }

    // Fetch site config
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

    // Fetch all CMS posts to match URLs to post IDs
    const cmsPosts = await listCmsPosts(creds, 100);
    if (cmsPosts.length === 0) {
      return Response.json({ error: "Aucun article CMS trouvé" }, { status: 400 });
    }

    // Group suggestions by source page
    const bySource = new Map<string, { post_id: string | number; title: string; url: string; blogId?: number; links: LinkInjection[] }>();

    for (const s of suggestions) {
      const normalizedFrom = normalizeUrl(s.from_url);
      const fromSlug = extractSlug(s.from_url);

      // Multi-strategy matching: URL → slug → title
      let post = cmsPosts.find(p => normalizeUrl(p.url) === normalizedFrom);
      if (!post && fromSlug.length > 3) {
        post = cmsPosts.find(p => extractSlug(p.url) === fromSlug);
      }
      if (!post) {
        // Title-based fallback: match by from_title
        post = cmsPosts.find(p => p.title.toLowerCase() === s.from_title.toLowerCase());
      }
      if (!post && s.from_title) {
        // Partial title match
        const searchTitle = s.from_title.replace(/\.{3}$/, "").toLowerCase().trim();
        if (searchTitle.length > 10) {
          post = cmsPosts.find(p => p.title.toLowerCase().startsWith(searchTitle));
        }
      }
      if (!post) {
        console.warn("[apply] Source post not found:", s.from_url, s.from_title, "available:", cmsPosts.slice(0, 3).map(p => p.url));
        continue;
      }

      if (!bySource.has(normalizedFrom)) {
        const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
        bySource.set(normalizedFrom, {
          post_id: post.id,
          title: post.title,
          url: post.url,
          blogId,
          links: [],
        });
      }

      // Use target title as fallback if anchor is empty
      const anchor = s.anchor?.trim() || s.to_title?.split(":")[0]?.trim() || s.to_title;
      bySource.get(normalizedFrom)!.links.push({
        anchor,
        target_url: s.to_url,
        target_title: s.to_title,
      });
    }

    const result: ApplyResult = { applied: [], skipped: [], errors: [] };

    for (const [, entry] of bySource) {
      // Fetch fresh content
      const post = cmsPosts.find(p => String(p.id) === String(entry.post_id));
      if (!post) {
        result.skipped.push({ from_title: entry.title, reason: "Article introuvable dans le CMS" });
        continue;
      }

      // Inject links (max 3 per page to avoid over-optimization)
      const { html: updatedHtml, injected, injectedLinks } = injectLinks(
        post.content,
        entry.links,
        post.url,
        3
      );

      if (injected === 0) {
        const contentLen = post.content?.length ?? 0;
        const anchors = entry.links.map(l => l.anchor).join(", ");
        result.skipped.push({ from_title: entry.title, reason: `Ancre(s) non injectée(s) — contenu: ${contentLen} chars, ancres: "${anchors}"` });
        console.warn("[apply] No anchors injected:", entry.title, "contentLen:", contentLen, "anchors:", anchors);
        continue;
      }

      // Update CMS with snapshot
      const updateRes = await updateCmsPost(
        creds,
        post.id,
        { content: updatedHtml },
        { blog_id: entry.blogId, supabase, userId: user.id, actionType: "apply_linking_suggestions" }
      );

      if (updateRes.success) {
        for (const link of injectedLinks) {
          result.applied.push({
            from_title: entry.title,
            to_title: link.target_title,
            anchor: link.anchor,
          });
        }
      } else {
        result.errors.push(`${entry.title}: ${updateRes.error}`);
        logger.warn("Apply linking suggestion failed", { context: "apply-linking", userId: user.id, error: new Error(updateRes.error ?? "unknown") });
      }
    }

    // Log skipped suggestions where source wasn't found
    const processedUrls = new Set([...bySource.keys()]);
    for (const s of suggestions) {
      if (!processedUrls.has(s.from_url.replace(/\/$/, "").toLowerCase())) {
        result.skipped.push({ from_title: s.from_title, reason: "URL source introuvable dans le CMS" });
        processedUrls.add(s.from_url.replace(/\/$/, "").toLowerCase());
      }
    }

    return Response.json({ result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
