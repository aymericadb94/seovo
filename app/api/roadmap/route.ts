import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: roadmap } = await supabase
      .from("roadmaps")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return Response.json({ roadmap: roadmap ?? null });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("id, business_name, industry, site_url, keywords")
      .eq("user_id", user.id)
      .single();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const { data: pubs } = await supabase
      .from("publications")
      .select("title, keyword")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false })
      .limit(20);

    const existingTitles = (pubs ?? []).map(p => p.title);
    const keywords = (site.keywords ?? []).join(", ") || "non configurés";

    const prompt = `Tu es un expert SEO senior spécialisé en stratégie de contenu avancée et en domination des résultats Google en 2026.

Ta mission est de réaliser une analyse stratégique complète pour ce site web et de générer une roadmap éditoriale de 40 articles de blog.

SITE : ${site.business_name}
SECTEUR : ${site.industry}
URL : ${site.site_url}
MOTS-CLÉS CONFIGURÉS : ${keywords}
ARTICLES DÉJÀ PUBLIÉS : ${existingTitles.length > 0 ? existingTitles.slice(0, 10).map(t => `"${t}"`).join(", ") : "aucun"}

---

OBJECTIFS :
- Identifier les opportunités SEO à fort potentiel
- Construire un cocon sémantique puissant
- Générer 40 articles utiles, différenciants et stratégiques
- Attirer du trafic qualifié et convertir les visiteurs en clients
- Respecter les critères EEAT
- Ne jamais dupliquer les articles déjà publiés listés ci-dessus

CONTRAINTES CRITIQUES :
- Aucun contenu générique ou déjà vu
- Chaque article doit répondre à une intention de recherche précise
- Chaque article doit mériter d'être premier sur Google (si ce n'est pas clair, ne pas le proposer)
- Les articles en pilier doivent couvrir des thèmes larges ; les clusters des angles spécifiques

---

RÉPONSE : JSON uniquement, sans texte avant ou après. Structure exacte :

{
  "business_analysis": {
    "summary": "Résumé du business en 2 phrases",
    "main_offers": ["offre 1", "offre 2"],
    "positioning": "Positionnement différenciant",
    "target_customers": "Description des clients cibles",
    "seo_maturity": "débutant|intermédiaire|avancé",
    "competitive_advantages": ["avantage 1", "avantage 2"]
  },
  "articles": [
    {
      "id": 1,
      "title": "Titre optimisé naturel non robotique",
      "keyword": "mot-clé principal",
      "intent": "informationnelle|commerciale|transactionnelle|navigationnelle",
      "angle": "Angle différenciant unique qui justifie d'être premier",
      "why_rank": "Pourquoi cet article peut ranker (1 phrase factuelle)",
      "difficulty": "facile|moyen|difficile",
      "conversion": "faible|moyen|fort",
      "objective": "trafic|autorité|conversion",
      "role": "pilier|cluster|support",
      "related": [2, 5],
      "summary": "Résumé en 1 phrase percutante",
      "key_points": ["point 1", "point 2"],
      "priority": 1
    }
  ],
  "phases": [
    {
      "phase": 1,
      "label": "Fondations",
      "weeks": "Semaines 1-4",
      "ids": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      "rationale": "Pourquoi commencer par ces articles"
    },
    {
      "phase": 2,
      "label": "Expansion",
      "weeks": "Semaines 5-10",
      "ids": [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      "rationale": "Logique de la deuxième phase"
    },
    {
      "phase": 3,
      "label": "Domination",
      "weeks": "Semaines 11-20",
      "ids": [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
      "rationale": "Logique de la phase finale"
    }
  ],
  "internal_linking_rules": [
    "Règle de maillage interne 1",
    "Règle de maillage interne 2",
    "Règle de maillage interne 3"
  ],
  "editorial_guidelines": "Directives éditoriales anti-IA en 3-4 phrases : ton, style, exemples, patterns à éviter"
}

IMPORTANT : génère exactement 40 articles. IDs de 1 à 40. Priorités de 1 (urgent) à 40. Sois concis dans chaque champ — la qualité stratégique prime sur la longueur.`;

    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return Response.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    let data: unknown;
    try {
      data = JSON.parse(raw.slice(start, end + 1));
    } catch (parseErr) {
      console.error("[roadmap] JSON.parse failed:", String(parseErr), "raw slice:", raw.slice(start, start + 200));
      return Response.json({ error: "Réponse Claude non parseable" }, { status: 500 });
    }

    // Delete old roadmap for this user and insert new
    await supabase.from("roadmaps").delete().eq("user_id", user.id);

    const { data: saved, error: saveError } = await supabase
      .from("roadmaps")
      .insert({ user_id: user.id, site_id: site.id, data })
      .select()
      .single();

    if (saveError) {
      console.error("[roadmap] Supabase insert error:", saveError.message);
      return Response.json({ error: saveError.message }, { status: 500 });
    }
    return Response.json({ roadmap: saved });
  } catch (err: unknown) {
    console.error("[roadmap] exception:", err);
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
