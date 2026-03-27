import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function extractStyleGuide(samples: string[]): Promise<string> {
  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Analyze these blog article excerpts and extract the editorial style guide in 6-8 concise bullet points. Cover: tone (formal/casual/friendly), use of "vous" or "tu", sentence length and rhythm, introduction style, how H2/H3 titles are phrased, use of lists vs paragraphs, vocabulary register, and any recurring stylistic patterns.

${samples.join("\n\n---\n\n")}

Respond ONLY with bullet points, no intro or conclusion:
- [style observation]`,
      }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  } catch {
    return "";
  }
}

async function fetchStyleGuideWordPress(siteUrl: string, username: string, appPassword: string): Promise<string> {
  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=5&_fields=title,content`, {
      headers: { Authorization: `Basic ${credentials}`, "ngrok-skip-browser-warning": "true" },
    });
    if (!res.ok) return "";
    const posts = await res.json() as { title: { rendered: string }; content: { rendered: string } }[];
    const samples = posts.slice(0, 3).map((p, i) => {
      const excerpt = p.content.rendered.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      return `Article ${i + 1} — "${p.title.rendered}":\n${excerpt}`;
    });
    return samples.length > 0 ? await extractStyleGuide(samples) : "";
  } catch {
    return "";
  }
}

async function fetchStyleGuideShopify(storeUrl: string, apiKey: string): Promise<string> {
  try {
    const baseUrl = storeUrl.replace(/\/$/, "");
    const headers = { "X-Shopify-Access-Token": apiKey };

    const blogsRes = await fetch(`${baseUrl}/admin/api/2024-01/blogs.json`, { headers });
    if (!blogsRes.ok) return "";
    const blogsData = await blogsRes.json() as { blogs: { id: number }[] };
    if (!blogsData.blogs?.length) return "";

    const blogId = blogsData.blogs[0].id;
    const articlesRes = await fetch(
      `${baseUrl}/admin/api/2024-01/blogs/${blogId}/articles.json?limit=5&fields=title,body_html`,
      { headers }
    );
    if (!articlesRes.ok) return "";
    const articlesData = await articlesRes.json() as { articles: { title: string; body_html: string }[] };
    const articles = articlesData.articles ?? [];

    const samples = articles.slice(0, 3).map((a, i) => {
      const excerpt = a.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      return `Article ${i + 1} — "${a.title}":\n${excerpt}`;
    });
    return samples.length > 0 ? await extractStyleGuide(samples) : "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const { keyword, businessName, industry, allKeywords, language = "fr" } = await request.json();

    // Récupérer les credentials WP pour analyser la DA du site
    let styleGuide = "";
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: site } = await supabase
          .from("sites")
          .select("cms, site_url, wp_username, wp_app_password, shopify_api_key, wix_api_key, wix_site_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();
        if (site?.cms === "wordpress" && site.wp_username && site.wp_app_password) {
          styleGuide = await fetchStyleGuideWordPress(site.site_url, site.wp_username, site.wp_app_password);
        } else if (site?.cms === "shopify" && site.shopify_api_key) {
          styleGuide = await fetchStyleGuideShopify(site.site_url, site.shopify_api_key);
        }
        // Wix : DA non disponible via API publique, on génère sans style guide
      }
    } catch {
      // DA optionnelle, on continue sans
    }

    const otherKeywords = (allKeywords ?? []).filter((k: string) => k !== keyword).slice(0, 5);
    const internalLinksContext = otherKeywords.length > 0
      ? `\n\nSecondary keywords to mention naturally for internal linking: ${otherKeywords.join(", ")}`
      : "";
    const styleGuideContext = styleGuide
      ? `\n\nDIRECTION ARTISTIQUE — REPRODUCE THIS STYLE EXACTLY (extracted from the site's existing articles):\n${styleGuide}`
      : "";

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8000,
      system: `You are the world's best SEO content writer. Every article you produce is unique, creative, and generates real organic traffic. You never produce generic or repetitive content. You always write in the language specified — this is non-negotiable.`,
      messages: [
        {
          role: "user",
          content: `You are a world-class SEO writer specializing in the "${industry ?? "e-commerce"}" sector. You work for "${businessName}".

MISSION: Write an exceptional SEO blog article on the main keyword: "${keyword}"

LANGUAGE: Write the ENTIRE article in ${language}. Every word must be in ${language}.${internalLinksContext}${styleGuideContext}

QUALITY REQUIREMENTS (premium SEO agency level):

1. TITLE (H1): Catchy, contains the keyword, 50-60 characters ideally.

2. META DESCRIPTION: 150-160 characters, compelling, contains the keyword.

3. INTRODUCTION (150-200 words): Strong hook, states the problem or opportunity.

4. ARTICLE BODY (1200-1800 words):
   - 4 to 6 well-structured H2 sections
   - H3 subsections when needed
   - Short paragraphs (3-4 lines max)
   - Concrete examples related to the sector
   - Figures and statistics for credibility
   - Bullet lists for readability
   - Tone: expert but accessible, never robotic (unless DA says otherwise)
   - Keyword density: natural, 1-2% maximum

5. FAQ SECTION (3-4 questions): Questions the target audience really asks.

6. CONCLUSION (100-150 words): Summary + strong call to action.

RESPONSE FORMAT: Valid JSON only, no text before or after.

{"title": "The optimized H1 title", "meta_description": "The 150-160 character meta description", "content": "The complete HTML content"}

HTML must use: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>. No <html>, <body>, <head>.`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    let parsed: { title: string; content: string; meta_description: string };
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        return Response.json({ error: "Format de réponse invalide de Claude" }, { status: 500 });
      }
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return Response.json({ error: "Impossible de lire la réponse de Claude" }, { status: 500 });
    }
    return Response.json({
      title: parsed.title,
      content: parsed.content,
      meta_description: parsed.meta_description,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
