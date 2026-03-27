import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function scrapeHomepage(siteUrl: string): Promise<string> {
  try {
    const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOVO/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Extract visible text from key tags
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);
    return text;
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { answers } = await request.json() as {
      answers: {
        strengths: string;
        differentiators: string;
        targetAudience: string;
        geoScope: string;
        competitors: string;
      };
    };

    // Get site info
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, site_url, keywords")
      .eq("user_id", user.id)
      .single();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // Scrape homepage for context
    const homepageContent = await scrapeHomepage(site.site_url);

    const prompt = `Tu es un expert SEO de niveau mondial, spécialisé dans la création de stratégies de contenu organiques ultra-performantes.

CONTEXTE DU SITE :
- Nom : ${site.business_name}
- URL : ${site.site_url}
- Mots-clés actuels : ${(site.keywords ?? []).join(", ") || "aucun"}

CONTENU DE LA PAGE D'ACCUEIL (extrait) :
${homepageContent || "Non disponible"}

IMPORTANT : Pour déterminer le secteur d'activité, base-toi UNIQUEMENT sur le contenu textuel de la page d'accueil ci-dessus. N'infère jamais le secteur à partir du nom du site — il peut être trompeur ou sans rapport avec l'activité réelle.

RÉPONSES DU PROPRIÉTAIRE :
- Points forts : ${answers.strengths}
- Différenciateurs : ${answers.differentiators}
- Audience cible : ${answers.targetAudience}
- Portée géographique : ${answers.geoScope}
- Concurrents principaux : ${answers.competitors}

MISSION : Génère une stratégie SEO complète et un cocon sémantique optimisé.

RÈGLES ABSOLUES :
1. Les mots-clés doivent correspondre à la portée géographique (ex: "paris", "france", "europe" si pertinent)
2. Mix de mots-clés : 30% à fort volume (génériques), 50% longue traîne (transactionnels), 20% de niche (faciles à ranker)
3. Privilégie les mots-clés avec intention commerciale/transactionnelle
4. Génère EXACTEMENT 20 mots-clés prioritaires, du plus stratégique au moins
5. Chaque mot-clé doit être une vraie requête Google (pas un thème générique)

RÉPONSE : JSON uniquement, sans texte avant/après.

{
  "strategy_summary": "Résumé de la stratégie SEO en 3-4 phrases percutantes",
  "semantic_cocoon": {
    "pillar": "Le mot-clé pilier principal (1 seul, le plus important)",
    "clusters": [
      {
        "theme": "Nom du cluster thématique",
        "keywords": ["mot-clé 1", "mot-clé 2", "mot-clé 3"]
      }
    ]
  },
  "priority_keywords": [
    {
      "keyword": "requête google exacte",
      "intent": "informational|commercial|transactional|navigational",
      "difficulty": "easy|medium|hard",
      "priority": "high|medium|low",
      "rationale": "Pourquoi ce mot-clé est stratégique (1 phrase)"
    }
  ],
  "quick_wins": ["Mot-clé facile à ranker rapidement 1", "Mot-clé 2", "Mot-clé 3"],
  "content_angles": ["Angle de contenu différenciant 1", "Angle 2", "Angle 3"]
}`;

    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return Response.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    const analysis = JSON.parse(raw.slice(start, end + 1));

    // Extract all keywords from analysis + priority_keywords
    const allNewKeywords: string[] = [
      ...(analysis.priority_keywords ?? []).map((k: { keyword: string }) => k.keyword),
      ...(analysis.quick_wins ?? []),
    ];
    // Deduplicate and limit to 25
    const uniqueKeywords = [...new Set(allNewKeywords)].slice(0, 25);

    // Update site: save keywords + mark analysis done
    await supabase
      .from("sites")
      .update({
        keywords: uniqueKeywords,
        seo_analysis_done: true,
      })
      .eq("user_id", user.id);

    return Response.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
