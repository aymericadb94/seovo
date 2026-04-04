import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 120;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: record, error } = await supabase
      .from("internal_linking")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code === "PGRST205") {
      return Response.json({ result: null, tableNotReady: true });
    }

    return Response.json({ result: record ?? null });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // Récupérer le site
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, site_url, keywords")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // Récupérer les publications
    const { data: pubs } = await supabase
      .from("publications")
      .select("id, title, keyword, wordpress_url, published_at")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false });

    const articles = pubs ?? [];

    if (articles.length < 5) {
      return Response.json({ error: "Pas assez d'articles (minimum 5)" }, { status: 400 });
    }

    // Récupérer la roadmap si disponible
    const { data: roadmapRec } = await supabase
      .from("roadmaps")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    type RoadmapArticle = { title: string; keyword: string; role: string; phase?: number };
    const roadmapArticles: RoadmapArticle[] = (roadmapRec?.data as { articles?: RoadmapArticle[] } | null)?.articles?.slice(0, 20) ?? [];

    const pagesContext = articles.map((a, i) =>
      `${i + 1}. "${a.title}" — mot-clé: "${a.keyword}" — URL: ${a.wordpress_url ?? "/article-" + a.id}`
    ).join("\n");

    const roadmapContext = roadmapArticles.length > 0
      ? `\n\nROADMAP SEO (pages à venir — à inclure dans les suggestions de maillage futur) :\n${roadmapArticles.map((a, i) => `${i + 1}. "${a.title}" (${a.keyword}) — rôle: ${a.role}`).join("\n")}`
      : "";

    const prompt = `Tu es un expert senior en référencement SEO spécialisé dans le maillage interne avancé, le cocon sémantique et la distribution du PageRank interne.

SITE : ${site.business_name} — ${site.industry} — ${site.site_url}
MOTS-CLÉS CONFIGURÉS : ${(site.keywords ?? []).join(", ")}

PAGES EXISTANTES (articles publiés) :
${pagesContext}${roadmapContext}

---

MISSION : Analyse ce site et génère un maillage interne intelligent.

OBJECTIFS :
1. Identifier les clusters sémantiques parmi les pages existantes
2. Détecter les pages piliers vs pages secondaires
3. Identifier les pages orphelines (peu ou pas liées)
4. Générer des suggestions de liens concrètes et actionnables (avec anchres prêtes à copier)
5. Calculer un score de maillage global (0-100)

RÈGLES STRICTES :
- Max 3 à 5 liens par page
- Anchres naturelles et variées (pas de sur-optimisation)
- Cohérence thématique obligatoire
- Qualité > quantité
- Penser comme un expert SEO humain, pas une machine

FORMAT DE RÉPONSE : JSON valide uniquement, aucun texte avant ou après.

{
  "score": <number 0-100, score global de maillage actuel>,
  "score_label": "Faible|Moyen|Bon|Excellent",
  "score_comment": "Diagnostic en 1-2 phrases du maillage actuel",
  "cluster_analysis": [
    {
      "name": "Nom du cluster thématique",
      "pillar": "Titre de la page pilier",
      "pages": ["Titre page 1", "Titre page 2"],
      "missing_links": <number, liens manquants estimés dans ce cluster>
    }
  ],
  "suggestions": [
    {
      "from_title": "Titre de la page source",
      "from_url": "URL de la page source",
      "to_title": "Titre de la page cible",
      "to_url": "URL de la page cible",
      "anchor": "Texte d'ancre naturel prêt à copier",
      "placement": "intro|body|conclusion",
      "objective": "SEO|navigation|conversion",
      "priority": "haute|moyenne|faible"
    }
  ],
  "orphan_pages": [
    {
      "title": "Titre de la page orpheline",
      "url": "URL",
      "reason": "Pourquoi cette page est orpheline"
    }
  ],
  "opportunities": [
    "Opportunité d'optimisation 1 en 1 phrase",
    "Opportunité 2",
    "Opportunité 3"
  ]
}`;

    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return Response.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    let result: unknown;
    try {
      result = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return Response.json({ error: "Réponse Claude non parseable" }, { status: 500 });
    }

    // Sauvegarder (upsert — silencieux si la table n'existe pas encore)
    try {
      await supabase
        .from("internal_linking")
        .upsert(
          { user_id: user.id, data: result, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch { /* table pas encore créée — non bloquant */ }

    return Response.json({ result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
