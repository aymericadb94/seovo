/**
 * CMS Update Layer
 * Read + Update capabilities for WordPress, Shopify, Wix, Custom.
 * Used by the SEO executor to modify existing content (maillage, meta, etc.).
 *
 * SAFETY: Every update is preceded by a snapshot of the original content
 * stored in the `content_snapshots` table. Use `rollbackCmsPost()` to restore.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { shopifyFetch } from "@/lib/shopify";

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
      const res = await shopifyFetch(storeUrl, apiKey, `blogs/${blog.id}/articles.json?limit=${limit}&fields=id,title,body_html,handle,summary_html`);
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
          url: `${publicBase}/blogs/${blog.handle}/${a.handle}`,
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

// ══════════════════════════════════════════════════════════════════════════════
// WIX
// ══════════════════════════════════════════════════════════════════════════════

function wixHeaders(apiKey: string, siteId: string) {
  return { "Content-Type": "application/json", Authorization: apiKey, "wix-site-id": siteId };
}

/**
 * Wix Blog v3 returns content as Draft.js blocks, not richContent.
 * Each block: { key, type, text, entityRanges, inlineStyleRanges, data }
 * Entity map contains links: { type: "LINK", data: { url: "..." } }
 */
type WixDraftBlock = {
  key: string;
  type: string;         // "unstyled", "header-two", "header-three", "unordered-list-item", "ordered-list-item"
  text: string;
  entityRanges?: { offset: number; length: number; key: number }[];
  inlineStyleRanges?: { offset: number; length: number; style: string }[];
  data?: Record<string, unknown>;
};

type WixDraftEntity = {
  type: string;         // "LINK", "IMAGE", etc.
  data?: { url?: string; href?: string; target?: string };
};

type WixContentBlock = {
  blocks: WixDraftBlock[];
  entityMap?: Record<string, WixDraftEntity>;
};

async function wixListPosts(
  apiKey: string,
  siteId: string,
  limit: number = 50,
  siteUrl?: string,
): Promise<(CmsPost & { wix_id: string })[]> {
  try {
    const res = await fetch(
      `https://www.wixapis.com/blog/v3/posts?paging.limit=${limit}&fieldsets=CONTENT&fieldsets=URL`,
      { headers: wixHeaders(apiKey, siteId) }
    );
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as { posts?: any[] };

    const base = siteUrl?.replace(/\/$/, "") ?? "";

    return (data.posts ?? []).map((p: Record<string, unknown>) => {
      const title = (p.title as string) ?? "";
      const slug = (p.slug as string) ?? "";
      const excerpt = (p.excerpt as string) ?? "";
      const urlObj = p.url as { base?: string; path?: string } | undefined;

      // Build URL
      let postUrl = "";
      if (urlObj?.base && urlObj?.path) {
        postUrl = `${urlObj.base}${urlObj.path}`;
      } else if (slug) {
        postUrl = `${base}/post/${slug}`;
      }

      // Convert content to HTML — Wix sends content as a JSON string
      let html = "";
      try {
        let raw = p.content;
        // Step 1: if string, parse JSON
        if (typeof raw === "string") {
          try { raw = JSON.parse(raw); } catch { /* if it contains HTML, use as-is */ }
        }
        // Step 2: if still a string (raw HTML or unparseable), use directly
        if (typeof raw === "string") {
          html = raw;
        } else if (raw && typeof raw === "object") {
          const obj = raw as Record<string, unknown>;
          if (Array.isArray(obj)) {
            // Direct array of Draft.js blocks
            html = wixDraftBlocksToHtml(obj as WixDraftBlock[], {});
          } else if (Array.isArray(obj.blocks)) {
            // { blocks: [...], entityMap: {...} } — standard Draft.js format
            html = wixDraftBlocksToHtml(
              obj.blocks as WixDraftBlock[],
              (obj.entityMap ?? {}) as Record<string, WixDraftEntity>
            );
          }
        }
      } catch { /* non-fatal */ }

      // Fallback: try richContent
      const rc = p.richContent as { nodes?: WixRichNode[] } | undefined;
      if (!html && rc?.nodes?.length) {
        html = wixRichContentToHtml(rc.nodes);
      }
      // Last resort: excerpt
      if (!html && excerpt) {
        html = `<p>${excerpt}</p>`;
      }

      return {
        id: (p.id as string) ?? "",
        wix_id: (p.id as string) ?? "",
        title,
        content: html,
        url: postUrl,
        excerpt,
      };
    });
  } catch {
    return [];
  }
}

/** Convert Wix Draft.js blocks to HTML */
function wixDraftBlocksToHtml(blocks: WixDraftBlock[], entityMap: Record<string, WixDraftEntity>): string {
  let html = "";

  for (const block of blocks) {
    // Build text with entity links inserted
    let text = block.text;
    if (block.entityRanges?.length && entityMap) {
      // Process entities in reverse order to preserve offsets
      const sortedRanges = [...block.entityRanges].sort((a, b) => b.offset - a.offset);
      for (const range of sortedRanges) {
        const entity = entityMap[String(range.key)];
        if (entity?.type === "LINK") {
          const url = entity.data?.url || entity.data?.href || "";
          if (url) {
            const anchor = text.slice(range.offset, range.offset + range.length);
            text = text.slice(0, range.offset) + `<a href="${url}">${anchor}</a>` + text.slice(range.offset + range.length);
          }
        }
      }
    }

    // Wrap in appropriate HTML tag
    switch (block.type) {
      case "header-one":
        html += `<h1>${text}</h1>`;
        break;
      case "header-two":
        html += `<h2>${text}</h2>`;
        break;
      case "header-three":
        html += `<h3>${text}</h3>`;
        break;
      case "header-four":
        html += `<h4>${text}</h4>`;
        break;
      case "unordered-list-item":
        html += `<li>${text}</li>`;
        break;
      case "ordered-list-item":
        html += `<li>${text}</li>`;
        break;
      case "blockquote":
        html += `<blockquote>${text}</blockquote>`;
        break;
      default:
        // "unstyled" and others → paragraph
        if (text.trim()) html += `<p>${text}</p>`;
        break;
    }
  }

  return html;
}

/**
 * Convert Wix richContent nodes to basic HTML.
 *
 * Wix richContent structure:
 * - Block nodes: PARAGRAPH, HEADING, BULLETED_LIST, ORDERED_LIST, LIST_ITEM
 * - Inline nodes: TEXT (with optional decorations for LINK, BOLD, ITALIC)
 * - Links are decorations on TEXT nodes, NOT separate nodes
 */
type WixRichNode = {
  type: string;
  nodes?: WixRichNode[];
  textData?: {
    text: string;
    decorations?: { type: string; linkData?: { link?: { url?: string } } }[];
  };
  headingData?: { level: number };
  paragraphData?: unknown;
  linkData?: { link?: { url?: string } };
};

function wixRichContentToHtml(nodes: WixRichNode[]): string {
  let html = "";
  for (const node of nodes) {
    if (node.type === "HEADING") {
      const level = node.headingData?.level ?? 2;
      const inner = wixInlineNodesToHtml(node.nodes ?? []);
      html += `<h${level}>${inner}</h${level}>`;
    } else if (node.type === "PARAGRAPH") {
      const inner = wixInlineNodesToHtml(node.nodes ?? []);
      if (inner.trim()) html += `<p>${inner}</p>`;
    } else if (node.type === "BULLETED_LIST" || node.type === "ORDERED_LIST") {
      const tag = node.type === "ORDERED_LIST" ? "ol" : "ul";
      html += `<${tag}>`;
      for (const item of (node.nodes ?? [])) {
        // LIST_ITEM contains nested PARAGRAPH/etc
        const inner = wixRichContentToHtml(item.nodes ?? []);
        html += `<li>${inner}</li>`;
      }
      html += `</${tag}>`;
    } else if (node.nodes) {
      // Generic container (TABLE_CELL, BLOCKQUOTE, etc.) — recurse
      html += wixRichContentToHtml(node.nodes);
    }
  }
  return html;
}

function wixInlineNodesToHtml(nodes: WixRichNode[]): string {
  let result = "";
  for (const n of nodes) {
    if (n.type === "TEXT") {
      const text = n.textData?.text ?? "";
      // Check decorations for links
      const linkDecor = n.textData?.decorations?.find(d => d.type === "LINK");
      if (linkDecor?.linkData?.link?.url) {
        result += `<a href="${linkDecor.linkData.link.url}">${text}</a>`;
      } else {
        result += text;
      }
    } else if (n.type === "LINK" || n.linkData?.link?.url) {
      // Explicit LINK node (rare but possible)
      const href = n.linkData?.link?.url ?? "";
      const inner = wixInlineNodesToHtml(n.nodes ?? []);
      result += href ? `<a href="${href}">${inner || href}</a>` : inner;
    } else if (n.nodes) {
      // Nested inline container
      result += wixInlineNodesToHtml(n.nodes);
    }
  }
  return result;
}

async function wixUpdatePost(
  apiKey: string,
  siteId: string,
  postId: string,
  updates: { title?: string; content?: string; richContent?: unknown }
): Promise<UpdateResult> {
  try {
    // Wix uses PATCH for post updates
    const body: Record<string, unknown> = {};
    if (updates.title) body.title = updates.title;
    if (updates.content) body.content = updates.content;
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
      return shopifyListArticles(creds.shopify_store_url || creds.site_url, creds.shopify_api_key, limit, creds.site_url);
    case "wix":
      if (!creds.wix_api_key || !creds.wix_site_id) return [];
      return wixListPosts(creds.wix_api_key, creds.wix_site_id, limit, creds.site_url);
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
      // Strategy: fetch existing richContent, append link paragraph, PATCH back
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
// WIX CONTENT UPDATE — Fetch existing richContent, append links, PATCH back
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Update Wix post content by fetching existing richContent,
 * extracting newly injected links from the modified HTML,
 * and appending them as Rich Content PARAGRAPH nodes.
 */
async function wixUpdatePostContent(
  apiKey: string, siteId: string, postId: string, newHtml: string
): Promise<UpdateResult> {
  try {
    const hdrs = wixHeaders(apiKey, siteId);

    // Extract new links from the modified HTML
    const allLinksInHtml: { url: string; text: string }[] = [];
    const allLinkRegex = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let allMatch;
    while ((allMatch = allLinkRegex.exec(newHtml)) !== null) {
      allLinksInHtml.push({ url: allMatch[1], text: allMatch[2] });
    }
    if (allLinksInHtml.length === 0) {
      return { success: false, post_id: postId, url: "", error: "Aucun lien trouvé dans le HTML modifié" };
    }

    // Wix Blog v3: published posts must be edited via draft workflow
    // Step 1: Create a draft from the published post
    const createDraftRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/create-from-post/${postId}`,
      { method: "POST", headers: hdrs }
    );
    if (!createDraftRes.ok) {
      const errText = (await createDraftRes.text()).slice(0, 300);
      return { success: false, post_id: postId, url: "", error: `Wix create draft failed (${createDraftRes.status}): ${errText}` };
    }
    const draftData = await createDraftRes.json() as { draftPost: { id: string; richContent?: { nodes?: WixRichNode[] } } };
    const draftId = draftData.draftPost?.id;
    if (!draftId) {
      return { success: false, post_id: postId, url: "", error: "Wix: pas de draftId retourné" };
    }

    // Step 2: Get existing links from the draft to avoid duplicates
    const existingLinks = new Set<string>();
    const existingRc = draftData.draftPost?.richContent;
    function collectLinks(nodes: WixRichNode[]) {
      for (const n of nodes) {
        if (n.textData?.decorations) {
          for (const d of n.textData.decorations) {
            if (d.linkData?.link?.url) existingLinks.add(d.linkData.link.url);
          }
        }
        if (n.linkData?.link?.url) existingLinks.add(n.linkData.link.url);
        if (n.nodes) collectLinks(n.nodes);
      }
    }
    if (existingRc?.nodes) collectLinks(existingRc.nodes);

    const linksToAdd = allLinksInHtml.filter(l => !existingLinks.has(l.url));
    if (linksToAdd.length === 0) {
      return { success: false, post_id: postId, url: "", error: "Liens déjà présents dans l'article" };
    }

    // Step 3: Build new Rich Content nodes
    const newNodes: WixRichNode[] = linksToAdd.map(link => ({
      type: "PARAGRAPH",
      paragraphData: {},
      nodes: [
        { type: "TEXT", textData: { text: "À lire aussi : ", decorations: [] } },
        { type: "TEXT", textData: { text: link.text, decorations: [{ type: "LINK", linkData: { link: { url: link.url } } }] } },
      ],
    }));

    // Step 4: Update the draft with appended richContent
    const updatedNodes = existingRc?.nodes
      ? [...existingRc.nodes, ...newNodes]
      : newNodes;

    const updateDraftRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
      {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ draftPost: { richContent: { nodes: updatedNodes } } }),
      }
    );
    if (!updateDraftRes.ok) {
      const errText = (await updateDraftRes.text()).slice(0, 300);
      return { success: false, post_id: postId, url: "", error: `Wix update draft failed (${updateDraftRes.status}): ${errText}` };
    }

    // Step 5: Publish the draft
    const publishRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`,
      { method: "POST", headers: hdrs }
    );
    if (!publishRes.ok) {
      const errText = (await publishRes.text()).slice(0, 300);
      return { success: false, post_id: postId, url: "", error: `Wix publish draft failed (${publishRes.status}): ${errText}` };
    }
    const pubData = await publishRes.json() as { post?: { id: string; url?: { base: string; path: string } } };
    const url = pubData.post?.url ? `${pubData.post.url.base}${pubData.post.url.path}` : "";
    return { success: true, post_id: pubData.post?.id ?? postId, url };
  } catch (err) {
    return { success: false, post_id: postId, url: "", error: `Wix update error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HTML → DRAFT.JS CONVERSION (kept for potential future use)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Convert HTML to Wix Draft.js format.
 * Handles: p, h1-h3, ul/ol/li, blockquote, and <a> links.
 */
function htmlToDraftContent(html: string): WixContentBlock {
  const blocks: WixDraftBlock[] = [];
  const entityMap: Record<string, WixDraftEntity> = {};
  let entityKey = 0;

  // Split HTML into block-level elements
  // Match tags like <p>, <h2>, <li>, <blockquote> and their content
  const blockRegex = /<(p|h[1-3]|li|blockquote|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let listType: "unordered" | "ordered" | null = null;

  // Process the HTML sequentially to track list context
  let pos = 0;
  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const innerHtml = match[2];

    // Determine list type from context
    if (tag === "li") {
      // Check what list tag is open before this <li>
      const beforeLi = html.slice(pos, match.index);
      const lastOl = beforeLi.lastIndexOf("<ol");
      const lastUl = beforeLi.lastIndexOf("<ul");
      const lastOlEnd = beforeLi.lastIndexOf("</ol");
      const lastUlEnd = beforeLi.lastIndexOf("</ul");
      if (lastOl > lastUl && lastOl > lastOlEnd) listType = "ordered";
      else if (lastUl > lastOl && lastUl > lastUlEnd) listType = "unordered";
    }

    // Extract text and links from inner HTML
    const { text, entityRanges, entities } = extractTextAndLinks(innerHtml, entityKey);
    entityKey += entities.length;

    // Add entities to map
    for (const e of entities) {
      entityMap[String(e.key)] = e.entity;
    }

    // Map tag to Draft.js block type
    let blockType = "unstyled";
    switch (tag) {
      case "h1": blockType = "header-one"; break;
      case "h2": blockType = "header-two"; break;
      case "h3": blockType = "header-three"; break;
      case "li": blockType = listType === "ordered" ? "ordered-list-item" : "unordered-list-item"; break;
      case "blockquote": blockType = "blockquote"; break;
    }

    if (text.trim()) {
      blocks.push({
        key: generateBlockKey(),
        type: blockType,
        text,
        entityRanges,
        data: {},
      });
    }
  }

  // Fallback: if no blocks extracted, create one unstyled block with stripped text
  if (blocks.length === 0) {
    const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped) {
      blocks.push({
        key: generateBlockKey(),
        type: "unstyled",
        text: stripped,
        entityRanges: [],
        data: {},
      });
    }
  }

  return { blocks, entityMap };
}

/** Extract plain text and link entities from inner HTML */
function extractTextAndLinks(
  innerHtml: string,
  startKey: number
): {
  text: string;
  entityRanges: { offset: number; length: number; key: number }[];
  entities: { key: number; entity: WixDraftEntity }[];
} {
  const entityRanges: { offset: number; length: number; key: number }[] = [];
  const entities: { key: number; entity: WixDraftEntity }[] = [];
  let currentKey = startKey;

  // Replace <a> tags with markers, tracking positions
  let text = "";
  const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let lastIndex = 0;
  let linkMatch;

  // Reset the regex
  linkRegex.lastIndex = 0;

  while ((linkMatch = linkRegex.exec(innerHtml)) !== null) {
    // Add text before the link
    const before = innerHtml.slice(lastIndex, linkMatch.index);
    const cleanBefore = before.replace(/<[^>]+>/g, "");
    text += cleanBefore;

    // Add the link text
    const linkText = linkMatch[2].replace(/<[^>]+>/g, "");
    const offset = text.length;
    text += linkText;

    entityRanges.push({ offset, length: linkText.length, key: currentKey });
    entities.push({
      key: currentKey,
      entity: { type: "LINK", data: { url: linkMatch[1], target: "_blank" } },
    });
    currentKey++;
    lastIndex = linkMatch.index + linkMatch[0].length;
  }

  // Add remaining text after last link
  if (lastIndex < innerHtml.length) {
    const after = innerHtml.slice(lastIndex);
    text += after.replace(/<[^>]+>/g, "");
  }

  // Clean up whitespace
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

  return { text, entityRanges, entities };
}

let _blockKeyCounter = 0;
function generateBlockKey(): string {
  _blockKeyCounter++;
  return `bk${Date.now().toString(36)}${_blockKeyCounter.toString(36)}`;
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
