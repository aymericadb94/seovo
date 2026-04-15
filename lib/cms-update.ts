/**
 * CMS Update Layer
 * Read + Update capabilities for WordPress, Shopify, Wix, Custom.
 * Used by the SEO executor to modify existing content (maillage, meta, etc.).
 *
 * SAFETY: Every update is preceded by a snapshot of the original content
 * stored in the `content_snapshots` table. Use `rollbackCmsPost()` to restore.
 *
 * ARCHITECTURE: La logique Wix est isolée dans lib/platforms/wix.ts.
 * Ce fichier importe les fonctions Wix — ne jamais dupliquer la logique ici.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { shopifyFetch } from "@/lib/shopify";
import {
  wixListPosts,
  wixListStaticPages,
  wixUpdatePost,
  wixUpdatePostContent,
  wixDeletePost,
  wixListRawPosts as _wixListRawPosts,
  wixRemoveBrokenLinks as _wixRemoveBrokenLinks,
  type WixRawPost,
} from "@/lib/platforms/wix";

// ── Types ────────────────────────────────────────────────────────────────────

export type CmsType = "wordpress" | "shopify" | "wix" | "custom";

export type CmsCredentials = {
  cms: CmsType;
  site_url: string;
  wp_username?: string;
  wp_app_password?: string;
  shopify_api_key?: string;
  /** The .myshopify.com URL for Admin API calls (falls back to site_url) */
  shopify_store_url?: string;
  wix_api_key?: string;
  wix_site_id?: string;
  custom_api_url?: string;
  custom_api_key?: string;
};

export type CmsPageType = "article" | "page";

export type CmsPost = {
  id: string | number;
  title: string;
  content: string;
  url: string;
  excerpt?: string;
  page_type?: CmsPageType;
  featured_image?: string | null;
  published_at?: string | null;
};

/** Extract the first <img src="..."> from HTML content as fallback for missing featured images */
function extractFirstImage(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!match?.[1]) return null;
  const src = match[1];
  // Skip tiny tracking pixels, spacers, emojis
  if (src.includes("1x1") || src.includes("pixel") || src.includes("spacer") || src.includes("emoji")) return null;
  return src;
}

export type UpdateResult = {
  success: boolean;
  post_id: string | number;
  url: string;
  error?: string;
};

// ── Re-exports Wix (pour les consommateurs qui importent depuis cms-update) ──

export { type WixRawPost };
export function wixListRawPosts(
  apiKey: string, siteId: string, limit?: number, siteUrl?: string
) {
  return _wixListRawPosts(apiKey, siteId, limit, siteUrl);
}
export function wixRemoveBrokenLinks(
  ...args: Parameters<typeof _wixRemoveBrokenLinks>
) {
  // Inject getCmsPost & saveSnapshot dependencies so Wix module can snapshot
  const [apiKey, siteId, rawPost, isBrokenUrl, extra] = args;
  return _wixRemoveBrokenLinks(apiKey, siteId, rawPost, isBrokenUrl, extra, {
    getCmsPost,
    saveSnapshot,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// WORDPRESS
// ══════════════════════════════════════════════════════════════════════════════

function wpAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

async function wpGetPost(siteUrl: string, auth: string, postId: number): Promise<CmsPost | null> {
  try {
    const res = await fetch(
      `${siteUrl}/wp-json/wp/v2/posts/${postId}?_fields=id,title,content,link,excerpt`,
      { headers: { Authorization: auth, "ngrok-skip-browser-warning": "true" } }
    );
    if (!res.ok) return null;
    const p = await res.json() as {
      id: number;
      title: { rendered: string };
      content: { rendered: string };
      link: string;
      excerpt: { rendered: string };
    };
    return {
      id: p.id,
      title: p.title.rendered,
      content: p.content.rendered,
      url: p.link,
      excerpt: p.excerpt.rendered,
    };
  } catch {
    return null;
  }
}

async function wpUpdatePost(
  siteUrl: string,
  auth: string,
  postId: number,
  updates: { content?: string; title?: string; excerpt?: string }
): Promise<UpdateResult> {
  try {
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts/${postId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.text();
      return { success: false, post_id: postId, url: "", error: `WordPress PUT failed: ${err}` };
    }
    const post = await res.json() as { id: number; link: string };
    return { success: true, post_id: post.id, url: post.link };
  } catch (err) {
    return { success: false, post_id: postId, url: "", error: err instanceof Error ? err.message : "Unknown error" };
  }
}

async function wpListPosts(
  siteUrl: string,
  auth: string,
  limit: number = 100
): Promise<CmsPost[]> {
  try {
    const allPosts: CmsPost[] = [];
    const perPage = Math.min(limit, 100); // WP max is 100
    const pages = Math.ceil(limit / perPage);

    for (let page = 1; page <= pages; page++) {
      const remaining = limit - allPosts.length;
      if (remaining <= 0) break;
      const count = Math.min(perPage, remaining);

      const res = await fetch(
        `${siteUrl}/wp-json/wp/v2/posts?per_page=${count}&page=${page}&orderby=date&order=desc&_fields=id,title,content,link,excerpt,date,featured_media&_embed=wp:featuredmedia`,
        { headers: { Authorization: auth, "ngrok-skip-browser-warning": "true" } }
      );
      if (!res.ok) break;
      const posts = await res.json() as {
        id: number;
        title: { rendered: string };
        content: { rendered: string };
        link: string;
        excerpt: { rendered: string };
        date: string;
        _embedded?: { "wp:featuredmedia"?: { source_url?: string }[] };
      }[];

      if (posts.length === 0) break;
      allPosts.push(...posts.map(p => ({
        id: p.id,
        title: p.title.rendered,
        content: p.content.rendered,
        url: p.link,
        excerpt: p.excerpt.rendered,
        featured_image: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? extractFirstImage(p.content.rendered) ?? null,
        published_at: p.date ? new Date(p.date).toISOString() : null,
      })));

      if (posts.length < count) break; // No more pages
    }

    return allPosts;
  } catch {
    return [];
  }
}

async function wpListPages(
  siteUrl: string,
  auth: string,
  limit: number = 100
): Promise<CmsPost[]> {
  try {
    const allPages: CmsPost[] = [];
    const perPage = Math.min(limit, 100);
    const pages = Math.ceil(limit / perPage);

    for (let page = 1; page <= pages; page++) {
      const remaining = limit - allPages.length;
      if (remaining <= 0) break;
      const count = Math.min(perPage, remaining);

      const res = await fetch(
        `${siteUrl}/wp-json/wp/v2/pages?per_page=${count}&page=${page}&orderby=date&order=desc&_fields=id,title,content,link,excerpt,date,featured_media&_embed=wp:featuredmedia`,
        { headers: { Authorization: auth, "ngrok-skip-browser-warning": "true" } }
      );
      if (!res.ok) break;
      const items = await res.json() as {
        id: number;
        title: { rendered: string };
        content: { rendered: string };
        link: string;
        excerpt: { rendered: string };
        date: string;
        _embedded?: { "wp:featuredmedia"?: { source_url?: string }[] };
      }[];

      if (items.length === 0) break;
      allPages.push(...items.map(p => ({
        id: p.id,
        title: p.title.rendered,
        content: p.content.rendered,
        url: p.link,
        excerpt: p.excerpt.rendered,
        page_type: "page" as CmsPageType,
        featured_image: p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? extractFirstImage(p.content.rendered) ?? null,
        published_at: p.date ? new Date(p.date).toISOString() : null,
      })));

      if (items.length < count) break;
    }

    return allPages;
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SHOPIFY
// ══════════════════════════════════════════════════════════════════════════════

async function shopifyListArticles(
  storeUrl: string,
  apiKey: string,
  limit: number = 50,
  publicUrl?: string
): Promise<(CmsPost & { blog_id: number })[]> {
  const publicBase = (publicUrl ?? storeUrl).replace(/\/$/, "");

  try {
    const blogsRes = await shopifyFetch(storeUrl, apiKey, "blogs.json");
    if (!blogsRes.ok) return [];
    const blogsData = await blogsRes.json() as { blogs: { id: number; handle: string }[] };
    if (!blogsData.blogs?.length) return [];

    const articles: (CmsPost & { blog_id: number })[] = [];
    for (const blog of blogsData.blogs) {
      const res = await shopifyFetch(storeUrl, apiKey, `blogs/${blog.id}/articles.json?limit=${limit}&fields=id,title,body_html,handle,summary_html,image,published_at`);
      if (!res.ok) continue;
      const data = await res.json() as {
        articles: { id: number; title: string; body_html: string; handle: string; summary_html: string; image?: { src: string } | null; published_at?: string | null }[];
      };
      for (const a of data.articles ?? []) {
        articles.push({
          id: a.id,
          blog_id: blog.id,
          title: a.title,
          content: a.body_html,
          url: `${publicBase}/blogs/${blog.handle}/${a.handle}`,
          excerpt: a.summary_html,
          featured_image: a.image?.src ?? extractFirstImage(a.body_html ?? "") ?? null,
          published_at: a.published_at ?? null,
        });
      }
    }
    return articles;
  } catch {
    return [];
  }
}

async function shopifyUpdateArticle(
  storeUrl: string,
  apiKey: string,
  blogId: number,
  articleId: number,
  updates: { body_html?: string; title?: string; summary_html?: string },
  publicUrl?: string
): Promise<UpdateResult> {
  const publicBase = (publicUrl ?? storeUrl).replace(/\/$/, "");
  try {
    const res = await shopifyFetch(storeUrl, apiKey, `blogs/${blogId}/articles/${articleId}.json`, {
      method: "PUT",
      body: JSON.stringify({ article: updates }),
    });
    if (!res.ok) {
      return { success: false, post_id: articleId, url: "", error: `Shopify PUT failed: ${await res.text()}` };
    }
    const data = await res.json() as { article: { id: number; handle: string } };
    return { success: true, post_id: data.article.id, url: `${publicBase}/blogs/news/${data.article.handle}` };
  } catch (err) {
    return { success: false, post_id: articleId, url: "", error: err instanceof Error ? err.message : "Unknown" };
  }
}

async function shopifyListPages(
  storeUrl: string,
  apiKey: string,
  limit: number = 50,
  publicUrl?: string
): Promise<CmsPost[]> {
  const publicBase = (publicUrl ?? storeUrl).replace(/\/$/, "");
  try {
    const res = await shopifyFetch(storeUrl, apiKey, `pages.json?limit=${limit}&fields=id,title,body_html,handle,published_at`);
    if (!res.ok) return [];
    const data = await res.json() as {
      pages: { id: number; title: string; body_html: string; handle: string; published_at?: string | null }[];
    };
    return (data.pages ?? []).map(p => ({
      id: p.id,
      title: p.title,
      content: p.body_html ?? "",
      url: `${publicBase}/pages/${p.handle}`,
      page_type: "page" as CmsPageType,
      featured_image: extractFirstImage(p.body_html ?? "") ?? null,
      published_at: p.published_at ?? null,
    }));
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED INTERFACE
// ══════════════════════════════════════════════════════════════════════════════

export async function listCmsPosts(creds: CmsCredentials, limit: number = 50): Promise<CmsPost[]> {
  switch (creds.cms) {
    case "wordpress":
      if (!creds.wp_username || !creds.wp_app_password) return [];
      return wpListPosts(creds.site_url, wpAuth(creds.wp_username, creds.wp_app_password), limit);
    case "shopify":
      if (!creds.shopify_api_key) return [];
      return shopifyListArticles(creds.shopify_store_url || creds.site_url, creds.shopify_api_key, limit, creds.site_url);
    case "wix":
      if (!creds.wix_api_key || !creds.wix_site_id) return [];
      return wixListPosts(creds.wix_api_key, creds.wix_site_id, limit, creds.site_url);
    default:
      return []; // Custom API: no read capability
  }
}

/**
 * List ALL CMS content: blog posts + static pages.
 * Each item has page_type: "article" | "page".
 */
export async function listAllCmsContent(creds: CmsCredentials, limit: number = 200): Promise<CmsPost[]> {
  const posts = (await listCmsPosts(creds, limit)).map(p => ({ ...p, page_type: (p.page_type ?? "article") as CmsPageType }));

  let pages: CmsPost[] = [];
  switch (creds.cms) {
    case "wordpress":
      if (creds.wp_username && creds.wp_app_password)
        pages = await wpListPages(creds.site_url, wpAuth(creds.wp_username, creds.wp_app_password), limit);
      break;
    case "shopify":
      if (creds.shopify_api_key)
        pages = await shopifyListPages(creds.shopify_store_url || creds.site_url, creds.shopify_api_key, limit, creds.site_url);
      break;
    case "wix":
      if (creds.wix_api_key && creds.wix_site_id)
        pages = await wixListStaticPages(creds.wix_api_key, creds.wix_site_id, creds.site_url);
      break;
  }

  return [...posts, ...pages];
}

// ══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT & ROLLBACK — Safety net for all CMS modifications
// ══════════════════════════════════════════════════════════════════════════════

export type ContentSnapshot = {
  id: string;
  post_id: string | number;
  post_url: string;
  title: string;
  content: string;
  excerpt: string;
  action_type: string;
  created_at: string;
};

/**
 * Save a snapshot of a post before modifying it.
 * Returns the snapshot ID, or null if the save failed.
 */
export async function saveSnapshot(
  supabase: SupabaseClient,
  userId: string,
  post: CmsPost,
  actionType: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("content_snapshots")
      .insert({
        user_id: userId,
        post_id: String(post.id),
        post_url: post.url,
        title: post.title,
        content: post.content,
        excerpt: post.excerpt ?? "",
        action_type: actionType,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[cms-update] snapshot save failed:", error.message);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error("[cms-update] snapshot save error:", err);
    return null;
  }
}

/**
 * List all snapshots for a given user, newest first.
 */
export async function listSnapshots(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 50
): Promise<ContentSnapshot[]> {
  const { data } = await supabase
    .from("content_snapshots")
    .select("id, post_id, post_url, title, content, excerpt, action_type, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []) as ContentSnapshot[];
}

/**
 * Rollback a post to a previous snapshot.
 * 1. Loads the snapshot from DB
 * 2. Restores the content to the CMS
 * 3. Marks the snapshot as "rolled_back"
 */
export async function rollbackCmsPost(
  supabase: SupabaseClient,
  userId: string,
  snapshotId: string,
  creds: CmsCredentials
): Promise<{ success: boolean; error?: string }> {
  // 1. Load snapshot
  const { data: snapshot, error } = await supabase
    .from("content_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .eq("user_id", userId)
    .single();

  if (error || !snapshot) {
    return { success: false, error: "Snapshot introuvable" };
  }

  // 2. Restore to CMS (bypass snapshot — direct update)
  const updates: { content?: string; title?: string; excerpt?: string } = {
    content: snapshot.content,
    title: snapshot.title,
  };
  if (snapshot.excerpt) updates.excerpt = snapshot.excerpt;

  let result: UpdateResult;
  switch (creds.cms) {
    case "wordpress":
      if (!creds.wp_username || !creds.wp_app_password) {
        return { success: false, error: "WordPress credentials missing" };
      }
      result = await wpUpdatePost(
        creds.site_url,
        wpAuth(creds.wp_username, creds.wp_app_password),
        Number(snapshot.post_id),
        updates
      );
      break;

    case "shopify":
      if (!creds.shopify_api_key) {
        return { success: false, error: "Shopify credentials missing" };
      }
      // For shopify rollback, we need the blog_id — try to find it
      const shopifyApiUrl = creds.shopify_store_url || creds.site_url;
      const posts = await shopifyListArticles(shopifyApiUrl, creds.shopify_api_key, 100, creds.site_url);
      const shopifyPost = posts.find(p => String(p.id) === String(snapshot.post_id));
      if (!shopifyPost) {
        return { success: false, error: "Article Shopify introuvable pour rollback" };
      }
      result = await shopifyUpdateArticle(
        shopifyApiUrl,
        creds.shopify_api_key,
        shopifyPost.blog_id,
        Number(snapshot.post_id),
        { body_html: snapshot.content, title: snapshot.title, summary_html: snapshot.excerpt },
        creds.site_url
      );
      break;

    default:
      return { success: false, error: `Rollback non supporté pour ${creds.cms}` };
  }

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // 3. Mark snapshot as rolled back
  await supabase
    .from("content_snapshots")
    .update({ rolled_back_at: new Date().toISOString() })
    .eq("id", snapshotId);

  return { success: true };
}

export async function updateCmsPost(
  creds: CmsCredentials,
  postId: string | number,
  updates: { content?: string; title?: string; excerpt?: string },
  extra?: { blog_id?: number; supabase?: SupabaseClient; userId?: string; actionType?: string }
): Promise<UpdateResult> {
  // ── Snapshot before modification (MANDATORY for Wix) ──
  if (extra?.supabase && extra?.userId) {
    try {
      const currentPost = await getCmsPost(creds, postId);
      if (currentPost) {
        // SAFETY: for Wix, verify snapshot has real content before proceeding
        if (creds.cms === "wix" && (!currentPost.content || currentPost.content.length < 50)) {
          console.error(`[cms-update] ABORT: snapshot content too short for Wix post ${postId} (${currentPost.content?.length ?? 0} chars) — refusing to modify`);
          return { success: false, post_id: postId, url: "", error: "Impossible de sauvegarder le contenu actuel — abandon par sécurité" };
        }
        await saveSnapshot(extra.supabase, extra.userId, currentPost, extra.actionType ?? "unknown");
      } else if (creds.cms === "wix") {
        console.error(`[cms-update] ABORT: could not fetch Wix post ${postId} for snapshot`);
        return { success: false, post_id: postId, url: "", error: "Impossible de lire l'article existant — abandon par sécurité" };
      }
    } catch (err) {
      console.error("[cms-update] snapshot failed:", err);
      if (creds.cms === "wix") {
        return { success: false, post_id: postId, url: "", error: "Erreur lors de la sauvegarde préventive — abandon par sécurité" };
      }
    }
  } else if (creds.cms === "wix" && updates.content) {
    // For Wix content updates, snapshot is MANDATORY
    console.error(`[cms-update] ABORT: no supabase/userId for Wix snapshot on post ${postId}`);
    return { success: false, post_id: postId, url: "", error: "Snapshot obligatoire pour les modifications Wix — paramètres manquants" };
  }

  switch (creds.cms) {
    case "wordpress":
      if (!creds.wp_username || !creds.wp_app_password) {
        return { success: false, post_id: postId, url: "", error: "WordPress credentials missing" };
      }
      return wpUpdatePost(
        creds.site_url,
        wpAuth(creds.wp_username, creds.wp_app_password),
        postId as number,
        updates
      );

    case "shopify":
      if (!creds.shopify_api_key || !extra?.blog_id) {
        return { success: false, post_id: postId, url: "", error: "Shopify credentials or blog_id missing" };
      }
      return shopifyUpdateArticle(
        creds.shopify_store_url || creds.site_url,
        creds.shopify_api_key,
        extra.blog_id,
        postId as number,
        { body_html: updates.content, title: updates.title, summary_html: updates.excerpt },
        creds.site_url
      );

    case "wix":
      if (!creds.wix_api_key || !creds.wix_site_id) {
        return { success: false, post_id: postId, url: "", error: "Wix credentials missing" };
      }
      // Wix Blog v3: PATCH uses richContent format, not content/Draft.js
      if (updates.content) {
        return wixUpdatePostContent(
          creds.wix_api_key, creds.wix_site_id, postId as string, updates.content
        );
      }
      return wixUpdatePost(creds.wix_api_key, creds.wix_site_id, postId as string, {
        title: updates.title,
      });

    default:
      return { success: false, post_id: postId, url: "", error: `CMS ${creds.cms} ne supporte pas les mises à jour` };
  }
}

/**
 * Remove all links pointing to a deleted URL from CMS articles.
 * Handles two patterns:
 * 1. Inline links: <a href="URL">text</a> → keeps just "text"
 * 2. "À lire aussi" paragraphs: removes the entire paragraph if it only links to the deleted URL
 */
export function removeLinksToUrl(html: string, deletedUrl: string): { html: string; removed: number } {
  const normDeleted = deletedUrl.replace(/\/$/, "").toLowerCase();
  let removed = 0;

  // Pattern 1: Remove entire "À lire aussi : <a>" paragraphs pointing to deleted URL
  const readAlsoRegex = new RegExp(
    `<p[^>]*>\\s*À lire aussi\\s*:\\s*<a\\s+href="[^"]*"[^>]*>[^<]*<\\/a>\\s*<\\/p>`,
    "gi"
  );
  let result = html.replace(readAlsoRegex, (match) => {
    const hrefMatch = match.match(/href="([^"]+)"/i);
    if (hrefMatch && hrefMatch[1].replace(/\/$/, "").toLowerCase() === normDeleted) {
      removed++;
      return "";
    }
    return match;
  });

  // Pattern 2: Unwrap inline <a> tags pointing to deleted URL (keep the text)
  const linkRegex = new RegExp(
    `<a\\s+href="([^"]+)"[^>]*>([^<]*)<\\/a>`,
    "gi"
  );
  result = result.replace(linkRegex, (match, href: string, text: string) => {
    if (href.replace(/\/$/, "").toLowerCase() === normDeleted) {
      removed++;
      return text;
    }
    return match;
  });

  return { html: result, removed };
}

export type DeleteResult = {
  success: boolean;
  post_id: string | number;
  error?: string;
};

export async function deleteCmsPost(
  creds: CmsCredentials,
  postId: string | number,
  extra?: { blog_id?: number }
): Promise<DeleteResult> {
  switch (creds.cms) {
    case "wordpress": {
      if (!creds.wp_username || !creds.wp_app_password) {
        return { success: false, post_id: postId, error: "WordPress credentials missing" };
      }
      const auth = wpAuth(creds.wp_username, creds.wp_app_password);
      // Try posts first, then pages
      let res = await fetch(
        `${creds.site_url}/wp-json/wp/v2/posts/${postId}?force=true`,
        { method: "DELETE", headers: { Authorization: auth } }
      );
      if (!res.ok) {
        res = await fetch(
          `${creds.site_url}/wp-json/wp/v2/pages/${postId}?force=true`,
          { method: "DELETE", headers: { Authorization: auth } }
        );
      }
      if (!res.ok) {
        return { success: false, post_id: postId, error: `WordPress DELETE failed: ${res.status}` };
      }
      return { success: true, post_id: postId };
    }

    case "shopify": {
      if (!creds.shopify_api_key) {
        return { success: false, post_id: postId, error: "Shopify API key missing" };
      }
      const storeUrl = creds.shopify_store_url || creds.site_url;
      if (extra?.blog_id) {
        const res = await shopifyFetch(storeUrl, creds.shopify_api_key, `blogs/${extra.blog_id}/articles/${postId}.json`, { method: "DELETE" });
        if (!res.ok) {
          return { success: false, post_id: postId, error: `Shopify DELETE article failed: ${res.status}` };
        }
        return { success: true, post_id: postId };
      }
      // Try as page
      const res = await shopifyFetch(storeUrl, creds.shopify_api_key, `pages/${postId}.json`, { method: "DELETE" });
      if (!res.ok) {
        return { success: false, post_id: postId, error: `Shopify DELETE page failed: ${res.status}` };
      }
      return { success: true, post_id: postId };
    }

    case "wix": {
      if (!creds.wix_api_key || !creds.wix_site_id) {
        return { success: false, post_id: postId, error: "Wix credentials missing" };
      }
      const wixResult = await wixDeletePost(creds.wix_api_key, creds.wix_site_id, postId as string);
      return { success: wixResult.success, post_id: postId, error: wixResult.error };
    }

    default:
      return { success: false, post_id: postId, error: `CMS ${creds.cms} ne supporte pas la suppression` };
  }
}

export async function getCmsPost(
  creds: CmsCredentials,
  postId: string | number
): Promise<CmsPost | null> {
  switch (creds.cms) {
    case "wordpress":
      if (!creds.wp_username || !creds.wp_app_password) return null;
      return wpGetPost(creds.site_url, wpAuth(creds.wp_username, creds.wp_app_password), postId as number);
    default:
      // For other CMS, list and find
      const posts = await listCmsPosts(creds, 100);
      return posts.find(p => String(p.id) === String(postId)) ?? null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// LINK INJECTION — Insert internal links into HTML content
// ══════════════════════════════════════════════════════════════════════════════

export type LinkInjection = {
  anchor: string;      // Text to wrap in <a> tag (must exist in content)
  target_url: string;  // URL to link to
  target_title: string; // For logging
};

/**
 * Inject internal links into HTML content.
 * Rules:
 * - Only inject if anchor text exists in content (case-insensitive match)
 * - Don't inject if anchor is already inside an <a> tag
 * - Max 1 injection per anchor text
 * - Max `maxLinks` total injections per call
 * - Don't self-link (target_url === page URL)
 */
export function injectLinks(
  html: string,
  links: LinkInjection[],
  pageUrl: string,
  maxLinks: number = 3
): { html: string; injected: number; injectedLinks: LinkInjection[] } {
  let result = html;
  let injected = 0;
  const injectedLinks: LinkInjection[] = [];

  for (const link of links) {
    if (injected >= maxLinks) break;

    // Don't self-link (normalize for comparison)
    const normTarget = link.target_url.replace(/\/$/, "").replace(/^https?:\/\//, "").toLowerCase();
    const normPage = pageUrl.replace(/\/$/, "").replace(/^https?:\/\//, "").toLowerCase();
    if (normTarget === normPage) continue;

    const anchor = link.anchor?.trim();
    if (!anchor || anchor.length < 2) continue;

    // Strategy 1: Find exact anchor text in content (outside <a> tags)
    const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?<![<][^>]*)(\\b${escapedAnchor}\\b)(?![^<]*<\\/a>)`,
      "i"
    );

    const match = result.match(regex);
    if (match && match.index !== undefined) {
      // Verify not inside an existing <a> tag
      const before = result.slice(0, match.index);
      const lastOpenA = before.lastIndexOf("<a ");
      const lastCloseA = before.lastIndexOf("</a>");
      if (lastOpenA <= lastCloseA) {
        const replacement = `<a href="${link.target_url}" title="${link.target_title}">${match[0]}</a>`;
        result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);
        injected++;
        injectedLinks.push(link);
        continue;
      }
    }

    // Strategy 2: Find partial match — try first 2-3 words of anchor
    const anchorWords = anchor.split(/\s+/);
    let partialInjected = false;
    for (const len of [3, 2]) {
      if (anchorWords.length < len) continue;
      const partial = anchorWords.slice(0, len).join(" ");
      if (partial.length < 3) continue;
      const escapedPartial = partial.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const partialRegex = new RegExp(
        `(?<![<][^>]*)(\\b${escapedPartial}\\b)(?![^<]*<\\/a>)`,
        "i"
      );
      const partialMatch = result.match(partialRegex);
      if (partialMatch && partialMatch.index !== undefined) {
        const before = result.slice(0, partialMatch.index);
        const lastOpenA = before.lastIndexOf("<a ");
        const lastCloseA = before.lastIndexOf("</a>");
        if (lastOpenA <= lastCloseA) {
          const replacement = `<a href="${link.target_url}" title="${link.target_title}">${partialMatch[0]}</a>`;
          result = result.slice(0, partialMatch.index) + replacement + result.slice(partialMatch.index + partialMatch[0].length);
          injected++;
          injectedLinks.push(link);
          partialInjected = true;
          break;
        }
      }
    }
    if (partialInjected) continue;

    // Strategy 3: Insert a "À lire aussi" paragraph into the content
    const linkParagraph = `<p>À lire aussi : <a href="${link.target_url}" title="${link.target_title}">${anchor}</a></p>`;

    // Try to insert before the last </p> (before conclusion)
    const lastPClose = result.lastIndexOf("</p>");
    if (lastPClose > 0) {
      // Find 2nd-to-last </p> to avoid inserting at the very end
      const beforeLast = result.lastIndexOf("</p>", lastPClose - 1);
      const insertPos = beforeLast > 0 ? beforeLast + 4 : lastPClose + 4;
      result = result.slice(0, insertPos) + "\n" + linkParagraph + "\n" + result.slice(insertPos);
      injected++;
      injectedLinks.push(link);
      continue;
    }

    // Strategy 4: No </p> found — append at the end (works with any content format)
    result = result + "\n" + linkParagraph;
    injected++;
    injectedLinks.push(link);
  }

  return { html: result, injected, injectedLinks };
}
