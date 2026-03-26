import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Génération Claude ────────────────────────────────────────────────────────

async function generateArticle(keyword: string, businessName: string, industry: string) {
  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Tu es un expert SEO. Rédige un article de blog optimisé pour le mot-clé "${keyword}" pour l'entreprise "${businessName}" dans le secteur "${industry}".

L'article doit :
- Avoir un titre accrocheur qui contient le mot-clé
- Faire entre 600 et 800 mots
- Être structuré avec des sous-titres (H2, H3)
- Être rédigé en HTML (balises <h2>, <h3>, <p>, <ul>, <li>)
- Contenir naturellement le mot-clé plusieurs fois
- Finir par un appel à l'action

Réponds UNIQUEMENT avec un JSON valide dans ce format exact, sans texte avant ni après :
{"title": "Le titre de l'article", "content": "<p>Le contenu HTML...</p>"}`,
    }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Format de réponse Claude invalide");
  return JSON.parse(jsonMatch[0]) as { title: string; content: string };
}

// ─── Publication WordPress ────────────────────────────────────────────────────

async function publishToWordPress(
  siteUrl: string, username: string, appPassword: string,
  title: string, content: string
) {
  const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${credentials}` },
    body: JSON.stringify({ title, content, status: "publish" }),
  });
  if (!res.ok) throw new Error(`WordPress: ${await res.text()}`);
  const post = await res.json();
  return post.link as string;
}

// ─── Publication Shopify ──────────────────────────────────────────────────────

async function publishToShopify(
  storeUrl: string, apiKey: string,
  title: string, content: string
) {
  const baseUrl = storeUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": apiKey,
  };

  // Récupérer le premier blog existant (ou en créer un)
  const blogsRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, { headers });
  if (!blogsRes.ok) throw new Error(`Shopify blogs: ${await blogsRes.text()}`);
  const blogsData = await blogsRes.json();

  let blogId: number;
  if (blogsData.blogs?.length > 0) {
    blogId = blogsData.blogs[0].id;
  } else {
    // Créer un blog "Actualités" si aucun n'existe
    const createBlogRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, {
      method: "POST",
      headers,
      body: JSON.stringify({ blog: { title: "Actualités SEO" } }),
    });
    if (!createBlogRes.ok) throw new Error(`Shopify create blog: ${await createBlogRes.text()}`);
    const newBlog = await createBlogRes.json();
    blogId = newBlog.blog.id;
  }

  // Publier l'article
  const articleRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs/${blogId}/articles.json`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      article: {
        title,
        body_html: content,
        published: true,
      },
    }),
  });
  if (!articleRes.ok) throw new Error(`Shopify article: ${await articleRes.text()}`);
  const article = await articleRes.json();
  return `${baseUrl}/blogs/${blogsData.blogs?.[0]?.handle ?? "news"}/${article.article.handle}`;
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: { site: string; cms: string; status: string; title?: string; error?: string }[] = [];

  try {
    // Récupérer tous les sites (WordPress ET Shopify)
    const { data: sites, error } = await supabase.from("sites").select("*");

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

        const keyword = keywords[Math.floor(Math.random() * keywords.length)];
        const { title, content } = await generateArticle(keyword, site.business_name, site.industry);

        let publishedUrl = "";

        if (site.cms === "wordpress") {
          publishedUrl = await publishToWordPress(
            site.site_url, site.wp_username, site.wp_app_password, title, content
          );
        } else if (site.cms === "shopify") {
          publishedUrl = await publishToShopify(
            site.site_url, site.shopify_api_key, title, content
          );
        } else {
          results.push({ site: site.site_url, cms: site.cms, status: "skip", error: "CMS non supporté" });
          continue;
        }

        await supabase.from("publications").insert({
          site_id: site.id,
          user_id: site.user_id,
          title,
          keyword,
          wordpress_url: publishedUrl,
        });

        await new Promise((r) => setTimeout(r, 1000));
        results.push({ site: site.site_url, cms: site.cms, status: "ok", title });

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
