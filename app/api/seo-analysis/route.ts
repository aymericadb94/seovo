import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { computeProjections, type GSCQuery } from "@/lib/seo-projections";
import { getValidAccessToken } from "@/lib/google";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ScrapedPage = {
  text: string;
  title: string;
  metaDesc: string;
  h1: string;
};

async function scrapeHomepage(siteUrl: string): Promise<ScrapedPage> {
  const empty = { text: "", title: "", metaDesc: "", h1: "" };
  try {
    const url = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RankPill/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const metaMatch =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    return {
      text,
      title: titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "",
      metaDesc: metaMatch?.[1]?.trim() ?? "",
      h1: h1Match?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "",
    };
  } catch {
    return empty;
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
      };
    };

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("business_name, industry, site_url, keywords, seo_context, gsc_site_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (siteError) return Response.json({ error: siteError.message }, { status: 500 });
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const page = await scrapeHomepage(site.site_url);

    const prompt = `Tu es un expert SEO de niveau mondial, spécialisé dans la création de stratégies de contenu organiques ultra-performantes.

CONTEXTE DU SITE :
- Nom : ${site.business_name}
- URL : ${site.site_url}
- Mots-clés actuels : ${(site.keywords ?? []).join(", ") || "aucun"}

SIGNAUX TECHNIQUES EXTRAITS :
- Balise <title> : ${page.title || "ABSENTE"}
- Meta description : ${page.metaDesc || "ABSENTE"}
- H1 : ${page.h1 || "ABSENT"}
- Contenu homepage : ${page.text ? `${page.text.slice(0, 2500)}` : "Non disponible"}

IMPORTANT : Pour déterminer le secteur d'activité, base-toi UNIQUEMENT sur le contenu textuel de la page d'accueil ci-dessus.

RÉPONSES DU PROPRIÉTAIRE :
- Points forts : ${answers.strengths}
- Différenciateurs : ${answers.differentiators}
- Audience cible : ${(site.seo_context as Record<string, string> | null)?.target_customer ?? "non renseigné"}
- Portée géographique : ${(site.seo_context as Record<string, string> | null)?.geography ?? "national"}
- Concurrents principaux : ${(site.seo_context as Record<string, unknown> | null)?.competitors ? ((site.seo_context as Record<string, unknown>).competitors as string[]).join(", ") : "non renseignés"}

MISSION : Génère un score SEO réel basé sur les signaux observés + une stratégie SEO complète.

RÈGLES ABSOLUES :
1. Les mots-clés doivent correspondre à la portée géographique
2. Mix de mots-clés : 30% fort volume, 50% longue traîne transactionnelle, 20% niche facile
3. Génère EXACTEMENT 20 mots-clés prioritaires
4. Chaque mot-clé doit être une vraie requête Google
5. Le score SEO doit refléter l'état RÉEL du site avant d'utiliser RankPill (pas de score gonflé)

RÉPONSE : JSON uniquement, sans texte avant/après.

{
  "seo_score": {
    "overall": <number 0-100, score global basé sur title/meta/H1/contenu observés>,
    "breakdown": {
      "qualite_contenu": <number 0-100, richesse et pertinence du contenu homepage>,
      "optimisation_meta": <number 0-100, présence et qualité de title + meta description + H1>,
      "ciblage_mots_cles": <number 0-100, alignement entre contenu actuel et intention de recherche>,
      "potentiel_croissance": <number 0-100, estimation du potentiel SEO inexploité>
    },
    "verdict": "Diagnostic SEO en 1-2 phrases percutantes décrivant l'état actuel et ce qu'il manque"
  },
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

    let analysis: { priority_keywords: { keyword: string }[]; quick_wins?: string[]; seo_score?: { overall?: number } } & Record<string, unknown>;
    try {
      analysis = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return Response.json({ error: "Réponse Claude non parseable" }, { status: 500 });
    }

    if (!Array.isArray(analysis.priority_keywords)) {
      return Response.json({ error: "Structure d'analyse invalide (priority_keywords manquant)" }, { status: 500 });
    }

    const allNewKeywords: string[] = [
      ...(analysis.priority_keywords as { keyword: string }[]).map((k) => k.keyword).filter(Boolean),
      ...((analysis.quick_wins as string[] | undefined) ?? []).filter(Boolean),
    ];
    const uniqueKeywords = [...new Set(allNewKeywords)].slice(0, 25);

    if (uniqueKeywords.length === 0) {
      return Response.json({ error: "Aucun mot-clé généré par l'analyse" }, { status: 500 });
    }

    const { error: updateError } = await supabase
      .from("sites")
      .update({
        keywords: uniqueKeywords,
        seo_analysis_done: true,
        seo_score_initial: analysis.seo_score?.overall ?? null,
      })
      .eq("user_id", user.id);

    if (updateError) {
      return Response.json({ error: "Analyse générée mais sauvegarde échouée : " + updateError.message }, { status: 500 });
    }

    // Calcul automatique des projections SEO — avec GSC si disponible (connecté à l'onboarding)
    try {
      const seoScore = analysis.seo_score?.overall ?? 35;
      let gscQueries: GSCQuery[] = [];
      if ((site as { gsc_site_url?: string | null }).gsc_site_url) {
        try {
          const token = await getValidAccessToken(user.id);
          if (token) {
            const gscSiteUrl = (site as { gsc_site_url: string }).gsc_site_url;
            const end = new Date(); end.setDate(end.getDate() - 2);
            const start = new Date(); start.setDate(start.getDate() - 32);
            const fmt = (d: Date) => d.toISOString().split("T")[0];
            const gscRes = await fetch(
              `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(gscSiteUrl)}/searchAnalytics/query`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ["query"], rowLimit: 100 }),
              }
            );
            if (gscRes.ok) {
              type Row = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
              const gscData = await gscRes.json() as { rows?: Row[] };
              gscQueries = (gscData.rows ?? []).map((r) => ({
                query: r.keys[0],
                clicks: r.clicks,
                impressions: r.impressions,
                ctr: r.ctr,
                position: Math.round(r.position * 10) / 10,
              }));
            }
          }
        } catch { /* GSC fetch non-fatal */ }
      }
      const projections = computeProjections(
        uniqueKeywords,
        gscQueries,
        seoScore,
        (site.seo_context as Record<string, unknown> | null),
        site.site_url
      );
      await supabase
        .from("seo_projections")
        .upsert(
          { user_id: user.id, data: projections, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch {
      // Non-fatal : l'analyse est déjà sauvegardée, les projections seront calculées au prochain chargement
    }

    return Response.json({ analysis });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
