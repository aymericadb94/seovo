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
    const base = siteUrl?.replace(/\/$/, "") ?? "";
    const hdrs = wixHeaders(apiKey, siteId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPosts: any[] = [];
    const perPage = Math.min(limit, 100); // Wix max is 100
    let cursor: string | null = null;

    while (allPosts.length < limit) {
      let url = `https://www.wixapis.com/blog/v3/posts?paging.limit=${perPage}&fieldsets=CONTENT_TEXT&fieldsets=CONTENT&fieldsets=URL`;
      if (cursor) url += `&paging.offset=${allPosts.length}`;
      const res = await fetch(url, { headers: hdrs });
      if (!res.ok) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as { posts?: any[]; metaData?: { cursor?: string; hasNext?: boolean } };
      const posts = data.posts ?? [];
      if (posts.length === 0) break;
      allPosts.push(...posts);
      // Stop if no more pages
      if (!data.metaData?.hasNext || posts.length < perPage) break;
      cursor = data.metaData?.cursor ?? null;
    }

    return allPosts.slice(0, limit).map((p: Record<string, unknown>) => {
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

      // Extract cover image: media.wixMedia.image.url > coverMedia.image.url > null
      const media = p.media as { wixMedia?: { image?: { url?: string } }; image?: { url?: string } } | undefined;
      const coverMedia = p.coverMedia as { image?: { url?: string } } | undefined;
      const featuredImage = media?.wixMedia?.image?.url ?? coverMedia?.image?.url ?? null;

      // Extract publish date
      const firstPublished = (p.firstPublishedDate ?? p.publishedDate ?? p.lastPublishedDate) as string | undefined;

      return {
        id: (p.id as string) ?? "",
        wix_id: (p.id as string) ?? "",
        title,
        content: html,
        url: postUrl,
        excerpt,
        featured_image: featuredImage,
        published_at: firstPublished ? new Date(firstPublished).toISOString() : null,
      };
    });
  } catch {
    return [];
  }
}

async function wixListStaticPages(
  apiKey: string,
  siteId: string,
  siteUrl?: string,
): Promise<CmsPost[]> {
  try {
    const base = siteUrl?.replace(/\/$/, "") ?? "";
    const hdrs = wixHeaders(apiKey, siteId);
    // Wix Site Pages — query all site pages (non-blog)
    const res = await fetch(
      "https://www.wixapis.com/site-properties/v4/properties",
      { headers: hdrs }
    );
    if (!res.ok) {
      // Fallback: use sitemap to discover pages
      const sitemapRes = await fetch(`${base}/sitemap.xml`);
      if (!sitemapRes.ok) return [];
      const sitemapText = await sitemapRes.text();
      const urlMatches = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)];
      const blogPattern = /\/post\//;
      const pages: CmsPost[] = [];
      for (const match of urlMatches) {
        const url = match[1];
        if (blogPattern.test(url)) continue; // Skip blog posts
        // Extract page title from URL slug
        const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
        const title = slug
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase()) || "Page";
        pages.push({
          id: `page-${slug}`,
          title,
          content: "",
          url,
          page_type: "page",
        });
      }
      return pages;
    }
    return [];
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
      const hdrs = wixHeaders(creds.wix_api_key, creds.wix_site_id);
      // Wix uses the draft-posts endpoint for deleting (even published posts)
      // ?permanent=true bypasses trash bin
      const res = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${postId}?permanent=true`,
        { method: "DELETE", headers: hdrs }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[Wix DELETE] postId=${postId} status=${res.status} body=${body}`);
        return { success: false, post_id: postId, error: `Wix DELETE failed: ${res.status} — ${body}` };
      }
      return { success: true, post_id: postId };
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
  const hdrs = wixHeaders(apiKey, siteId);
  let draftId: string | null = null;

  // Helper: republish a draft to restore the original published state
  async function republishDraft(id: string): Promise<void> {
    try {
      console.log(`[wix/update] Republishing draft ${id} to restore original state`);
      await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${id}/publish`, { method: "POST", headers: hdrs });
    } catch (e) {
      console.error(`[wix/update] Failed to republish draft ${id}:`, e);
    }
  }

  try {
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

    // Wix Blog v3: published posts are read-only → use draft workflow
    // Strategy A: Try to revert published post to draft
    // Strategy B: Check if a draft already exists for this post
    // Strategy C: Try PATCH directly on the post (some Wix versions allow it)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let draftData: any = null;
    // Track content format: some old Wix posts use DraftJS (content.blocks), not richContent
    let contentFormat: "richContent" | "draftJS" = "richContent";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingDraftJSContent: any = null;

    // STEP 0: Fetch existing content BEFORE any mutation (critical safety)
    let existingFullNodes: WixRichNode[] = [];
    let originalNodeCount = 0;
    let originalBlockCount = 0;

    // Try multiple fieldsets — Wix API is inconsistent about which one returns content
    for (const fs of ["CONTENT_TEXT", "CONTENT", "GENERATED_CONTENT"]) {
      if (existingFullNodes.length > 0) break;
      try {
        const getFullRes = await fetch(
          `https://www.wixapis.com/blog/v3/posts/${postId}?fieldsets=${fs}`,
          { headers: hdrs }
        );
        if (getFullRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fullData = await getFullRes.json() as any;
          const nodes = fullData.post?.richContent?.nodes ?? [];
          if (nodes.length > existingFullNodes.length) {
            existingFullNodes = nodes;
          }
          // Also check DraftJS format
          if (nodes.length === 0 && fullData.post?.content?.blocks?.length > 0) {
            contentFormat = "draftJS";
            existingDraftJSContent = fullData.post.content;
            originalBlockCount = fullData.post.content.blocks.length;
          }
        }
      } catch { /* try next fieldset */ }
    }
    originalNodeCount = existingFullNodes.length;

    // SAFETY GATE: Do NOT proceed if we have no content at all — refuse to risk data loss
    if (existingFullNodes.length === 0 && !existingDraftJSContent) {
      return { success: false, post_id: postId, url: "", error: "Wix: impossible de récupérer le contenu existant — abandon par sécurité (aucun fieldset n'a retourné de contenu)" };
    }

    // SAFETY GATE: Content must have substantial content (at least 3 nodes/blocks)
    const contentSize = existingFullNodes.length || originalBlockCount;
    if (contentSize < 3) {
      return { success: false, post_id: postId, url: "", error: `Wix: contenu récupéré trop court (${contentSize} éléments) — abandon par sécurité pour éviter l'écrasement` };
    }

    console.log(`[wix/update] Post ${postId}: ${originalNodeCount} richContent nodes, ${originalBlockCount} draftJS blocks, format=${contentFormat}`);

    // Strategy A: Try revert to get a draft
    const revertRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/revert/${postId}`,
      { method: "POST", headers: hdrs }
    );
    if (revertRes.ok) {
      draftData = await revertRes.json();
      draftId = draftData?.draftPost?.id ?? null;
      // If revert returned content and we didn't have any, use it (but verify it's substantial)
      if (existingFullNodes.length === 0) {
        const revertNodes = draftData?.draftPost?.richContent?.nodes ?? [];
        if (revertNodes.length >= 3) {
          existingFullNodes = revertNodes;
          originalNodeCount = revertNodes.length;
        }
      }
      // Check DraftJS from revert
      if (existingFullNodes.length === 0 && !existingDraftJSContent && draftData?.draftPost?.content?.blocks?.length >= 3) {
        contentFormat = "draftJS";
        existingDraftJSContent = draftData.draftPost.content;
        originalBlockCount = draftData.draftPost.content.blocks.length;
      }
    }

    // Strategy B: Find existing draft
    if (!draftId) {
      const listRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts?paging.limit=100&fieldsets=CONTENT_TEXT`,
        { headers: hdrs }
      );
      if (listRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listData = await listRes.json() as { draftPosts?: any[] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = listData.draftPosts?.find((d: any) => d.postId === postId || d.id === postId);
        if (match) {
          draftId = match.id;
          draftData = { draftPost: match };
          if (existingFullNodes.length === 0) {
            const matchNodes = match.richContent?.nodes ?? [];
            if (matchNodes.length >= 3) {
              existingFullNodes = matchNodes;
              originalNodeCount = matchNodes.length;
            }
          }
        }
      }
    }

    // If we still have no content from any source, try fetching draft directly
    if (existingFullNodes.length === 0 && !existingDraftJSContent && draftId) {
      const getDraftRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${draftId}?fieldsets=CONTENT_TEXT`,
        { headers: hdrs }
      );
      if (getDraftRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draftFullData = await getDraftRes.json() as any;
        const draftNodes = draftFullData.draftPost?.richContent?.nodes ?? [];
        if (draftNodes.length >= 3) {
          existingFullNodes = draftNodes;
          originalNodeCount = draftNodes.length;
        }
        if (existingFullNodes.length === 0 && draftFullData.draftPost?.content?.blocks?.length >= 3) {
          contentFormat = "draftJS";
          existingDraftJSContent = draftFullData.draftPost.content;
          originalBlockCount = draftFullData.draftPost.content.blocks.length;
        }
      }
    }

    // FINAL SAFETY: re-verify content after all strategies
    if (existingFullNodes.length === 0 && !existingDraftJSContent) {
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: "Wix: impossible de récupérer le contenu existant — abandon par sécurité" };
    }

    // ── DraftJS format path ──────────────────────────────────────────────
    if (contentFormat === "draftJS" && existingDraftJSContent && draftId) {
      const blocks = existingDraftJSContent.blocks as { text: string; entityRanges?: { key: number }[] }[];
      const entityMap = existingDraftJSContent.entityMap as Record<string, { type: string; data: { url?: string } }>;

      // Collect existing link URLs
      const existingLinkUrls = new Set<string>();
      for (const [, entity] of Object.entries(entityMap)) {
        if (entity.type === "LINK" && entity.data?.url) {
          existingLinkUrls.add(entity.data.url);
        }
      }

      const linksToAdd = allLinksInHtml.filter(l => !existingLinkUrls.has(l.url));
      if (linksToAdd.length === 0) {
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: "Liens déjà présents dans l'article" };
      }

      // Append new blocks in DraftJS format
      let nextEntityKey = Math.max(0, ...Object.keys(entityMap).map(Number).filter(n => !isNaN(n))) + 1;
      const newBlocks = [];
      const newEntities: Record<string, { type: string; mutability: string; data: { url: string; target: string } }> = {};

      for (const link of linksToAdd) {
        const text = `À lire aussi : ${link.text}`;
        const offset = 15; // "À lire aussi : ".length
        newBlocks.push({
          key: Math.random().toString(36).slice(2, 7),
          text,
          type: "unstyled",
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [{ key: nextEntityKey, offset, length: link.text.length }],
          data: {},
        });
        newEntities[String(nextEntityKey)] = {
          type: "LINK",
          mutability: "MUTABLE",
          data: { url: link.url, target: "_blank" },
        };
        nextEntityKey++;
      }

      const updatedBlocks = [...blocks, ...newBlocks];
      // SAFETY: updated content must be LARGER than original (we only append)
      if (updatedBlocks.length < blocks.length) {
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: `Wix: safety check failed — updated blocks (${updatedBlocks.length}) < original (${blocks.length})` };
      }

      const updatedContent = {
        ...existingDraftJSContent,
        blocks: updatedBlocks,
        entityMap: { ...entityMap, ...newEntities },
      };

      const updateDraftRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
        {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({ draftPost: { content: updatedContent }, fieldMask: ["content"] }),
        }
      );
      if (!updateDraftRes.ok) {
        const errText = (await updateDraftRes.text()).slice(0, 300);
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: `Wix update draft failed (${updateDraftRes.status}): ${errText}` };
      }

      // Verify the draft content before publishing
      const verifyRes = await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${draftId}?fieldsets=CONTENT_TEXT`, { headers: hdrs });
      if (verifyRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const verifyData = await verifyRes.json() as any;
        const verifyBlocks = verifyData.draftPost?.content?.blocks?.length ?? 0;
        if (verifyBlocks < blocks.length) {
          console.error(`[wix/update] ABORT: draft has ${verifyBlocks} blocks but original had ${blocks.length} — would lose content`);
          await republishDraft(draftId);
          return { success: false, post_id: postId, url: "", error: `Wix: abandon — le brouillon (${verifyBlocks} blocs) a moins de contenu que l'original (${blocks.length} blocs)` };
        }
      }

      // Publish
      const publishRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`,
        { method: "POST", headers: hdrs }
      );
      if (!publishRes.ok) {
        const errText = (await publishRes.text()).slice(0, 300);
        return { success: false, post_id: postId, url: "", error: `Wix publish draft failed (${publishRes.status}): ${errText}` };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pubData = await publishRes.json() as any;
      const url = pubData.post?.url ? `${pubData.post.url.base}${pubData.post.url.path}` : "";
      return { success: true, post_id: pubData.post?.id ?? postId, url };
    }

    // ── richContent format path (standard) ───────────────────────────────

    // Strategy C: Try direct PATCH on published post as last resort
    if (!draftId) {
      // Check which links already exist
      const existingLinkUrls = new Set<string>();
      function scanNodes(nodes: WixRichNode[]) {
        for (const n of nodes) {
          if (n.textData?.decorations) {
            for (const d of n.textData.decorations) {
              if (d.linkData?.link?.url) existingLinkUrls.add(d.linkData.link.url);
            }
          }
          if (n.nodes) scanNodes(n.nodes as WixRichNode[]);
        }
      }
      scanNodes(existingFullNodes);

      const linksToAdd = allLinksInHtml.filter(l => !existingLinkUrls.has(l.url));
      if (linksToAdd.length === 0) {
        return { success: false, post_id: postId, url: "", error: "Liens déjà présents dans l'article" };
      }

      const newNodes: WixRichNode[] = linksToAdd.map(link => ({
        type: "PARAGRAPH",
        paragraphData: {},
        nodes: [
          { type: "TEXT", textData: { text: "À lire aussi : ", decorations: [] } },
          { type: "TEXT", textData: { text: link.text, decorations: [{ type: "LINK", linkData: { link: { url: link.url } } }] } },
        ],
      }));

      // SAFETY: existingFullNodes must have substantial content
      if (existingFullNodes.length < 3) {
        return { success: false, post_id: postId, url: "", error: `Wix: contenu existant trop court (${existingFullNodes.length} nodes) — abandon pour éviter l'écrasement` };
      }

      const mergedNodes = [...existingFullNodes, ...newNodes];
      console.log(`[wix/update] Direct PATCH: ${existingFullNodes.length} existing + ${newNodes.length} new = ${mergedNodes.length} total`);

      const directRes = await fetch(
        `https://www.wixapis.com/blog/v3/posts/${postId}`,
        {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({ post: { richContent: { nodes: mergedNodes } }, fieldMask: ["richContent"] }),
        }
      );
      if (directRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await directRes.json() as any;
        const url = data.post?.url ? `${data.post.url.base}${data.post.url.path}` : "";
        return { success: true, post_id: data.post?.id ?? postId, url };
      }

      return { success: false, post_id: postId, url: "", error: `Wix: impossible de créer un brouillon (revert=${revertRes.status}, direct PATCH=${directRes.status})` };
    }

    // Step 2: Get existing links from the draft to avoid duplicates
    const existingLinks = new Set<string>();
    const existingRc = draftData?.draftPost?.richContent as { nodes?: WixRichNode[] } | undefined;
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
      if (draftId) await republishDraft(draftId);
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
    const baseNodes = (existingRc?.nodes?.length ?? 0) > 0 ? existingRc!.nodes! : existingFullNodes;

    // SAFETY: baseNodes must have substantial content
    if (baseNodes.length < 3) {
      console.error(`[wix/update] ABORT: baseNodes only has ${baseNodes.length} nodes — would lose content`);
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: `Wix: contenu de base trop court (${baseNodes.length} nodes) — abandon pour éviter l'écrasement` };
    }

    const updatedNodes = [...baseNodes, ...newNodes];
    console.log(`[wix/update] Post ${postId}: ${baseNodes.length} base nodes + ${newNodes.length} new = ${updatedNodes.length} total`);

    const updateDraftRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
      {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ draftPost: { richContent: { nodes: updatedNodes } }, fieldMask: ["richContent"] }),
      }
    );
    if (!updateDraftRes.ok) {
      const errText = (await updateDraftRes.text()).slice(0, 300);
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: `Wix update draft failed (${updateDraftRes.status}): ${errText}` };
    }

    // SAFETY: verify draft content before publishing
    const verifyDraftRes = await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${draftId}?fieldsets=CONTENT_TEXT`, { headers: hdrs });
    if (verifyDraftRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verifyData = await verifyDraftRes.json() as any;
      const verifyNodeCount = verifyData.draftPost?.richContent?.nodes?.length ?? 0;
      if (verifyNodeCount < baseNodes.length) {
        console.error(`[wix/update] ABORT PUBLISH: draft has ${verifyNodeCount} nodes but original had ${baseNodes.length} — content loss detected`);
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: `Wix: abandon — le brouillon (${verifyNodeCount} nodes) a moins de contenu que l'original (${baseNodes.length} nodes)` };
      }
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
    // If we have a draft from revert, republish it to restore original state
    if (draftId) await republishDraft(draftId);
    return { success: false, post_id: postId, url: "", error: `Wix update error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// WIX: FETCH RAW POSTS (with richContent / DraftJS intact)
// ══════════════════════════════════════════════════════════════════════════════

export type WixRawPost = {
  id: string;
  title: string;
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  richContentNodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftJSContent: any | null;
  contentFormat: "richContent" | "draftJS";
};

/**
 * Fetch all Wix posts with their raw richContent/DraftJS content intact.
 * Uses the LIST endpoint which reliably returns content (unlike GET single post).
 */
export async function wixListRawPosts(
  apiKey: string, siteId: string, limit: number = 200, siteUrl?: string
): Promise<WixRawPost[]> {
  const hdrs = wixHeaders(apiKey, siteId);
  const base = siteUrl?.replace(/\/$/, "") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPosts: any[] = [];
  const perPage = Math.min(limit, 100);

  while (allPosts.length < limit) {
    let url = `https://www.wixapis.com/blog/v3/posts?paging.limit=${perPage}&fieldsets=CONTENT_TEXT&fieldsets=CONTENT&fieldsets=URL`;
    if (allPosts.length > 0) url += `&paging.offset=${allPosts.length}`;
    const res = await fetch(url, { headers: hdrs });
    if (!res.ok) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as { posts?: any[]; metaData?: { hasNext?: boolean } };
    const posts = data.posts ?? [];
    if (posts.length === 0) break;
    allPosts.push(...posts);
    if (!data.metaData?.hasNext || posts.length < perPage) break;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return allPosts.slice(0, limit).map((p: any) => {
    const title = p.title ?? "";
    const slug = p.slug ?? "";
    const urlObj = p.url as { base?: string; path?: string } | undefined;
    let postUrl = "";
    if (urlObj?.base && urlObj?.path) postUrl = `${urlObj.base}${urlObj.path}`;
    else if (slug) postUrl = `${base}/post/${slug}`;

    const richNodes = p.richContent?.nodes ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let draftJS: any = null;
    let format: "richContent" | "draftJS" = "richContent";

    if (richNodes.length === 0) {
      // Try DraftJS: content might be a string (JSON) or object with blocks
      let raw = p.content;
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { /* not JSON */ }
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = raw as any;
        if (Array.isArray(obj.blocks) && obj.blocks.length > 0) {
          format = "draftJS";
          draftJS = obj;
        }
      }
    }

    return {
      id: p.id ?? "",
      title,
      url: postUrl,
      richContentNodes: richNodes,
      draftJSContent: draftJS,
      contentFormat: format,
    };
  });
}

/**
 * Apply a content patch to a Wix post using 3 strategies with fallbacks:
 * 1. Try direct PATCH on published post
 * 2. Try revert-to-draft → PATCH draft → publish
 * 3. Try listing existing drafts → PATCH draft → publish
 */
async function wixPatchContent(
  hdrs: Record<string, string>,
  postId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patchPayload: Record<string, any>,
  fieldMaskField: string
): Promise<{ success: boolean; error?: string }> {
  // Strategy 1: Direct PATCH on published post
  const directRes = await fetch(
    `https://www.wixapis.com/blog/v3/posts/${postId}`,
    {
      method: "PATCH",
      headers: hdrs,
      body: JSON.stringify({ post: patchPayload, fieldMask: [fieldMaskField] }),
    }
  );
  if (directRes.ok) {
    return { success: true };
  }

  // Strategy 2: Revert to draft → PATCH → publish
  let draftId: string | null = null;
  const revertRes = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/revert/${postId}`,
    { method: "POST", headers: hdrs }
  );
  if (revertRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const revertData = await revertRes.json() as any;
    draftId = revertData?.draftPost?.id ?? null;
  } else {
  }

  // Strategy 3: Find existing draft
  if (!draftId) {
    const listRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts?paging.limit=100`,
      { headers: hdrs }
    );
    if (listRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listData = await listRes.json() as { draftPosts?: any[] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = listData.draftPosts?.find((d: any) => d.postId === postId || d.id === postId);
      if (match) {
        draftId = match.id;
      }
    }
  }

  if (!draftId) {
    return { success: false, error: `Impossible de modifier le post Wix (direct PATCH=${directRes.status}, revert=${revertRes.status})` };
  }

  // PATCH the draft
  const draftPatchPayload: Record<string, unknown> = { draftPost: patchPayload, fieldMask: [fieldMaskField] };
  const patchRes = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
    { method: "PATCH", headers: hdrs, body: JSON.stringify(draftPatchPayload) }
  );
  if (!patchRes.ok) {
    // Republish the draft to restore original state
    await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`, { method: "POST", headers: hdrs }).catch(() => {});
    return { success: false, error: `Draft PATCH failed: ${patchRes.status}` };
  }

  // Publish the draft
  const pubRes = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`,
    { method: "POST", headers: hdrs }
  );
  if (!pubRes.ok) {
    return { success: false, error: `Draft publish failed: ${pubRes.status}` };
  }

  return { success: true };
}

/**
 * Remove broken internal links from a Wix post by working directly on the
 * native content format (richContent or DraftJS).
 *
 * IMPORTANT: rawPost must come from wixListRawPosts (LIST endpoint returns content,
 * single GET endpoint does NOT).
 */
export async function wixRemoveBrokenLinks(
  apiKey: string,
  siteId: string,
  rawPost: WixRawPost,
  isBrokenUrl: (href: string) => boolean,
  extra?: { supabase?: SupabaseClient; userId?: string }
): Promise<{ removed: number; brokenUrls: string[]; error?: string }> {
  const hdrs = wixHeaders(apiKey, siteId);
  const postId = rawPost.id;

  try {
    const richContentNodes = rawPost.richContentNodes;
    const draftJSContent = rawPost.draftJSContent;
    const contentFormat = rawPost.contentFormat;

    if (richContentNodes.length === 0 && !draftJSContent) {
      return { removed: -1, brokenUrls: [], error: "Pas de contenu dans le post" };
    }

    // ── Snapshot (safety) ──
    if (extra?.supabase && extra?.userId) {
      try {
        const currentPost = await getCmsPost(
          { cms: "wix", site_url: "", wix_api_key: apiKey, wix_site_id: siteId } as CmsCredentials,
          postId
        );
        if (currentPost) {
          await saveSnapshot(extra.supabase, extra.userId, currentPost, "cleanup_broken_links");
        }
      } catch { /* non-fatal */ }
    }

    const brokenUrls: string[] = [];
    let removed = 0;

    // ── richContent path ──
    if (contentFormat === "richContent" && richContentNodes.length > 0) {
      function cleanNodes(nodes: WixRichNode[]): WixRichNode[] {
        const result: WixRichNode[] = [];
        for (const node of nodes) {
          if (node.type === "PARAGRAPH" && node.nodes) {
            const textParts = node.nodes.filter((n: WixRichNode) => n.type === "TEXT");
            const fullText = textParts.map((n: WixRichNode) => n.textData?.text ?? "").join("");
            if (fullText.toLowerCase().includes("à lire aussi")) {
              const linkNodes = textParts.filter((n: WixRichNode) =>
                n.textData?.decorations?.some((d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK")
              );
              const allBroken = linkNodes.length > 0 && linkNodes.every((n: WixRichNode) => {
                const linkDecor = n.textData?.decorations?.find((d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK");
                const url = linkDecor?.linkData?.link?.url ?? "";
                return url && isBrokenUrl(url);
              });
              if (allBroken) {
                for (const n of linkNodes) {
                  const url = n.textData?.decorations?.find((d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK")?.linkData?.link?.url ?? "";
                  brokenUrls.push(url);
                  removed++;
                }
                continue;
              }
            }
          }

          if (node.nodes) {
            const cleanedChildren: WixRichNode[] = [];
            for (const child of node.nodes) {
              if (child.type === "TEXT" && child.textData?.decorations) {
                const linkDecor = child.textData.decorations.find(
                  (d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK"
                );
                if (linkDecor?.linkData?.link?.url && isBrokenUrl(linkDecor.linkData.link.url)) {
                  brokenUrls.push(linkDecor.linkData.link.url);
                  removed++;
                  cleanedChildren.push({
                    ...child,
                    textData: {
                      ...child.textData,
                      decorations: child.textData.decorations.filter(
                        (d: { type: string }) => d.type !== "LINK"
                      ),
                    },
                  });
                  continue;
                }
              }
              if (child.nodes) {
                cleanedChildren.push({ ...child, nodes: cleanNodes(child.nodes) });
              } else {
                cleanedChildren.push(child);
              }
            }
            result.push({ ...node, nodes: cleanedChildren });
          } else {
            result.push(node);
          }
        }
        return result;
      }

      const cleanedNodes = cleanNodes(richContentNodes as WixRichNode[]);
      if (removed === 0) return { removed: 0, brokenUrls: [] };

      // Apply the cleaned content to Wix (3 strategies with fallbacks)
      const patchResult = await wixPatchContent(hdrs, postId, { richContent: { nodes: cleanedNodes } }, "richContent");
      if (!patchResult.success) {
        return { removed: -1, brokenUrls, error: patchResult.error ?? "PATCH failed" };
      }
      return { removed, brokenUrls };
    }

    // ── DraftJS path ──
    if (contentFormat === "draftJS" && draftJSContent) {
      const blocks = [...(draftJSContent.blocks as WixDraftBlock[])];
      const entityMap = { ...(draftJSContent.entityMap ?? {}) } as Record<string, WixDraftEntity>;

      const brokenEntityKeys = new Set<number>();
      for (const [key, entity] of Object.entries(entityMap)) {
        if (entity.type === "LINK") {
          const url = entity.data?.url ?? entity.data?.href ?? "";
          if (url && isBrokenUrl(url)) {
            brokenEntityKeys.add(Number(key));
            brokenUrls.push(url);
            removed++;
          }
        }
      }

      if (removed === 0) return { removed: 0, brokenUrls: [] };

      const cleanedBlocks = blocks.filter(block => {
        if (block.text.toLowerCase().includes("à lire aussi")) {
          const hasOnlyBrokenLinks = (block.entityRanges ?? []).every(r => brokenEntityKeys.has(r.key));
          if (hasOnlyBrokenLinks && (block.entityRanges ?? []).length > 0) return false;
        }
        return true;
      });

      for (const block of cleanedBlocks) {
        if (block.entityRanges) {
          block.entityRanges = block.entityRanges.filter(r => !brokenEntityKeys.has(r.key));
        }
      }

      const cleanedEntityMap = { ...entityMap };
      for (const key of brokenEntityKeys) {
        delete cleanedEntityMap[String(key)];
      }

      const patchResult = await wixPatchContent(
        hdrs, postId,
        { content: { blocks: cleanedBlocks, entityMap: cleanedEntityMap } },
        "content"
      );
      if (!patchResult.success) {
        return { removed: -1, brokenUrls, error: patchResult.error ?? "PATCH failed" };
      }
      return { removed, brokenUrls };
    }

    return { removed: 0, brokenUrls: [] };
  } catch (err) {
    return { removed: -1, brokenUrls: [], error: err instanceof Error ? err.message : "Unknown error" };
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
