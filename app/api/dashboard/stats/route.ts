import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

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
      .maybeSingle();

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
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const pubsToday = pubs.filter(p => new Date(p.published_at) >= startOfToday).length;

    // Mots-clés uniques couverts
    const coveredKeywords = [...new Set(pubs.map(p => p.keyword).filter(Boolean))];

    // Tous les mots-clés configurés
    const allKeywords: string[] = site?.keywords ?? [];

    // Score SEO : basé sur la couverture des mots-clés et la fréquence de publication
    const keywordCoverage = allKeywords.length > 0
      ? (coveredKeywords.length / allKeywords.length) * 100
      : 0;
    const baseScore = site?.seo_score_initial ?? 20;
    const seoScore = Math.min(
      Math.round(baseScore + (totalArticles * 2) + (keywordCoverage * 0.3)),
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

    // Mots-clés jamais couverts (brut)
    const rawUncovered = allKeywords.filter(
      kw => !pubs.some(p => p.keyword === kw)
    );

    // ── Données GSC pour priorisation ───────────────────────────────────────
    type GscKwData = { impressions: number; clicks: number; position: number };
    const gscMap: Record<string, GscKwData> = {};

    if (site?.google_access_token && site?.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const siteUrl = encodeURIComponent(site.gsc_site_url);
          const endDate = new Date(now);
          endDate.setDate(endDate.getDate() - 2);
          const startDate = new Date(now);
          startDate.setDate(startDate.getDate() - 90);

          const res = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                startDate: startDate.toISOString().split("T")[0],
                endDate: endDate.toISOString().split("T")[0],
                dimensions: ["query"],
                rowLimit: 500,
              }),
            }
          );

          if (res.ok) {
            type GscRow = { keys: string[]; clicks: number; impressions: number; position: number };
            const data = await res.json() as { rows?: GscRow[] };
            for (const row of data.rows ?? []) {
              const query = row.keys[0].toLowerCase();
              gscMap[query] = {
                impressions: row.impressions,
                clicks: row.clicks,
                position: Math.round(row.position * 10) / 10,
              };
            }
          }
        }
      } catch {
        // GSC optionnel — on continue sans
      }
    }

    // ── Priorisation des mots-clés non couverts ──────────────────────────────
    // Pour chaque mot-clé non couvert, cherche une correspondance GSC
    // (exact ou si la requête GSC contient le mot-clé, on prend la meilleure correspondance)
    type UncoveredKw = {
      keyword: string;
      impressions: number | null;
      clicks: number | null;
      position: number | null;
    };

    const uncoveredKeywords: UncoveredKw[] = rawUncovered.map(kw => {
      const kwLower = kw.toLowerCase();
      // Cherche correspondance exacte d'abord
      if (gscMap[kwLower]) {
        return { keyword: kw, ...gscMap[kwLower] };
      }
      // Sinon, meilleure correspondance partielle (requête GSC qui contient le mot-clé)
      let best: GscKwData | null = null;
      for (const [query, data] of Object.entries(gscMap)) {
        if (query.includes(kwLower) || kwLower.includes(query)) {
          if (!best || data.impressions > best.impressions) {
            best = data;
          }
        }
      }
      return {
        keyword: kw,
        impressions: best?.impressions ?? null,
        clicks: best?.clicks ?? null,
        position: best?.position ?? null,
      };
    });

    // Tri : d'abord ceux avec données GSC (impressions desc), puis sans données
    uncoveredKeywords.sort((a, b) => {
      if (a.impressions !== null && b.impressions !== null) return b.impressions - a.impressions;
      if (a.impressions !== null) return -1;
      if (b.impressions !== null) return 1;
      return 0;
    });

    // ── Prochaine publication ────────────────────────────────────────────────
    // Prochaine publication à 12h00 heure de Paris = 11h00 UTC
    const lastPub = pubs[0] ? new Date(pubs[0].published_at) : null;
    let nextDate: Date;
    if (lastPub) {
      // Depuis la dernière pub, planifier J+1 à 11h UTC
      nextDate = new Date(lastPub);
      nextDate.setDate(nextDate.getDate() + 1);
      nextDate.setUTCHours(11, 0, 0, 0);
      // Si déjà passé (ex : pub très ancienne), avancer au prochain 11h UTC
      if (nextDate.getTime() <= now.getTime()) {
        nextDate = new Date(now);
        nextDate.setUTCHours(11, 0, 0, 0);
        if (nextDate.getTime() <= now.getTime()) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
      }
    } else {
      // Aucune pub : prochain 11h UTC (aujourd'hui si pas encore passé, sinon demain)
      nextDate = new Date(now);
      nextDate.setUTCHours(11, 0, 0, 0);
      if (nextDate.getTime() <= now.getTime()) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
    }
    const nextPublicationAt: string = nextDate.toISOString();

    // ── Streak de publication ────────────────────────────────────────────────
    const toKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const pubDaySet = new Set(pubs.map(p => toKey(new Date(p.published_at))));

    let streak = 0;
    const checkDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    while (pubDaySet.has(toKey(checkDay))) {
      streak++;
      checkDay.setDate(checkDay.getDate() - 1);
    }

    const sortedDays = [...pubDaySet].sort();
    let bestStreak = streak;
    let runStreak = 0;
    for (let i = 0; i < sortedDays.length; i++) {
      if (i === 0) {
        runStreak = 1;
      } else {
        const prev = new Date(sortedDays[i - 1]);
        const curr = new Date(sortedDays[i]);
        runStreak = (curr.getTime() - prev.getTime()) / 86400000 === 1 ? runStreak + 1 : 1;
      }
      if (runStreak > bestStreak) bestStreak = runStreak;
    }

    // ── Calendrier (90 jours) ────────────────────────────────────────────────
    const calendarData: { date: string; count: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayStart = d;
      const dayEnd = new Date(d.getTime() + 86400000);
      const count = pubs.filter(p => {
        const t = new Date(p.published_at);
        return t >= dayStart && t < dayEnd;
      }).length;
      calendarData.push({ date: toKey(d), count });
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
        frequency: site.frequency,
        seo_analysis_done: site.seo_analysis_done ?? false,
        gsc_connected: !!site.google_access_token,
        gsc_site_url: site.gsc_site_url ?? null,
        seo_context: site.seo_context ?? null,
      } : null,
      kpis: {
        totalArticles,
        articlesThisMonth,
        articlesThisWeek,
        pubsToday,
        coveredKeywords: coveredKeywords.length,
        totalKeywords: allKeywords.length,
        seoScore,
        nextPublicationAt,
        streak,
        bestStreak,
      },
      pubsChart,
      keywordStats,
      uncoveredKeywords,
      calendarData,
      recentPublications,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
