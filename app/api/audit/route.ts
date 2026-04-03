import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const month = currentMonth();

    // Latest audit
    const { data: latest } = await supabase
      .from("audits")
      .select("*")
      .eq("user_id", user.id)
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isAvailable = !latest || latest.month < month;

    return Response.json({ audit: latest ?? null, isAvailable, currentMonth: month });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const month = currentMonth();

    // Already exists for this month?
    const { data: existing } = await supabase
      .from("audits")
      .select("id")
      .eq("user_id", user.id)
      .eq("month", month)
      .maybeSingle();

    if (existing) {
      const { data: full } = await supabase.from("audits").select("*").eq("id", existing.id).single();
      return Response.json({ audit: full });
    }

    // Gather data
    const { data: site } = await supabase
      .from("sites")
      .select("id, business_name, industry, site_url, keywords, seo_score_initial")
      .eq("user_id", user.id)
      .single();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const { data: allPubs } = await supabase
      .from("publications")
      .select("title, keyword, published_at, wordpress_url")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false });

    const pubs = allPubs ?? [];
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthPubs = pubs.filter(p => new Date(p.published_at) >= thisMonthStart);
    const lastMonthPubs = pubs.filter(p => {
      const d = new Date(p.published_at);
      return d >= lastMonthStart && d < thisMonthStart;
    });

    // Previous audit for score comparison
    const { data: prevAudit } = await supabase
      .from("audits")
      .select("data")
      .eq("user_id", user.id)
      .lt("month", month)
      .order("month", { ascending: false })
      .limit(1)
      .maybeSingle();

    const prevScore = prevAudit
      ? (prevAudit.data as { overall_score?: number }).overall_score ?? null
      : (site.seo_score_initial ?? null);

    const coveredKeywords = [...new Set(pubs.map((p) => p.keyword).filter(Boolean))];
    const totalKeywords = (site.keywords ?? []).length;
    const currentScore = Math.min(
      Math.round((site.seo_score_initial ?? 20) + (pubs.length * 2) + (totalKeywords > 0 ? (coveredKeywords.length / totalKeywords) * 10 : 0)),
      98
    );

    const prompt = `Tu es un expert SEO senior qui réalise un audit mensuel complet pour un site web.

SITE : ${site.business_name} (${site.industry}) — ${site.site_url}
MOIS AUDITÉ : ${monthLabel(month)}
MOTS-CLÉS CONFIGURÉS : ${(site.keywords ?? []).join(", ") || "aucun"} (${totalKeywords} au total)

PUBLICATIONS CE MOIS (${thisMonthPubs.length}) :
${thisMonthPubs.map(p => `- "${p.title}" (mot-clé: ${p.keyword})`).join("\n") || "Aucune publication ce mois"}

PUBLICATIONS MOIS PRÉCÉDENT (${lastMonthPubs.length}) :
${lastMonthPubs.slice(0, 5).map(p => `- "${p.title}"`).join("\n") || "Aucune"}

TOTAL PUBLICATIONS HISTORIQUES : ${pubs.length}
MOTS-CLÉS COUVERTS : ${coveredKeywords.length}/${totalKeywords}
SCORE SEO ACTUEL : ${currentScore}/100
SCORE MOIS PRÉCÉDENT : ${prevScore ?? "inconnu"}

MISSION : Génère un audit SEO mensuel professionnel, factuel et utile.

RÈGLES :
1. Sois précis et concret — pas de généralités vides de sens
2. Les recommandations doivent être actionnables immédiatement
3. Adapte le diagnostic au nombre réel de publications
4. Le score_evolution doit être honnête (peut être négatif)

RÉPONSE : JSON uniquement, sans texte avant/après.

{
  "overall_score": ${currentScore},
  "score_previous": ${prevScore ?? currentScore},
  "score_evolution": ${prevScore !== null ? currentScore - prevScore : 0},
  "summary": "Résumé exécutif percutant de 2-3 phrases sur le mois",
  "highlights": ["Point positif concret 1", "Point positif 2", "Point positif 3"],
  "improvements": ["Point à améliorer précis 1", "Point à améliorer 2", "Point à améliorer 3"],
  "recommendations": [
    {
      "title": "Titre court de la recommandation",
      "description": "Description actionnable en 1-2 phrases",
      "priority": "high"
    },
    {
      "title": "Recommandation 2",
      "description": "Description",
      "priority": "medium"
    },
    {
      "title": "Recommandation 3",
      "description": "Description",
      "priority": "low"
    }
  ],
  "next_month_focus": "Le conseil le plus important à appliquer le mois prochain (1-2 phrases)"
}`;

    const msg = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return Response.json({ error: "Réponse invalide" }, { status: 500 });
    }

    let auditData: Record<string, unknown>;
    try {
      auditData = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return Response.json({ error: "Réponse Claude non parseable" }, { status: 500 });
    }

    // Enrich with real stats
    const fullData = {
      ...auditData,
      month_label: monthLabel(month),
      kpis: {
        articles_this_month: thisMonthPubs.length,
        articles_last_month: lastMonthPubs.length,
        keywords_covered: coveredKeywords.length,
        total_keywords: totalKeywords,
        total_articles: pubs.length,
      },
      top_articles: thisMonthPubs.slice(0, 5).map(p => ({
        title: p.title,
        keyword: p.keyword,
        published_at: p.published_at,
        url: p.wordpress_url,
      })),
    };

    const { data: saved, error: saveError } = await supabase
      .from("audits")
      .insert({ user_id: user.id, site_id: site.id, month, data: fullData })
      .select()
      .single();

    if (saveError) return Response.json({ error: saveError.message }, { status: 500 });
    return Response.json({ audit: saved });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
