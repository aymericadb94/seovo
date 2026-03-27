import { createClient } from "@/lib/supabase/server";
import { publishToWix } from "@/lib/wix";

async function publishToWordPress(
  siteUrl: string, username: string, appPassword: string,
  title: string, content: string, metaDescription: string
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
    }),
  });
  if (!res.ok) throw new Error(`WordPress: ${await res.text()}`);
  const post = await res.json();
  return post.link as string;
}

async function publishToShopify(
  storeUrl: string, apiKey: string,
  title: string, content: string, metaDescription: string
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

    const { title, content, meta_description = "", keyword = "" } = await request.json();

    // Lire la config du site de l'utilisateur
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, cms, site_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id")
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
      url = await publishToWordPress(site.site_url, site.wp_username, site.wp_app_password, title, content, meta_description);
    } else if (site.cms === "shopify") {
      if (!site.shopify_api_key) {
        return Response.json({ error: "Clé API Shopify manquante dans la configuration." }, { status: 400 });
      }
      url = await publishToShopify(site.site_url, site.shopify_api_key, title, content, meta_description);
    } else if (site.cms === "wix") {
      if (!site.wix_api_key || !site.wix_site_id) {
        return Response.json({ error: "Clé API ou Site ID Wix manquants dans la configuration." }, { status: 400 });
      }
      url = await publishToWix(site.wix_api_key, site.wix_site_id, title, content, meta_description);
    } else {
      return Response.json({ error: `CMS non supporté : ${site.cms}` }, { status: 400 });
    }

    // Enregistrer la publication en base
    await supabase.from("publications").insert({
      site_id: site.id,
      user_id: user.id,
      title,
      keyword,
      wordpress_url: url,
    });

    return Response.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
