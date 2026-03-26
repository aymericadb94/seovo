import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Analyse du site WordPress ────────────────────────────────────────────────
// Récupère les derniers articles publiés pour éviter les répétitions
// et comprendre le style éditorial du site

async function analyzeWordPressSite(siteUrl: string, username: string, appPassword: string) {
  try {
    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");
    const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts?per_page=20&_fields=title,excerpt,tags,categories`, {
      headers: {
        Authorization: `Basic ${credentials}`,
        "ngrok-skip-browser-warning": "true",
      },
    });
    if (!res.ok) return { existingTitles: [] };
    const posts = await res.json();
    const existingTitles = posts.map((p: { title: { rendered: string } }) => p.title.rendered);
    return { existingTitles };
  } catch {
    return { existingTitles: [] };
  }
}

// ─── Génération Claude — Moteur SEO premium ───────────────────────────────────

async function generateArticle(params: {
  keyword: string;
  allKeywords: string[];
  businessName: string;
  industry: string;
  existingTitles: string[];
  publicationsCount: number;
}) {
  const { keyword, allKeywords, businessName, industry, existingTitles, publicationsCount } = params;

  // Choisir un format d'article varié selon l'historique
  const formats = [
    "guide complet et exhaustif",
    "article comparatif avec tableau",
    "liste des meilleures pratiques (top 10)",
    "étude de cas avec exemples concrets",
    "article question/réponse (FAQ approfondie)",
    "tutoriel pas-à-pas",
    "analyse de tendances du secteur",
  ];
  const format = formats[publicationsCount % formats.length];

  const existingContext = existingTitles.length > 0
    ? `\n\nArticles DÉJÀ PUBLIÉS sur ce site (ne pas répéter ces sujets) :\n${existingTitles.slice(0, 10).map(t => `- ${t}`).join("\n")}`
    : "";

  const otherKeywords = allKeywords.filter(k => k !== keyword).slice(0, 5);
  const internalLinksContext = otherKeywords.length > 0
    ? `\n\nMots-clés secondaires du site à mentionner naturellement pour le maillage interne : ${otherKeywords.join(", ")}`
    : "";

  const prompt = `Tu es un rédacteur SEO expert de niveau mondial, spécialisé dans le secteur "${industry}". Tu travailles pour "${businessName}" depuis plusieurs mois — tu connais parfaitement leur audience, leur ton, et leurs objectifs commerciaux.

MISSION : Rédiger un article de blog SEO exceptionnel au format "${format}" sur le mot-clé principal : "${keyword}"

CONTEXTE ÉDITORIAL :
- Secteur : ${industry}
- Entreprise : ${businessName}
- Mots-clés de la stratégie globale : ${allKeywords.join(", ")}${existingContext}${internalLinksContext}

EXIGENCES DE QUALITÉ (niveau agence SEO premium) :

1. TITRE (H1) : Accrocheur, contient le mot-clé, donne envie de lire. Entre 50-60 caractères idéalement.

2. MÉTA DESCRIPTION : 150-160 caractères, incitative, contient le mot-clé.

3. INTRODUCTION (150-200 mots) : Accroche forte qui parle directement au lecteur. Pose le problème ou l'opportunité. Annonce ce qu'il va apprendre.

4. CORPS DE L'ARTICLE (1200-1800 mots minimum) :
   - 4 à 6 sections H2 bien structurées
   - Sous-sections H3 quand nécessaire
   - Paragraphes courts et aérés (3-4 lignes max)
   - Exemples concrets liés au secteur ${industry}
   - Données chiffrées et statistiques (même approximatives) pour crédibiliser
   - Listes à puces pour améliorer la lisibilité
   - Ton : expert mais accessible, jamais robotique
   - Densité de mots-clés : naturelle, 1-2% maximum

5. SECTION FAQ (3-4 questions) : Questions que se pose vraiment l'audience cible. Réponses concises (50-100 mots chacune).

6. CONCLUSION (100-150 mots) : Résumé des points clés + appel à l'action fort et spécifique.

7. MAILLAGE INTERNE : Intègre naturellement dans le texte des mentions des autres thématiques du site pour créer des opportunités de liens internes.

FORMAT DE RÉPONSE : JSON valide uniquement, sans texte avant ni après.

{
  "title": "Le titre H1 optimisé",
  "meta_description": "La méta description 150-160 caractères",
  "content": "Le contenu HTML complet avec toutes les balises"
}

Le contenu HTML doit utiliser : <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>. Pas de <html>, <body>, <head>.`;

  const message = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4000,
    system: `Tu es le meilleur rédacteur SEO francophone au monde. Chaque article que tu produis est unique, créatif, et génère du trafic organique réel. Tu ne produis jamais de contenu générique ou répétitif. Tu penses comme un éditeur de presse spécialisé qui veut captiver son lecteur tout en satisfaisant les algorithmes Google.`,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Format de réponse Claude invalide");

  const parsed = JSON.parse(jsonMatch[0]) as {
    title: string;
    meta_description: string;
    content: string;
  };

  return parsed;
}

// ─── Publication WordPress ────────────────────────────────────────────────────

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
      "ngrok-skip-browser-warning": "true",
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

// ─── Publication Shopify ──────────────────────────────────────────────────────

async function publishToShopify(
  storeUrl: string, apiKey: string,
  title: string, content: string, metaDescription: string
) {
  const baseUrl = storeUrl.replace(/\/$/, "");
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": apiKey,
  };

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
      body: JSON.stringify({ blog: { title: "Actualités SEO" } }),
    });
    if (!createBlogRes.ok) throw new Error(`Shopify create blog: ${await createBlogRes.text()}`);
    const newBlog = await createBlogRes.json();
    blogId = newBlog.blog.id;
    blogHandle = newBlog.blog.handle;
  }

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

// ─── Handler principal ────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const results: { site: string; cms: string; status: string; title?: string; error?: string }[] = [];

  try {
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

        // Compter les publications précédentes pour varier les formats
        const { count: publicationsCount } = await supabase
          .from("publications")
          .select("*", { count: "exact", head: true })
          .eq("site_id", site.id);

        // Analyser le site pour éviter les répétitions
        let existingTitles: string[] = [];

        if (site.cms === "wordpress") {
          const analysis = await analyzeWordPressSite(site.site_url, site.wp_username, site.wp_app_password);
          existingTitles = analysis.existingTitles;
        }

        // Choisir le mot-clé intelligemment (rotation séquentielle)
        const keywordIndex = (publicationsCount ?? 0) % keywords.length;
        const keyword = keywords[keywordIndex];

        // Générer l'article avec le moteur premium
        const { title, content, meta_description } = await generateArticle({
          keyword,
          allKeywords: keywords,
          businessName: site.business_name,
          industry: site.industry,
          existingTitles,
          publicationsCount: publicationsCount ?? 0,
        });

        let publishedUrl = "";

        if (site.cms === "wordpress") {
          publishedUrl = await publishToWordPress(
            site.site_url, site.wp_username, site.wp_app_password,
            title, content, meta_description
          );
        } else if (site.cms === "shopify") {
          publishedUrl = await publishToShopify(
            site.site_url, site.shopify_api_key,
            title, content, meta_description
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
