/**
 * Delete Publication API
 *
 * Deletes an article/page from the CMS and removes it from the publications table.
 * Requires post_id and url to identify the content.
 */

import { createClient } from "@/lib/supabase/server";
import { deleteCmsPost, listCmsPosts, updateCmsPost, removeLinksToUrl, type CmsCredentials } from "@/lib/cms-update";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "delete-publication", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const { post_id, url, blog_id } = await request.json() as {
      post_id: string | number;
      url: string;
      blog_id?: number;
    };

    if (!post_id || !url) {
      return Response.json({ error: "post_id et url requis" }, { status: 400 });
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

    // Delete from CMS
    const result = await deleteCmsPost(creds, post_id, { blog_id });

    if (!result.success) {
      return Response.json({ error: result.error ?? "Échec de la suppression CMS" }, { status: 500 });
    }

    // Remove from publications table
    const normalizedUrl = url.replace(/\/$/, "").toLowerCase();
    await supabase
      .from("publications")
      .delete()
      .eq("user_id", user.id)
      .ilike("wordpress_url", `%${normalizedUrl.split("/").pop()}%`);

    // Clean up broken links in other articles pointing to the deleted URL
    let cleanedCount = 0;
    try {
      const allPosts = await listCmsPosts(creds, 200);
      for (const post of allPosts) {
        if (!post.content.toLowerCase().includes(normalizedUrl)) continue;
        const { html: cleanedHtml, removed } = removeLinksToUrl(post.content, url);
        if (removed > 0) {
          const blogId = "blog_id" in post ? (post as { blog_id: number }).blog_id : undefined;
          await updateCmsPost(creds, post.id, { content: cleanedHtml }, { blog_id: blogId, supabase, userId: user.id, actionType: "remove_links_on_delete" });
          cleanedCount += removed;
        }
      }
    } catch { /* non-blocking — links cleanup is best-effort */ }

    // Invalidate cached linking analysis
    try {
      await supabase
        .from("internal_linking")
        .delete()
        .eq("user_id", user.id);
    } catch { /* non-blocking */ }

    return Response.json({ success: true, post_id, cleaned_links: cleanedCount });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
