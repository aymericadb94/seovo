import { createClient } from "@supabase/supabase-js";
import { sendArticlePublishedEmail } from "@/lib/email";
import { publishToWix, analyzeWixSite } from "@/lib/wix";
import { publishToCustomApi } from "@/lib/custom";
import { fetchPexelsImage } from "@/lib/pexels";
import { emitEvent, createPublicationEvent, createMilestoneEvent } from "@/lib/seo-events";
import { recordAction } from "@/lib/seo-feedback";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { logger } from "@/lib/logger";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Analyse du site WordPress ────────────────────────────────────────────────
// Récupère les derniers articles publiés pour éviter les répétitions
// et analyser la Direction Artistique (DA) du site

async function analyzeWordPressSite(siteUrl: string, username: string, appPassword: string) {
  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=5&_fields=title,content`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        "ngrok-skip-browser-warning": "true",
      },
    });
    if (!res.ok) return { existingTitles: [], styleGuide: "" };
    const posts = await res.json() as { title: { rendered: string }; content: { rendered: string } }[];
    const existingTitles = posts.map((p) => p.title.rendered);

    const articleSamples = posts.slice(0, 3).map((p) => ({
      title: p.title.rendered,
      excerpt: p.content.rendered.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800),
    }));

    const styleGuide = articleSamples.length > 0 ? await extractStyleGuide(articleSamples) : "";

    return { existingTitles, styleGuide };
  } catch {
    return { existingTitles: [], styleGuide: "" };
  }
}

// ─── Extraction de la Direction Artistique ────────────────────────────────────

async function extractStyleGuide(articles: { title: string; excerpt: string }[]): Promise<string> {
  try {
    const samplesText = articles
      .map((a, i) => `Article ${i + 1} — "${a.title}":\n${a.excerpt}`)
      .join("\n\n---\n\n");

    // style_extraction → Haiku
    const aiResult = await aiCall(
      { task: "style_extraction" },
      {
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Analyze these blog article excerpts and extract the editorial style guide in 6-8 concise bullet points. Cover: tone (formal/casual/friendly), use of "vous" or "tu", sentence length and rhythm, introduction style, how H2/H3 titles are phrased, use of lists vs paragraphs, vocabulary register, and any recurring stylistic patterns.

${samplesText}

Respond ONLY with bullet points, no intro or conclusion:
- [style observation]
- [style observation]
...`,
        }],
      }
    );

    return aiResult.text.trim();
  } catch {
    return "";
  }
}

// ─── Analyse du site Shopify ──────────────────────────────────────────────────

async function analyzeShopifySite(storeUrl: string, apiKey: string, _publicUrl?: string) {
  try {
    const baseUrl = storeUrl.replace(/\/$/, "");
    const headers = { "X-Shopify-Access-Token": apiKey };

    const blogsRes = await fetch(`${baseUrl}/admin/api/2025-10/blogs.json`, { headers });
    if (!blogsRes.ok) return { existingTitles: [], styleGuide: "" };
    const blogsData = await blogsRes.json() as { blogs: { id: number }[] };
    if (!blogsData.blogs?.length) return { existingTitles: [], styleGuide: "" };

    const blogId = blogsData.blogs[0].id;
    const articlesRes = await fetch(
      `${baseUrl}/admin/api/2025-10/blogs/${blogId}/articles.json?limit=5&fields=title,body_html`,
      { headers }
    );
    if (!articlesRes.ok) return { existingTitles: [], styleGuide: "" };
    const articlesData = await articlesRes.json() as { articles: { title: string; body_html: string }[] };
    const articles = articlesData.articles ?? [];

    const existingTitles = articles.map((a) => a.title);
    const articleSamples = articles.slice(0, 3).map((a) => ({
      title: a.title,
      excerpt: a.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800),
    }));

    const styleGuide = articleSamples.length > 0 ? await extractStyleGuide(articleSamples) : "";
    return { existingTitles, styleGuide };
  } catch {
    return { existingTitles: [], styleGuide: "" };
  }
}

// ─── Génération Claude — Moteur SEO premium ───────────────────────────────────

const formatsByLocale: Record<string, string[]> = {
  fr: ["guide complet et exhaustif", "article comparatif avec tableau", "liste des meilleures pratiques (top 10)", "étude de cas avec exemples concrets", "article question/réponse (FAQ approfondie)", "tutoriel pas-à-pas", "analyse de tendances du secteur"],
  en: ["comprehensive guide", "comparison article with table", "best practices list (top 10)", "case study with concrete examples", "Q&A article (in-depth FAQ)", "step-by-step tutorial", "industry trends analysis"],
  es: ["guía completa y exhaustiva", "artículo comparativo con tabla", "lista de mejores prácticas (top 10)", "estudio de caso con ejemplos concretos", "artículo de preguntas y respuestas (FAQ en profundidad)", "tutorial paso a paso", "análisis de tendencias del sector"],
  de: ["umfassender Leitfaden", "Vergleichsartikel mit Tabelle", "Liste der besten Praktiken (Top 10)", "Fallstudie mit konkreten Beispielen", "Q&A-Artikel (ausführliche FAQ)", "Schritt-für-Schritt-Tutorial", "Branchentrends-Analyse"],
  it: ["guida completa ed esaustiva", "articolo comparativo con tabella", "lista delle migliori pratiche (top 10)", "studio di caso con esempi concreti", "articolo domande e risposte (FAQ approfondita)", "tutorial passo dopo passo", "analisi delle tendenze del settore"],
};

async function generateArticle(params: {
  keyword: string;
  allKeywords: string[];
  businessName: string;
  industry: string;
  existingTitles: string[];
  publicationsCount: number;
  language?: string;
  styleGuide?: string;
}) {
  const { keyword, allKeywords, businessName, industry, existingTitles, publicationsCount, language = "fr", styleGuide } = params;

  const formats = formatsByLocale[language] ?? formatsByLocale.fr;
  const format = formats[publicationsCount % formats.length];

  const existingContext = existingTitles.length > 0
    ? `\n\nAlready published articles on this site (do not repeat these topics):\n${existingTitles.slice(0, 10).map(t => `- ${t}`).join("\n")}`
    : "";

  const otherKeywords = allKeywords.filter(k => k !== keyword).slice(0, 5);
  const internalLinksContext = otherKeywords.length > 0
    ? `\n\nSecondary site keywords to mention naturally for internal linking: ${otherKeywords.join(", ")}`
    : "";

  const prompt = `You are a world-class SEO content writer specializing in the "${industry}" sector. You work for "${businessName}" and know their audience, tone, and commercial goals perfectly.

MISSION: Write an exceptional SEO blog article in the format "${format}" on the main keyword: "${keyword}"

LANGUAGE: Write the ENTIRE article in ${language}. Every word, title, heading, and sentence must be in ${language}.

EDITORIAL CONTEXT:
- Industry: ${industry}
- Company: ${businessName}
- Full keyword strategy: ${allKeywords.join(", ")}${existingContext}${internalLinksContext}${styleGuide ? `\n\nDIRECTION ARTISTIQUE — REPRODUCE THIS STYLE EXACTLY (extracted from the site's existing articles):\n${styleGuide}` : ""}

QUALITY REQUIREMENTS (premium SEO agency level):

1. TITLE (H1): Catchy, contains the keyword, makes you want to read. Ideally 50-60 characters.

2. META DESCRIPTION: 150-160 characters, compelling, contains the keyword.

3. FEATURED SNIPPET BLOCK (this is the FIRST element in the content, immediately after H1 — critical for Google position 0 and LLMs like ChatGPT/Perplexity):
   - Start with an H2 containing the main keyword phrased as a question (e.g. "Qu'est-ce que X ?" / "Comment X ?" / "Pourquoi X ?")
   - Immediately follow with a <p> of exactly 40-60 words: direct, complete answer. No filler, no "in this article", no "we will see".
   - If steps implied (how to, guide, tutorial): add a <ol> with 4-8 concise steps right after the paragraph.
   - If comparison implied: add a <table> with 2-4 columns and 3-6 rows right after the paragraph.
   - If definition implied: start the paragraph with "[Keyword] est..." followed by the definition.

4. INTRODUCTION (150-200 words): Strong hook after the featured snippet. Speaks directly to the reader. States the problem or opportunity. Announces what they will learn.

5. ARTICLE BODY (900-1200 words — do not exceed 1200 words):
   - 4 to 6 well-structured H2 sections
   - H3 subsections when needed
   - Short, airy paragraphs (3-4 lines max)
   - Concrete examples related to the ${industry} sector
   - Figures and statistics (even approximate) for credibility
   - Bullet lists for readability
   - Tone: expert but accessible, never robotic
   - Keyword density: natural, 1-2% maximum

6. FAQ SECTION (3-4 questions): Questions the target audience really asks. Each answer must be 40-60 words max — short enough to also be captured as a featured snippet.

7. CONCLUSION (100-150 words): Summary of key points + strong specific call to action.

8. INTERNAL LINKING: Naturally integrate mentions of other site topics to create internal linking opportunities.

RESPONSE FORMAT: Valid JSON only, no text before or after.

{
  "title": "The optimized H1 title",
  "meta_description": "The 150-160 character meta description",
  "cover_image_query": "3-5 english keywords for a relevant stock photo (e.g. 'vintage clothing warehouse wholesale')",
  "cover_alt_text": "SEO-optimized alt text, 8-12 words, includes main keyword, written in the article language",
  "content": "The complete HTML content with all tags"
}

HTML content must use: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>. No <html>, <body>, <head>.`;

  // content_generation → Sonnet (execution task, not strategic)
  const aiResult = await aiCall(
    { task: "content_generation" },
    {
      system: `You are the world's best SEO content writer. Every article you produce is unique, creative, and generates real organic traffic. You never produce generic or repetitive content. You think like a specialized press editor who wants to captivate the reader while satisfying Google's algorithms. You always write in the language specified in the LANGUAGE field — this is non-negotiable.`,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 6000,
    }
  );

  const parsed = parseAiJson<{
    title: string;
    meta_description: string;
    content: string;
    cover_image_query?: string;
    cover_alt_text?: string;
  }>(aiResult.text);

  if (!parsed) throw new Error("Format de réponse Claude invalide");

  return parsed;
}

// ─── Publication WordPress ────────────────────────────────────────────────────

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
    if (!mediaRes.ok) {
      console.error(`[wp/uploadImage] ${mediaRes.status}: ${(await mediaRes.text()).slice(0, 200)}`);
      return null;
    }
    const media = await mediaRes.json() as { id: number };
    if (media.id && alt) {
      await fetch(`${siteUrl}/wp-json/wp/v2/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}`, "ngrok-skip-browser-warning": "true" },
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

// ─── Publication Shopify ──────────────────────────────────────────────────────

async function publishToShopify(
  storeUrl: string, apiKey: string,
  title: string, content: string, metaDescription: string,
  imageUrl?: string | null, imageAlt?: string | null,
  publicUrl?: string
) {
  const apiBase = storeUrl.replace(/\/$/, "");
  const publicBase = (publicUrl ?? storeUrl).replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": apiKey,
  };

  const blogsRes = await fetch(`${apiBase}/admin/api/2025-10/blogs.json`, { headers });
  if (!blogsRes.ok) throw new Error(`Shopify blogs: ${await blogsRes.text()}`);
  const blogsData = await blogsRes.json();

  let blogId: number;
  let blogHandle = "news";
  if (blogsData.blogs?.length > 0) {
    blogId = blogsData.blogs[0].id;
    blogHandle = blogsData.blogs[0].handle;
  } else {
    const createBlogRes = await fetch(`${apiBase}/admin/api/2025-10/blogs.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ blog: { title: "Actualités SEO" } }),
    });
    if (!createBlogRes.ok) throw new Error(`Shopify create blog: ${await createBlogRes.text()}`);
    const newBlog = await createBlogRes.json();
    blogId = newBlog.blog.id;
    blogHandle = newBlog.blog.handle;
  }

  const articleRes = await fetch(`${apiBase}/admin/api/2025-10/blogs/${blogId}/articles.json`, {
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
  return `${publicBase}/blogs/${blogHandle}/${article.article.handle}`;
}

export const maxDuration = 300;

// ─── Handler principal ────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  // Mode manuel : userId passé en query param → ne traite que ce site
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const isManual = url.searchParams.get("manual") === "1";
  const isForced = url.searchParams.get("force") === "1";

  const supabase = createAdminClient();
  const results: { site: string; cms: string; status: string; title?: string; error?: string }[] = [];

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
        const keywords: string[] = site.keywords ?? [];
        if (keywords.length === 0) {
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: "Aucun mot-clé configuré" });
          continue;
        }

        // Compter les publications précédentes pour la rotation des mots-clés
        const { count: publicationsCount } = await supabase
          .from("publications")
          .select("*", { count: "exact", head: true })
          .eq("site_id", site.id);

        const totalPublished = publicationsCount ?? 0;

        // Limite journalière : max 3 articles/jour par site
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
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: `Limite journalière atteinte (${pubsToday}/${dailyMax})` });
          continue;
        }

        // En mode automatique (pas manuel), vérifier qu'on n'a pas déjà publié aujourd'hui via le cron
        if (!userId && pubsToday > 0) {
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: `Déjà publié aujourd'hui automatiquement` });
          continue;
        }

        // Analyser le site pour éviter les répétitions et extraire la DA
        let existingTitles: string[] = [];
        let styleGuide = "";

        if (site.cms === "wordpress") {
          const analysis = await analyzeWordPressSite(site.site_url, site.wp_username, site.wp_app_password);
          existingTitles = analysis.existingTitles;
          styleGuide = analysis.styleGuide;
        } else if (site.cms === "shopify") {
          const analysis = await analyzeShopifySite(site.shopify_store_url || site.site_url, site.shopify_api_key);
          existingTitles = analysis.existingTitles;
          styleGuide = analysis.styleGuide;
        } else if (site.cms === "wix") {
          const analysis = await analyzeWixSite(site.wix_api_key, site.wix_site_id);
          existingTitles = analysis.existingTitles;
          styleGuide = analysis.styleGuide;
        }

        // Langues cibles (défaut : français)
        const targetLanguages: string[] = site.target_languages?.length > 0
          ? site.target_languages
          : ["fr"];

        // Fréquence : 1 en mode manuel, sinon selon config du site (plafonné à la limite restante)
        const remaining = dailyMax - pubsToday;
        const frequency = isManual ? 1 : Math.min(Math.max(1, site.frequency ?? 1), remaining);

        // Roadmap : récupérer les articles ordonnés par priorité
        const { data: roadmapRow } = await supabase
          .from("roadmaps")
          .select("data")
          .eq("user_id", site.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Mots-clés déjà publiés (pour éviter les doublons)
        const { data: publishedPubs } = await supabase
          .from("publications")
          .select("keyword")
          .eq("site_id", site.id);
        const publishedKeywords = new Set(
          (publishedPubs ?? []).map(p => p.keyword?.toLowerCase()).filter(Boolean)
        );

        // Construire la file d'attente : roadmap en priorité, sinon rotation classique
        function getNextKeywords(count: number): string[] {
          const result: string[] = [];
          if ((roadmapRow?.data?.articles?.length ?? 0) > 0) {
            const roadmapArticles = ((roadmapRow?.data?.articles ?? []) as { keyword: string; priority: number }[])
              .filter(a => a.keyword && !publishedKeywords.has(a.keyword.toLowerCase()))
              .sort((a, b) => a.priority - b.priority);
            for (const a of roadmapArticles) {
              if (result.length >= count) break;
              result.push(a.keyword);
              publishedKeywords.add(a.keyword.toLowerCase()); // éviter doublons dans la même session
            }
          }
          // Compléter avec la rotation classique si pas assez d'articles dans la roadmap
          if (result.length < count) {
            for (let i = 0; result.length < count; i++) {
              const kw = keywords[(totalPublished + i) % keywords.length];
              if (!publishedKeywords.has(kw.toLowerCase())) {
                result.push(kw);
                publishedKeywords.add(kw.toLowerCase());
              }
              if (i >= keywords.length) break; // sécurité boucle infinie
            }
          }
          return result;
        }

        const keywordsToPublish = getNextKeywords(frequency);

        // Générer N articles (selon fréquence), chacun dans toutes les langues
        for (let f = 0; f < frequency; f++) {
        const keyword = keywordsToPublish[f] ?? keywords[totalPublished % keywords.length];

        for (const language of targetLanguages) {
          const { title, content, meta_description, cover_image_query, cover_alt_text } = await generateArticle({
            keyword,
            allKeywords: keywords,
            businessName: site.business_name,
            industry: site.industry,
            existingTitles,
            publicationsCount: totalPublished,
            language,
            styleGuide,
          });

          let publishedUrl = "";

          if (site.cms === "wordpress") {
            let featuredMediaId: number | null = null;
            if (cover_image_query) {
              const pexelsImg = await fetchPexelsImage(cover_image_query);
              if (pexelsImg) {
                featuredMediaId = await uploadImageToWordPress(
                  site.site_url, site.wp_username, site.wp_app_password,
                  pexelsImg.url, cover_alt_text || title
                );
                console.log(`[cron/wp] featured_media id: ${featuredMediaId}`);
              }
            }
            publishedUrl = await publishToWordPress(
              site.site_url, site.wp_username, site.wp_app_password,
              title, content, meta_description, featuredMediaId
            );
          } else if (site.cms === "shopify") {
            let shopifyImageUrl: string | null = null;
            if (cover_image_query) {
              const pexelsImg = await fetchPexelsImage(cover_image_query);
              if (pexelsImg) {
                shopifyImageUrl = pexelsImg.url;
                console.log(`[cron/shopify] image url: ${shopifyImageUrl.slice(0, 80)}`);
              }
            }
            publishedUrl = await publishToShopify(
              site.shopify_store_url || site.site_url, site.shopify_api_key,
              title, content, meta_description, shopifyImageUrl, cover_alt_text ?? null,
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

          const { error: insertError } = await supabase.from("publications").insert({
            site_id: site.id,
            user_id: site.user_id,
            title,
            keyword,
            wordpress_url: publishedUrl,
            published_at: new Date().toISOString(),
          });
          if (insertError) {
            logger.error("Failed to record publication in DB", { context: "cron/publish", userId: site.user_id, error: new Error(insertError.message) });
          }

          // ── SEO Event hook — enregistrer la publication pour le recalcul ──
          try {
            const pubEvent = createPublicationEvent(keyword, title, publishedUrl ?? "");
            await emitEvent(supabase, site.user_id, pubEvent);

            // Record action for feedback loop (gain will be measured at J+7/14/30)
            await recordAction(supabase, site.user_id, "publication", keyword, publishedUrl ?? "", null, [], 0);

            // Check milestones
            const { count } = await supabase
              .from("publications")
              .select("id", { count: "exact", head: true })
              .eq("user_id", site.user_id);
            const milestoneEvent = createMilestoneEvent(count ?? 0);
            if (milestoneEvent) await emitEvent(supabase, site.user_id, milestoneEvent);
          } catch (err) {
            logger.warn("SEO event recording failed", { context: "cron/publish", userId: site.user_id, error: err });
          }

          // Notification email à l'utilisateur
          try {
            const { data: userData } = await supabase.auth.admin.getUserById(site.user_id);
            const userEmail = userData?.user?.email;
            if (userEmail) {
              await sendArticlePublishedEmail({
                to: userEmail,
                title,
                keyword,
                url: publishedUrl,
                businessName: site.business_name,
              });
            }
          } catch (err) {
            logger.warn("Email notification failed", { context: "cron/publish", userId: site.user_id, error: err });
          }

          results.push({ site: site.site_url, cms: site.cms, status: "ok", title });
          await new Promise((r) => setTimeout(r, 1000));
        }
        } // fin boucle fréquence

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
