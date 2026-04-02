import { createClient } from "@/lib/supabase/server";
import { publishToWix } from "@/lib/wix";
import { publishToCustomApi } from "@/lib/custom";
import { fetchPexelsImage } from "@/lib/pexels";

async function uploadImageToWordPress(
  siteUrl: string, username: string, appPassword: string,
  imageUrl: string, alt: string
): Promise<number | null> {
  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const imgBuffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    const mediaRes = await fetch(`${siteUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Disposition": `attachment; filename="cover-${Date.now()}.jpg"`,
        "Content-Type": contentType,
      },
      body: imgBuffer,
    });
    if (!mediaRes.ok) return null;
    const media = await mediaRes.json() as { id: number };
    if (media.id && alt) {
      await fetch(`${siteUrl}/wp-json/wp/v2/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}` },
        body: JSON.stringify({ alt_text: alt }),
      }).catch(() => {});
    }
    return media.id ?? null;
  } catch {
    return null;
  }
}

async function publishToWordPress(
  siteUrl: string, username: string, appPassword: string,
  title: string, content: string, metaDescription: string,
  featuredMediaId?: number | null
) {
  const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      title,
      content,
      status: "publish",
      excerpt: metaDescription,
      ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
    }),
  });
  if (!res.ok) throw new Error(`WordPress: ${await res.text()}`);
  const post = await res.json();
  return post.link as string;
}

async function publishToShopify(
  storeUrl: string, apiKey: string,
  title: string, content: string, metaDescription: string,
  imageUrl?: string | null, imageAlt?: string | null
) {
  const baseUrl = storeUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": apiKey,
  };

  // Récupérer ou créer un blog
  const blogsRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, { headers });
  if (!blogsRes.ok) throw new Error(`Shopify blogs: ${await blogsRes.text()}`);
  const blogsData = await blogsRes.json();

  let blogId: number;
  let blogHandle = "news";
  if (blogsData.blogs?.length > 0) {
    blogId = blogsData.blogs[0].id;
    blogHandle = blogsData.blogs[0].handle;
  } else {
    const createBlogRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ blog: { title: "SEO Blog" } }),
    });
    if (!createBlogRes.ok) throw new Error(`Shopify create blog: ${await createBlogRes.text()}`);
    const newBlog = await createBlogRes.json();
    blogId = newBlog.blog.id;
    blogHandle = newBlog.blog.handle;
  }

  // Publier l'article
  const articleRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs/${blogId}/articles.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      article: {
        title,
        body_html: content,
        summary_html: metaDescription,
        published: true,
        ...(imageUrl ? { image: { src: imageUrl, alt: imageAlt || title } } : {}),
      },
    }),
  });
  if (!articleRes.ok) throw new Error(`Shopify article: ${await articleRes.text()}`);
  const article = await articleRes.json();
  return `${baseUrl}/blogs/${blogHandle}/${article.article.handle}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { title, content, meta_description = "", keyword = "", cover_image_query = null, cover_alt_text = null } = await request.json();

    // Lire la config du site de l'utilisateur
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, cms, site_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id, wix_member_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (siteError || !site) {
      return Response.json({ error: "Site non configuré. Faites d'abord l'onboarding." }, { status: 400 });
    }

    let url = "";

    if (site.cms === "wordpress") {
      if (!site.wp_username || !site.wp_app_password) {
        return Response.json({ error: "Identifiants WordPress manquants dans la configuration." }, { status: 400 });
      }
      let featuredMediaId: number | null = null;
      if (cover_image_query) {
        try {
          const pexelsImg = await fetchPexelsImage(cover_image_query);
          if (pexelsImg) {
            featuredMediaId = await uploadImageToWordPress(
              site.site_url, site.wp_username, site.wp_app_password,
              pexelsImg.url, cover_alt_text || title
            );
          }
        } catch (imgErr) {
          console.error("[publish] image fetch/upload failed (non-fatal):", imgErr);
        }
      }
      url = await publishToWordPress(site.site_url, site.wp_username, site.wp_app_password, title, content, meta_description, featuredMediaId);
    } else if (site.cms === "shopify") {
      if (!site.shopify_api_key) {
        return Response.json({ error: "Clé API Shopify manquante dans la configuration." }, { status: 400 });
      }
      let shopifyImageUrl: string | null = null;
      if (cover_image_query) {
        try {
          const pexelsImg = await fetchPexelsImage(cover_image_query);
          if (pexelsImg) shopifyImageUrl = pexelsImg.url;
        } catch (imgErr) {
          console.error("[publish] shopify image fetch failed (non-fatal):", imgErr);
        }
      }
      url = await publishToShopify(site.site_url, site.shopify_api_key, title, content, meta_description, shopifyImageUrl, cover_alt_text);
    } else if (site.cms === "wix") {
      if (!site.wix_api_key || !site.wix_site_id) {
        return Response.json({ error: "Clé API ou Site ID Wix manquants dans la configuration." }, { status: 400 });
      }
      url = await publishToWix(site.wix_api_key, site.wix_site_id, title, content, meta_description, site.site_url, site.wix_member_id, cover_image_query, cover_alt_text);
    } else if (site.cms === "custom") {
      if (!site.custom_api_url) {
        return Response.json({ error: "URL de l'endpoint API manquante dans la configuration." }, { status: 400 });
      }
      url = await publishToCustomApi(site.custom_api_url, site.custom_api_key ?? "", title, content, meta_description, site.site_url);
    } else {
      return Response.json({ error: `CMS non supporté : ${site.cms}` }, { status: 400 });
    }

    // Enregistrer la publication en base
    const { error: insertError } = await supabase.from("publications").insert({
      site_id: site.id,
      user_id: user.id,
      title,
      keyword,
      wordpress_url: url,
      published_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[publish] failed to record publication:", insertError.message);
      // On retourne quand même l'URL — l'article est publié même si l'enregistrement échoue
    }

    return Response.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
