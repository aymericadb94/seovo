import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    // ── Récupérer le site de l'utilisateur ──────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // ── Récupérer toutes les publications ───────────────────────────────────
    const { data: publications } = await supabase
      .from("publications")
      .select("*")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false });

    const pubs = publications ?? [];

    // ── KPIs ────────────────────────────────────────────────────────────────
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());

    const totalArticles = pubs.length;
    const articlesThisMonth = pubs.filter(p => new Date(p.published_at) >= startOfMonth).length;
    const articlesThisWeek = pubs.filter(p => new Date(p.published_at) >= startOfWeek).length;

    // Mots-clés uniques couverts
    const coveredKeywords = [...new Set(pubs.map(p => p.keyword).filter(Boolean))];

    // Tous les mots-clés configurés
    const allKeywords: string[] = site?.keywords ?? [];

    // Score SEO : basé sur la couverture des mots-clés et la fréquence de publication
    const keywordCoverage = allKeywords.length > 0
      ? (coveredKeywords.length / allKeywords.length) * 100
      : 0;
    const seoScore = Math.min(
      Math.round(40 + (totalArticles * 2) + (keywordCoverage * 0.3)),
      98
    );

    // ── Graphique publications 30 derniers jours ─────────────────────────────
    const pubsChart: { date: string; articles: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const count = pubs.filter(p => {
        const t = new Date(p.published_at);
        return t >= dayStart && t < dayEnd;
      }).length;
      pubsChart.push({ date: label, articles: count });
    }

    // ── Couverture par mot-clé ───────────────────────────────────────────────
    const keywordStats = allKeywords.map(kw => ({
      keyword: kw,
      count: pubs.filter(p => p.keyword === kw).length,
      lastPublished: pubs.find(p => p.keyword === kw)?.published_at ?? null,
    }));

    // Mots-clés jamais couverts
    const uncoveredKeywords = allKeywords.filter(
      kw => !pubs.some(p => p.keyword === kw)
    );

    // ── Prochaine publication ────────────────────────────────────────────────
    const frequency = site?.frequency ?? 1;
    const lastPub = pubs[0] ? new Date(pubs[0].published_at) : null;
    let nextPublicationIn = "Demain 8h00";
    if (lastPub) {
      const next = new Date(lastPub);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      const diffMs = next.getTime() - now.getTime();
      if (diffMs > 0) {
        const diffH = Math.floor(diffMs / 3600000);
        const diffM = Math.floor((diffMs % 3600000) / 60000);
        nextPublicationIn = diffH > 0 ? `Dans ${diffH}h${diffM > 0 ? diffM + "min" : ""}` : `Dans ${diffM} min`;
      } else {
        nextPublicationIn = "Très prochainement";
      }
    }

    // ── Publications récentes (pour la table) ────────────────────────────────
    const recentPublications = pubs.slice(0, 20).map(p => ({
      id: p.id,
      title: p.title,
      keyword: p.keyword,
      url: p.wordpress_url,
      published_at: p.published_at,
    }));

    return Response.json({
      site: site ? {
        business_name: site.business_name,
        industry: site.industry,
        cms: site.cms,
        site_url: site.site_url,
        frequency,
      } : null,
      kpis: {
        totalArticles,
        articlesThisMonth,
        articlesThisWeek,
        coveredKeywords: coveredKeywords.length,
        totalKeywords: allKeywords.length,
        seoScore,
        nextPublicationIn,
      },
      pubsChart,
      keywordStats,
      uncoveredKeywords,
      recentPublications,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
