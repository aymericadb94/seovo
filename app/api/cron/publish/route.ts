import { createClient } from "@supabase/supabase-js";
import { sendArticlePublishedEmail } from "@/lib/email";
import { publishToWix } from "@/lib/wix";
import { publishToCustomApi } from "@/lib/custom";
import { fetchPexelsImage, fetchPexelsImages, injectImagesIntoHtml } from "@/lib/pexels";
import { emitEvent, createPublicationEvent, createMilestoneEvent } from "@/lib/seo-events";
import { recordAction } from "@/lib/seo-feedback";
import { shopifyFetch } from "@/lib/shopify";
import { logger } from "@/lib/logger";
import { addRetroactiveLinks } from "@/lib/internal-linking-engine";
import type { CmsCredentials } from "@/lib/cms-update";
import { runGenerationPipeline } from "@/lib/generation-pipeline";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Publication WordPress ────────────────────────────────────────────────────

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
        "ngrok-skip-browser-warning": "true",
      },
      body: imgBuffer,
    });
    if (!mediaRes.ok) return null;
    const media = await mediaRes.json() as { id: number };
    if (media.id && alt) {
      await fetch(`${siteUrl}/wp-json/wp/v2/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}`, "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ alt_text: alt }),
      }).catch(() => {});
    }
    return media.id ?? null;
  } catch { return null; }
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
      "ngrok-skip-browser-warning": "true",
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

// ── Publication Shopify ──────────────────────────────────────────────────────

async function publishToShopify(
  storeUrl: string, apiKey: string,
  title: string, content: string, metaDescription: string,
  imageUrl?: string | null, imageAlt?: string | null,
  publicUrl?: string
) {
  const publicBase = (publicUrl ?? storeUrl).replace(/\/$/, "");

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
      body: JSON.stringify({ blog: { title: "Actualités SEO" } }),
    });
    if (!createBlogRes.ok) throw new Error(`Shopify create blog: ${await createBlogRes.text()}`);
    const newBlog = await createBlogRes.json();
    blogId = newBlog.blog.id;
    blogHandle = newBlog.blog.handle;
  }

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

export const maxDuration = 600;

// ── Handler principal ────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const isManual = url.searchParams.get("manual") === "1";
  const isForced = url.searchParams.get("force") === "1";

  const supabase = createAdminClient();
  const results: { site: string; cms: string; status: string; title?: string; url?: string; keyword?: string; error?: string }[] = [];

  try {
    let query = supabase.from("sites").select("*");
    if (userId) query = query.eq("user_id", userId);
    const { data: sites, error } = await query;

    if (error) throw new Error(error.message);
    if (!sites || sites.length === 0) {
      return Response.json({ message: "Aucun site à traiter", results: [] });
    }

    for (const site of sites) {
      try {
        logger.info(`[cron] Processing site "${site.site_url}" (cms: ${site.cms}, user: ${site.user_id})`);

        // Vérifier que le CMS est configuré
        const cmsConfigured =
          (site.cms === "wordpress" && site.wp_username && site.wp_app_password) ||
          (site.cms === "shopify" && site.shopify_api_key) ||
          (site.cms === "wix" && site.wix_api_key && site.wix_site_id) ||
          (site.cms === "custom" && site.custom_api_url && site.custom_api_key);
        if (!cmsConfigured) {
          logger.warn(`[cron] Site "${site.site_url}": CMS "${site.cms}" non configuré (identifiants manquants)`);
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: "CMS non configuré (identifiants manquants)" });
          continue;
        }

        // Source de mots-clés : roadmap d'abord, puis site.keywords en fallback
        const siteKeywords: string[] = site.keywords ?? [];

        const { data: roadmapRow } = await supabase
          .from("roadmaps")
          .select("data")
          .eq("user_id", site.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const roadmapKeywords: string[] = ((roadmapRow?.data?.articles ?? []) as { keyword: string; priority: number }[])
          .filter(a => a.keyword)
          .sort((a, b) => a.priority - b.priority)
          .map(a => a.keyword);

        const allKeywords = [...new Set([...roadmapKeywords, ...siteKeywords])];

        if (allKeywords.length === 0) {
          logger.warn(`[cron] Site "${site.site_url}": aucun mot-clé (roadmap: ${roadmapKeywords.length}, site: ${siteKeywords.length})`);
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: "Aucun mot-clé configuré (ni roadmap, ni site)" });
          continue;
        }

        const { count: publicationsCount } = await supabase
          .from("publications")
          .select("*", { count: "exact", head: true })
          .eq("site_id", site.id);

        const totalPublished = publicationsCount ?? 0;

        // Limite journalière
        const dailyMax = 3;
        const startOfTodayUtc = new Date();
        startOfTodayUtc.setUTCHours(0, 0, 0, 0);
        const { count: pubsTodayCount } = await supabase
          .from("publications")
          .select("*", { count: "exact", head: true })
          .eq("site_id", site.id)
          .gte("published_at", startOfTodayUtc.toISOString());
        const pubsToday = pubsTodayCount ?? 0;

        if (pubsToday >= dailyMax && !isForced) {
          logger.info(`[cron] Site "${site.site_url}": limite journalière (${pubsToday}/${dailyMax})`);
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: `Limite journalière atteinte (${pubsToday}/${dailyMax})` });
          continue;
        }

        // Langues cibles
        const targetLanguages: string[] = site.target_languages?.length > 0
          ? site.target_languages
          : ["fr"];

        // Fréquence
        const remaining = dailyMax - pubsToday;
        const frequency = isManual ? 1 : Math.min(Math.max(1, site.frequency ?? 1), remaining);

        // Mots-clés déjà publiés
        const { data: publishedPubs } = await supabase
          .from("publications")
          .select("keyword")
          .eq("site_id", site.id);
        const publishedKeywords = new Set(
          (publishedPubs ?? []).map(p => p.keyword?.toLowerCase()).filter(Boolean)
        );

        function getNextKeywords(count: number): string[] {
          const result: string[] = [];

          // 1. Roadmap keywords (priorité)
          for (const kw of roadmapKeywords) {
            if (result.length >= count) break;
            if (!publishedKeywords.has(kw.toLowerCase())) {
              result.push(kw);
              publishedKeywords.add(kw.toLowerCase());
            }
          }

          // 2. Site keywords (fallback)
          if (result.length < count) {
            for (const kw of siteKeywords) {
              if (result.length >= count) break;
              if (!publishedKeywords.has(kw.toLowerCase())) {
                result.push(kw);
                publishedKeywords.add(kw.toLowerCase());
              }
            }
          }

          // 3. Si tout est épuisé, recycler le premier keyword de la roadmap
          // (permet de continuer à publier même si tous les keywords ont été utilisés)
          if (result.length === 0 && allKeywords.length > 0) {
            const recycled = allKeywords[totalPublished % allKeywords.length];
            result.push(recycled);
            logger.info(`[cron] Site "${site.site_url}": tous les keywords publiés, recyclage de "${recycled}"`);
          }

          return result;
        }

        const keywordsToPublish = getNextKeywords(frequency);
        logger.info(`[cron] Site "${site.site_url}": ${keywordsToPublish.length} keyword(s) à publier: ${keywordsToPublish.join(", ")} (freq: ${frequency}, pubsToday: ${pubsToday}, total: ${totalPublished})`);

        for (let f = 0; f < frequency; f++) {
          const keyword = keywordsToPublish[f];
          if (!keyword) {
            logger.warn(`[cron] Site "${site.site_url}": pas de keyword disponible pour publication ${f + 1}/${frequency}`);
            break;
          }

          for (const language of targetLanguages) {
            logger.info(`[cron] Generating "${keyword}" (${language}) for ${site.site_url}...`);
            const pipelineStart = Date.now();

            // ── Pipeline de génération v3 ──
            const pipeline = await runGenerationPipeline(
              supabase,
              site.user_id,
              {
                keyword,
                language,
                business_name: site.business_name ?? "",
                industry: site.industry ?? "e-commerce",
              },
            );

            const pipelineDuration = Math.round((Date.now() - pipelineStart) / 1000);
            logger.info(`[cron] Pipeline done for "${keyword}" in ${pipelineDuration}s — risk: ${pipeline.risk.risk_score}/100 (${pipeline.risk.risk_level})`);

            const { title, meta_description, html: generatedHtml } = pipeline;
            const cover_image_query = pipeline.content.pexels_query;
            const cover_alt_text = pipeline.content.cover_alt_text;
            let content = generatedHtml;

            // ── Injection d'images inline via Pexels ──
            const sectionImgQueries = pipeline.content.section_image_queries ?? [];
            if (sectionImgQueries.length > 0) {
              try {
                const images = await fetchPexelsImages(sectionImgQueries, 3);
                const imgArray = [...images.values()].map(img => ({ url: img.url, alt: img.alt }));
                if (imgArray.length > 0) {
                  content = injectImagesIntoHtml(content, imgArray, 3);
                  logger.info(`[cron] ${imgArray.length} inline images injected into "${title}"`);
                }
              } catch (imgErr) {
                logger.warn("Inline image injection failed (non-fatal)", { context: "cron/publish", error: imgErr });
              }
            }

            let publishedUrl = "";
            let coverImageUrl: string | null = null;

            // Fetch cover image from Pexels (shared across all CMS)
            if (cover_image_query) {
              try {
                const pexelsImg = await fetchPexelsImage(cover_image_query);
                if (pexelsImg) coverImageUrl = pexelsImg.url;
              } catch { /* non-fatal */ }
            }

            if (site.cms === "wordpress") {
              let featuredMediaId: number | null = null;
              if (coverImageUrl) {
                try {
                  featuredMediaId = await uploadImageToWordPress(
                    site.site_url, site.wp_username, site.wp_app_password,
                    coverImageUrl, cover_alt_text || title
                  );
                } catch { /* non-fatal */ }
              }
              publishedUrl = await publishToWordPress(
                site.site_url, site.wp_username, site.wp_app_password,
                title, content, meta_description, featuredMediaId
              );
            } else if (site.cms === "shopify") {
              publishedUrl = await publishToShopify(
                site.shopify_store_url || site.site_url, site.shopify_api_key,
                title, content, meta_description, coverImageUrl, cover_alt_text ?? null,
                site.site_url
              );
            } else if (site.cms === "wix") {
              publishedUrl = await publishToWix(
                site.wix_api_key, site.wix_site_id,
                title, content, meta_description, site.site_url, site.wix_member_id,
                cover_image_query ?? null, cover_alt_text ?? null
              );
            } else if (site.cms === "custom") {
              publishedUrl = await publishToCustomApi(
                site.custom_api_url, site.custom_api_key,
                title, content, meta_description, site.site_url
              );
            } else {
              results.push({ site: site.site_url, cms: site.cms, status: "skip", error: "CMS non supporté" });
              break;
            }

            // Normaliser l'URL publiée — résoudre les relatives, valider le domaine
            if (publishedUrl && !publishedUrl.startsWith("http")) {
              try { publishedUrl = new URL(publishedUrl, site.site_url).href; } catch { /* keep as-is */ }
            }

            logger.info(`[cron] Published "${title}" to ${site.cms} → ${publishedUrl}`);

            const { error: insertError } = await supabase.from("publications").insert({
              site_id: site.id,
              user_id: site.user_id,
              title,
              keyword,
              wordpress_url: publishedUrl,
              cover_image_url: coverImageUrl,
              published_at: new Date().toISOString(),
            });
            if (insertError) {
              logger.error("Failed to record publication in DB", { context: "cron/publish", userId: site.user_id, error: new Error(insertError.message) });
            }

            // ── Maillage rétroactif ──
            if (publishedUrl) {
              try {
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
                const retro = await addRetroactiveLinks(supabase, site.user_id, creds, { keyword, title, url: publishedUrl });
                if (retro.updated_pages.length > 0) {
                  logger.info(`[cron] Retroactive linking: ${retro.updated_pages.length} pages updated for "${title}"`);
                }
              } catch (err) {
                logger.warn("Retroactive linking failed (non-blocking)", { context: "cron/publish", userId: site.user_id, error: err });
              }
            }

            // ── SEO Events ──
            try {
              const pubEvent = createPublicationEvent(keyword, title, publishedUrl ?? "");
              await emitEvent(supabase, site.user_id, pubEvent);
              await recordAction(supabase, site.user_id, "publication", keyword, publishedUrl ?? "", null, [], 0);
              const { count } = await supabase
                .from("publications")
                .select("id", { count: "exact", head: true })
                .eq("user_id", site.user_id);
              const milestoneEvent = createMilestoneEvent(count ?? 0);
              if (milestoneEvent) await emitEvent(supabase, site.user_id, milestoneEvent);
            } catch (err) {
              logger.warn("SEO event recording failed", { context: "cron/publish", userId: site.user_id, error: err });
            }

            // Email
            try {
              const { data: userData } = await supabase.auth.admin.getUserById(site.user_id);
              const userEmail = userData?.user?.email;
              if (userEmail) {
                await sendArticlePublishedEmail({ to: userEmail, title, keyword, url: publishedUrl, businessName: site.business_name });
              }
            } catch (err) {
              logger.warn("Email notification failed", { context: "cron/publish", userId: site.user_id, error: err });
            }

            results.push({ site: site.site_url, cms: site.cms, status: "ok", title, url: publishedUrl, keyword });
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

      } catch (err: unknown) {
        results.push({
          site: site.site_url,
          cms: site.cms,
          status: "error",
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    const ok = results.filter(r => r.status === "ok").length;
    return Response.json({ message: `${ok}/${sites.length} articles publiés`, results });

  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
