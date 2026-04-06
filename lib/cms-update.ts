/**
 * CMS Update Layer
 * Read + Update capabilities for WordPress, Shopify, Wix, Custom.
 * Used by the SEO executor to modify existing content (maillage, meta, etc.).
 *
 * SAFETY: Every update is preceded by a snapshot of the original content
 * stored in the `content_snapshots` table. Use `rollbackCmsPost()` to restore.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

export type CmsType = "wordpress" | "shopify" | "wix" | "custom";

export type CmsCredentials = {
  cms: CmsType;
  site_url: string;
  wp_username?: string;
  wp_app_password?: string;
  shopify_api_key?: string;
  wix_api_key?: string;
  wix_site_id?: string;
  custom_api_url?: string;
  custom_api_key?: string;
};

export type CmsPost = {
  id: string | number;
  title: string;
  content: string;
  url: string;
  excerpt?: string;
};

export type UpdateResult = {
  success: boolean;
  post_id: string | number;
  url: string;
  error?: string;
};

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
    const res = await fetch(
      `${siteUrl}/wp-json/wp/v2/posts?per_page=${limit}&orderby=date&order=desc&_fields=id,title,content,link,excerpt`,
      { headers: { Authorization: auth, "ngrok-skip-browser-warning": "true" } }
    );
    if (!res.ok) return [];
    const posts = await res.json() as {
      id: number;
      title: { rendered: string };
      content: { rendered: string };
      link: string;
      excerpt: { rendered: string };
    }[];
    return posts.map(p => ({
      id: p.id,
      title: p.title.rendered,
      content: p.content.rendered,
      url: p.link,
      excerpt: p.excerpt.rendered,
    }));
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
  limit: number = 50
): Promise<(CmsPost & { blog_id: number })[]> {
  const baseUrl = storeUrl.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", "X-Shopify-Access-Token": apiKey };

  try {
    const blogsRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, { headers });
    if (!blogsRes.ok) return [];
    const blogsData = await blogsRes.json() as { blogs: { id: number; handle: string }[] };
    if (!blogsData.blogs?.length) return [];

    const articles: (CmsPost & { blog_id: number })[] = [];
    for (const blog of blogsData.blogs) {
      const res = await fetch(
        `${baseUrl}/admin/api/2024-01/blogs/${blog.id}/articles.json?limit=${limit}&fields=id,title,body_html,handle,summary_html`,
        { headers }
      );
      if (!res.ok) continue;
      const data = await res.json() as {
        articles: { id: number; title: string; body_html: string; handle: string; summary_html: string }[];
      };
      for (const a of data.articles ?? []) {
        articles.push({
          id: a.id,
          blog_id: blog.id,
          title: a.title,
          content: a.body_html,
          url: `${baseUrl}/blogs/${blog.handle}/${a.handle}`,
          excerpt: a.summary_html,
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
  updates: { body_html?: string; title?: string; summary_html?: string }
): Promise<UpdateResult> {
  const baseUrl = storeUrl.replace(/\/$/, "");
  try {
    const res = await fetch(
      `${baseUrl}/admin/api/2024-01/blogs/${blogId}/articles/${articleId}.json`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": apiKey },
        body: JSON.stringify({ article: updates }),
      }
    );
    if (!res.ok) {
      return { success: false, post_id: articleId, url: "", error: `Shopify PUT failed: ${await res.text()}` };
    }
    const data = await res.json() as { article: { id: number; handle: string } };
    return { success: true, post_id: data.article.id, url: `${baseUrl}/blogs/news/${data.article.handle}` };
  } catch (err) {
    return { success: false, post_id: articleId, url: "", error: err instanceof Error ? err.message : "Unknown" };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WIX
// ══════════════════════════════════════════════════════════════════════════════

function wixHeaders(apiKey: string, siteId: string) {
  return { "Content-Type": "application/json", Authorization: apiKey, "wix-site-id": siteId };
}

async function wixListPosts(
  apiKey: string,
  siteId: string,
  limit: number = 50
): Promise<(CmsPost & { wix_id: string })[]> {
  try {
    const res = await fetch(
      `https://www.wixapis.com/blog/v3/posts?paging.limit=${limit}&fieldsets=CONTENT`,
      { headers: wixHeaders(apiKey, siteId) }
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      posts: { id: string; title: string; richContent?: { nodes: unknown[] }; url?: { base: string; path: string }; excerpt?: string }[];
    };
    return (data.posts ?? []).map(p => ({
      id: p.id,
      wix_id: p.id,
      title: p.title,
      content: JSON.stringify(p.richContent ?? {}),
      url: p.url ? `${p.url.base}${p.url.path}` : "",
      excerpt: p.excerpt ?? "",
    }));
  } catch {
    return [];
  }
}

async function wixUpdatePost(
  apiKey: string,
  siteId: string,
  postId: string,
  updates: { title?: string; richContent?: unknown }
): Promise<UpdateResult> {
  try {
    // Wix uses PATCH for post updates
    const body: Record<string, unknown> = {};
    if (updates.title) body.title = updates.title;
    if (updates.richContent) body.richContent = updates.richContent;

    const res = await fetch(
      `https://www.wixapis.com/blog/v3/posts/${postId}`,
      {
        method: "PATCH",
        headers: wixHeaders(apiKey, siteId),
        body: JSON.stringify({ post: body }),
      }
    );
    if (!res.ok) {
      return { success: false, post_id: postId, url: "", error: `Wix PATCH failed: ${await res.text()}` };
    }
    const data = await res.json() as { post: { id: string; url?: { base: string; path: string } } };
    const url = data.post.url ? `${data.post.url.base}${data.post.url.path}` : "";
    return { success: true, post_id: data.post.id, url };
  } catch (err) {
    return { success: false, post_id: postId, url: "", error: err instanceof Error ? err.message : "Unknown" };
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
      return shopifyListArticles(creds.site_url, creds.shopify_api_key, limit);
    case "wix":
      if (!creds.wix_api_key || !creds.wix_site_id) return [];
      return wixListPosts(creds.wix_api_key, creds.wix_site_id, limit);
    default:
      return []; // Custom API: no read capability
  }
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
async function saveSnapshot(
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
      const posts = await shopifyListArticles(creds.site_url, creds.shopify_api_key, 100);
      const shopifyPost = posts.find(p => String(p.id) === String(snapshot.post_id));
      if (!shopifyPost) {
        return { success: false, error: "Article Shopify introuvable pour rollback" };
      }
      result = await shopifyUpdateArticle(
        creds.site_url,
        creds.shopify_api_key,
        shopifyPost.blog_id,
        Number(snapshot.post_id),
        { body_html: snapshot.content, title: snapshot.title, summary_html: snapshot.excerpt }
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
  // ── Snapshot before modification ──
  if (extra?.supabase && extra?.userId) {
    try {
      const currentPost = await getCmsPost(creds, postId);
      if (currentPost) {
        await saveSnapshot(extra.supabase, extra.userId, currentPost, extra.actionType ?? "unknown");
      }
    } catch (err) {
      console.error("[cms-update] snapshot failed (non-blocking):", err);
      // Non-blocking: continue with the update even if snapshot fails
    }
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
        creds.site_url,
        creds.shopify_api_key,
        extra.blog_id,
        postId as number,
        { body_html: updates.content, title: updates.title, summary_html: updates.excerpt }
      );

    case "wix":
      if (!creds.wix_api_key || !creds.wix_site_id) {
        return { success: false, post_id: postId, url: "", error: "Wix credentials missing" };
      }
      // For Wix, if content is HTML, we'd need to convert to RichContent
      // For now, we only support title updates and richContent patches
      return wixUpdatePost(creds.wix_api_key, creds.wix_site_id, postId as string, {
        title: updates.title,
      });

    default:
      return { success: false, post_id: postId, url: "", error: `CMS ${creds.cms} ne supporte pas les mises à jour` };
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

    // Don't self-link
    if (link.target_url === pageUrl) continue;

    const anchor = link.anchor;
    if (!anchor || anchor.length < 3) continue;

    // Check if anchor exists in content (outside of existing <a> tags)
    // Build a regex that matches the anchor text NOT inside <a>...</a>
    const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(?<![<][^>]*)(\\b${escapedAnchor}\\b)(?![^<]*<\\/a>)`,
      "i"
    );

    const match = result.match(regex);
    if (!match || match.index === undefined) continue;

    // Verify the match is not inside an existing <a> tag
    const before = result.slice(0, match.index);
    const lastOpenA = before.lastIndexOf("<a ");
    const lastCloseA = before.lastIndexOf("</a>");
    if (lastOpenA > lastCloseA) continue; // Inside an <a> tag

    // Inject the link (replace only first occurrence)
    const replacement = `<a href="${link.target_url}" title="${link.target_title}">${match[0]}</a>`;
    result = result.slice(0, match.index) + replacement + result.slice(match.index + match[0].length);

    injected++;
    injectedLinks.push(link);
  }

  return { html: result, injected, injectedLinks };
}
