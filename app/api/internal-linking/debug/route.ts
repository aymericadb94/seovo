/**
 * Debug endpoint for internal linking — shows raw data to diagnose matching issues.
 * GET /api/internal-linking/debug
 */

import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { listCmsPosts, type CmsCredentials } from "@/lib/cms-update";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Fetch all data sources in parallel
    const [siteRes, cocoonRes, pubsRes] = await Promise.all([
      supabase.from("sites")
        .select("id, site_url, cms, wp_username, wp_app_password, shopify_store_url, shopify_api_key, wix_api_key, wix_site_id, custom_api_url, custom_api_key, gsc_site_url")
        .eq("user_id", user.id).maybeSingle(),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", user.id),
    ]);

    const site = siteRes.data;
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const cocoon = cocoonRes.data?.data as { clusters?: { name: string; pillar: { keyword: string; title: string; url?: string }; support_pages?: { keyword: string; title: string; url?: string }[] }[] } | null;
    const publications = pubsRes.data ?? [];

    // Fetch CMS posts
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

    const cmsPosts = await listCmsPosts(creds, 10); // Only 10 for debug

    // Extract <a> tags from first 3 posts
    const linksInContent: { post_title: string; post_url: string; hrefs: string[]; content_preview: string; content_length: number }[] = [];
    for (const post of cmsPosts.slice(0, 3)) {
      const regex = /<a[^>]+href=["']([^"']+)["']/gi;
      const hrefs: string[] = [];
      let match;
      while ((match = regex.exec(post.content)) !== null) {
        hrefs.push(match[1]);
      }
      linksInContent.push({
        post_title: post.title,
        post_url: post.url,
        hrefs,
        content_preview: post.content.slice(0, 300),
        content_length: post.content.length,
      });
    }

    // Normalize helper
    function normalizeUrl(url: string): string {
      try { return new URL(url).pathname.replace(/\/$/, "").toLowerCase(); }
      catch { return url.replace(/\/$/, "").toLowerCase(); }
    }

    // Check matching
    const matchResults = cmsPosts.slice(0, 5).map(post => {
      const pubMatch = publications.find(p => {
        if (!p.wordpress_url) return false;
        const normPost = normalizeUrl(post.url);
        const normPub = normalizeUrl(p.wordpress_url);
        return normPost === normPub;
      });

      const pubMatchFuzzy = !pubMatch ? publications.find(p => {
        if (!p.wordpress_url) return false;
        const slugPost = normalizeUrl(post.url).split("/").filter(Boolean).pop() ?? "";
        const slugPub = normalizeUrl(p.wordpress_url).split("/").filter(Boolean).pop() ?? "";
        return slugPost.length > 3 && slugPost === slugPub;
      }) : null;

      const pubMatchTitle = !pubMatch && !pubMatchFuzzy ? publications.find(p =>
        p.title?.toLowerCase() === post.title?.toLowerCase()
      ) : null;

      let cocoonMatch: string | null = null;
      const keyword = pubMatch?.keyword ?? pubMatchFuzzy?.keyword ?? pubMatchTitle?.keyword ?? "";
      if (cocoon?.clusters) {
        for (const c of cocoon.clusters) {
          if (c.pillar?.keyword?.toLowerCase() === keyword.toLowerCase() && keyword) {
            cocoonMatch = `pillar in "${c.name}"`;
            break;
          }
          if (c.support_pages?.some(sp => sp.keyword?.toLowerCase() === keyword.toLowerCase()) && keyword) {
            cocoonMatch = `support in "${c.name}"`;
            break;
          }
          // Title match
          if (c.pillar?.title?.toLowerCase() === post.title?.toLowerCase()) {
            cocoonMatch = `pillar in "${c.name}" (by title)`;
            break;
          }
          if (c.support_pages?.some(sp => sp.title?.toLowerCase() === post.title?.toLowerCase())) {
            cocoonMatch = `support in "${c.name}" (by title)`;
            break;
          }
          // Keyword in title
          if (post.title?.toLowerCase().includes(c.pillar?.keyword?.toLowerCase())) {
            cocoonMatch = `pillar in "${c.name}" (keyword in title)`;
            break;
          }
          if (c.support_pages?.some(sp => post.title?.toLowerCase().includes(sp.keyword?.toLowerCase()))) {
            cocoonMatch = `support in "${c.name}" (keyword in title)`;
            break;
          }
        }
      }

      return {
        cms_title: post.title,
        cms_url: post.url,
        cms_url_normalized: normalizeUrl(post.url),
        pub_match: pubMatch ? { keyword: pubMatch.keyword, wp_url: pubMatch.wordpress_url } : null,
        pub_match_fuzzy: pubMatchFuzzy ? { keyword: pubMatchFuzzy.keyword, wp_url: pubMatchFuzzy.wordpress_url } : null,
        pub_match_title: pubMatchTitle ? { keyword: pubMatchTitle.keyword, wp_url: pubMatchTitle.wordpress_url } : null,
        cocoon_match: cocoonMatch,
        keyword_used: keyword || "(empty)",
      };
    });

    return Response.json({
      site_url: site.site_url,
      cms: site.cms,
      cms_posts_count: cmsPosts.length,
      publications_count: publications.length,
      cocoon_clusters_count: cocoon?.clusters?.length ?? 0,
      sample_cms_urls: cmsPosts.slice(0, 5).map(p => p.url),
      sample_pub_urls: publications.slice(0, 5).map(p => ({ keyword: p.keyword, wp_url: p.wordpress_url })),
      sample_cocoon: cocoon?.clusters?.slice(0, 2).map(c => ({
        name: c.name,
        pillar: { keyword: c.pillar?.keyword, title: c.pillar?.title, url: c.pillar?.url },
        supports: c.support_pages?.slice(0, 3).map(sp => ({ keyword: sp.keyword, title: sp.title, url: sp.url })),
      })),
      links_in_content: linksInContent,
      match_results: matchResults,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
