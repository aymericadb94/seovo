import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    // ── Demander à Claude les meilleurs mots-clés ────────────────────────────
    const message = await anthropic.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1000,
      system: `Tu es un expert SEO spécialisé en recherche de mots-clés. Tu analyses des sites web et identifies les mots-clés les plus stratégiques pour maximiser le trafic organique.`,
      messages: [{
        role: "user",
        content: `Analyse ce site web et propose les 12 meilleurs mots-clés SEO à cibler pour maximiser le trafic organique.

SITE :
- Nom : ${site.business_name}
- Secteur : ${site.industry}
- CMS : ${site.cms}
${siteContent ? `\nCONTENU EXISTANT DU SITE :${siteContent}` : ""}

CRITÈRES DE SÉLECTION :
- Mots-clés avec un bon volume de recherche potentiel
- Correspondant exactement au secteur "${site.industry}"
- Mélange de mots-clés génériques (haut volume) et de longue traîne (plus faciles à ranker)
- En français, adaptés au marché francophone
- Éviter les mots-clés trop compétitifs pour un site qui commence

Réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après :
{
  "keywords": ["mot-clé 1", "mot-clé 2", ...],
  "reasoning": "Explication courte de la stratégie en 1-2 phrases"
}`,
      }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: "Réponse IA invalide" }, { status: 500 });

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json({
      keywords: parsed.keywords ?? [],
      reasoning: parsed.reasoning ?? "",
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
