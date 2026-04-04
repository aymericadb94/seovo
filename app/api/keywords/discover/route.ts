import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: site } = await supabase
      .from("sites")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!site) return Response.json({ error: "Aucun site configuré" }, { status: 404 });

    // ── Analyser le contenu du site ──────────────────────────────────────────
    let siteContent = "";

    if (site.cms === "wordpress" && site.wp_username && site.wp_app_password) {
      try {
        const credentials = Buffer.from(`${site.wp_username}:${site.wp_app_password}`).toString("base64");

        // Récupérer les articles
        const postsRes = await fetch(
          `${site.site_url}/wp-json/wp/v2/posts?per_page=20&_fields=title,excerpt,content,categories`,
          { headers: { Authorization: `Basic ${credentials}`, "ngrok-skip-browser-warning": "true" } }
        );

        if (postsRes.ok) {
          const posts = await postsRes.json();
          const postSummaries = posts.map((p: { title: { rendered: string }; excerpt: { rendered: string } }) =>
            `- ${p.title.rendered}: ${p.excerpt?.rendered?.replace(/<[^>]*>/g, "").slice(0, 150)}`
          ).join("\n");
          siteContent += `\nArticles existants :\n${postSummaries}`;
        }

        // Récupérer les pages
        const pagesRes = await fetch(
          `${site.site_url}/wp-json/wp/v2/pages?per_page=10&_fields=title,excerpt`,
          { headers: { Authorization: `Basic ${credentials}`, "ngrok-skip-browser-warning": "true" } }
        );

        if (pagesRes.ok) {
          const pages = await pagesRes.json();
          const pageSummaries = pages.map((p: { title: { rendered: string } }) => `- ${p.title.rendered}`).join("\n");
          siteContent += `\nPages du site :\n${pageSummaries}`;
        }
      } catch {
        // Continuer sans le contenu du site si inaccessible
      }
    }

    // Langue principale du site (première langue configurée, défaut fr)
    const targetLanguages: string[] = site.target_languages ?? ["fr"];
    const primaryLanguage = targetLanguages[0] ?? "fr";

    // ── Demander à Claude les meilleurs mots-clés ────────────────────────────
    // keyword_discovery → Opus (strategic decision)
    const aiResult = await aiCall(
      { task: "keyword_discovery" },
      {
        system: `You are an SEO expert specialized in keyword research. You analyze websites and identify the most strategic keywords to maximize organic traffic. Always respond in valid JSON only.`,
        messages: [{
          role: "user",
          content: `Analyze this website and suggest the 12 best SEO keywords to target for maximum organic traffic.

SITE:
- Name: ${site.business_name}
- Industry: ${site.industry}
- CMS: ${site.cms}
${siteContent ? `\nEXISTING SITE CONTENT:${siteContent}` : ""}

SELECTION CRITERIA:
- Keywords with good potential search volume
- Matching exactly the "${site.industry}" industry
- Mix of generic keywords (high volume) and long-tail (easier to rank)
- IMPORTANT: Write all keywords in ${primaryLanguage} language
- Avoid overly competitive keywords for a new site
- Keywords must be realistic search queries that users actually type

Respond ONLY with valid JSON, no text before or after:
{
  "keywords": ["keyword 1", "keyword 2", ...],
  "reasoning": "Short explanation of the strategy in 1-2 sentences (write in ${primaryLanguage})"
}`,
        }],
      }
    );

    const parsed = parseAiJson<{ keywords?: string[]; reasoning?: string }>(aiResult.text);
    if (!parsed) {
      return Response.json({ error: "Impossible de lire la réponse de l'IA" }, { status: 500 });
    }
    return Response.json({
      keywords: parsed.keywords ?? [],
      reasoning: parsed.reasoning ?? "",
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
