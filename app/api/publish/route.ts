import { createClient } from "@/lib/supabase/server";
import { publishToWix } from "@/lib/wix";
import { publishToCustomApi } from "@/lib/custom";
import { generateImage } from "@/lib/image-gen";
import { injectImagesIntoHtml } from "@/lib/pexels";
import { shopifyFetch } from "@/lib/shopify";
import { addRetroactiveLinks } from "@/lib/internal-linking-engine";
import { notifyGoogleAfterPublish } from "@/lib/gsc-indexing";
import { emitEvent, createPublicationEvent, createMilestoneEvent } from "@/lib/seo-events";
import { recordAction } from "@/lib/seo-feedback";
import { sendArticlePublishedEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import type { CmsCredentials } from "@/lib/cms-update";

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
  imageUrl?: string | null, imageAlt?: string | null,
  publicUrl?: string
) {
  const publicBase = (publicUrl ?? storeUrl).replace(/\/$/, "");

  // Récupérer ou créer un blog
  const blogsRes = await shopifyFetch(storeUrl, apiKey, "blogs.json");
  if (!blogsRes.ok) throw new Error(`Shopify blogs: ${await blogsRes.text()}`);
  const blogsData = await blogsRes.json();

  let blogId: number;
  let blogHandle = "news";
  if (blogsData.blogs?.length > 0) {
    blogId = blogsData.blogs[0].id;
    blogHandle = blogsData.blogs[0].handle;
  } else {
    const createBlogRes = await shopifyFetch(storeUrl, apiKey, "blogs.json", {
      method: "POST",
      body: JSON.stringify({ blog: { title: "SEO Blog" } }),
    });
    if (!createBlogRes.ok) throw new Error(`Shopify create blog: ${await createBlogRes.text()}`);
    const newBlog = await createBlogRes.json();
    blogId = newBlog.blog.id;
    blogHandle = newBlog.blog.handle;
  }

  // Publier l'article
  const articleRes = await shopifyFetch(storeUrl, apiKey, `blogs/${blogId}/articles.json`, {
    method: "POST",
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
  return `${publicBase}/blogs/${blogHandle}/${article.article.handle}`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { title, content: rawContent, meta_description = "", keyword = "", cover_image_query = null, cover_alt_text = null, cover_image_size = null, cover_image_style = null, section_image_queries = [], section_image_alts = [], is_muscade = false } = await request.json();

    // Muscade envoie des prompts DALL-E complets — ne pas les wrapper
    const isMuscadePrompt = is_muscade as boolean;

    // Inject inline images into content
    let content = rawContent as string;
    const imgQueries = (section_image_queries as string[]) ?? [];
    const imgAlts = (section_image_alts as string[]) ?? [];
    if (imgQueries.length > 0) {
      try {
        const imageResults: { url: string; alt: string }[] = [];
        for (let i = 0; i < Math.min(imgQueries.length, 3); i++) {
          const img = await generateImage(imgQueries[i], {
            size: "1024x1024",
            style: "natural",
            rawPrompt: isMuscadePrompt,
          });
          if (img) imageResults.push({ url: img.url, alt: imgAlts[i] || img.alt });
        }
        if (imageResults.length > 0) {
          content = injectImagesIntoHtml(content, imageResults, 3);
          console.log(`[publish] ${imageResults.length} inline images DALL-E injected (Muscade: ${isMuscadePrompt})`);
        }
      } catch (err) {
        console.error("[publish] inline image generation failed (non-fatal):", err);
      }
    }

    // Lire la config du site de l'utilisateur
    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, cms, site_url, business_name, shopify_store_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id, wix_member_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (siteError || !site) {
      return Response.json({ error: "Site non configuré. Faites d'abord l'onboarding." }, { status: 400 });
    }

    let url = "";
    let coverImageUrl: string | null = null;

    // Générer la cover image via DALL-E (prompt Muscade ou query basique)
    if (cover_image_query) {
      try {
        const validSizes = ["1024x1024", "1792x1024", "1024x1792"];
        const validStyles = ["natural", "vivid"];
        const genImg = await generateImage(cover_image_query, {
          size: (validSizes.includes(cover_image_size) ? cover_image_size : "1792x1024") as "1024x1024" | "1792x1024" | "1024x1792",
          style: (validStyles.includes(cover_image_style) ? cover_image_style : "natural") as "natural" | "vivid",
          rawPrompt: isMuscadePrompt,
        });
        if (genImg) coverImageUrl = genImg.url;
      } catch (imgErr) {
        console.error("[publish] cover image generation failed (non-fatal):", imgErr);
      }
    }

    if (site.cms === "wordpress") {
      if (!site.wp_username || !site.wp_app_password) {
        return Response.json({ error: "Identifiants WordPress manquants dans la configuration." }, { status: 400 });
      }
      let featuredMediaId: number | null = null;
      if (coverImageUrl) {
        try {
          featuredMediaId = await uploadImageToWordPress(
            site.site_url, site.wp_username, site.wp_app_password,
            coverImageUrl, cover_alt_text || title
          );
        } catch (imgErr) {
          console.error("[publish] WP image upload failed (non-fatal):", imgErr);
        }
      }
      url = await publishToWordPress(site.site_url, site.wp_username, site.wp_app_password, title, content, meta_description, featuredMediaId);
    } else if (site.cms === "shopify") {
      if (!site.shopify_api_key) {
        return Response.json({ error: "Clé API Shopify manquante dans la configuration." }, { status: 400 });
      }
      url = await publishToShopify(site.shopify_store_url || site.site_url, site.shopify_api_key, title, content, meta_description, coverImageUrl, cover_alt_text, site.site_url);
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

    // Normaliser l'URL publiée — résoudre les relatives
    if (url && !url.startsWith("http")) {
      try { url = new URL(url, site.site_url).href; } catch { /* keep as-is */ }
    }

    // Enregistrer la publication en base (avec l'URL de l'image)
    const { error: insertError } = await supabase.from("publications").insert({
      site_id: site.id,
      user_id: user.id,
      title,
      keyword,
      wordpress_url: url,
      cover_image_url: coverImageUrl,
      published_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("[publish] failed to record publication:", insertError.message, insertError);
      return Response.json({
        url,
        warning: `Article publié mais non enregistré dans le dashboard : ${insertError.message}`,
      });
    }

    // ── Maillage rétroactif (même logique que le cron) ──
    if (url) {
      try {
        const creds: CmsCredentials = {
          cms: site.cms, site_url: site.site_url,
          wp_username: site.wp_username, wp_app_password: site.wp_app_password,
          shopify_api_key: site.shopify_api_key, shopify_store_url: site.shopify_store_url,
          wix_api_key: site.wix_api_key, wix_site_id: site.wix_site_id,
          custom_api_url: site.custom_api_url, custom_api_key: site.custom_api_key,
        };
        const retro = await addRetroactiveLinks(supabase, user.id, creds, { keyword, title, url });
        if (retro.updated_pages.length > 0) {
          logger.info(`[publish] Retroactive linking: ${retro.updated_pages.length} pages updated for "${title}"`);
        }
      } catch (err) {
        logger.warn("Retroactive linking failed (non-blocking)", { context: "publish", userId: user.id, error: err });
      }
    }

    // ── Événements SEO ──
    try {
      const pubEvent = createPublicationEvent(keyword, title, url ?? "");
      await emitEvent(supabase, user.id, pubEvent);
      await recordAction(supabase, user.id, "publication", keyword, url ?? "", null, [], 0);
      const { count } = await supabase
        .from("publications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      const milestoneEvent = createMilestoneEvent(count ?? 0);
      if (milestoneEvent) await emitEvent(supabase, user.id, milestoneEvent);
    } catch (err) {
      logger.warn("SEO event recording failed", { context: "publish", userId: user.id, error: err });
    }

    // ── Notification Google (soumission sitemap) ──
    if (url) {
      try {
        await notifyGoogleAfterPublish(supabase, user.id, url);
      } catch (err) {
        logger.warn("Google sitemap notification failed", { context: "publish", userId: user.id, error: err });
      }
    }

    // ── Email notification ──
    try {
      const userEmail = user.email;
      if (userEmail) {
        await sendArticlePublishedEmail({ to: userEmail, title, keyword, url, businessName: site.business_name ?? "" });
      }
    } catch (err) {
      logger.warn("Email notification failed", { context: "publish", userId: user.id, error: err });
    }

    return Response.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
