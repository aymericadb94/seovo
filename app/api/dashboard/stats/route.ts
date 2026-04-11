import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { logger } from "@/lib/logger";

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

    // Score SEO : calcul intelligent multi-sources
    // Le score final sera calculé après récupération des données GSC (voir plus bas)
    const keywordCoverageRatio = allKeywords.length > 0
      ? coveredKeywords.length / allKeywords.length
      : 0;

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
      } catch (err) {
        logger.warn("GSC data fetch failed for dashboard", { context: "dashboard/stats", userId: user.id, error: err });
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
    // Toujours le prochain créneau 11h UTC depuis maintenant (max ~24h)
    const nextDate = new Date(now);
    nextDate.setUTCHours(11, 0, 0, 0);
    if (nextDate.getTime() <= now.getTime()) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    const nextPublicationAt: string = nextDate.toISOString();

    // ── Streak de publication ────────────────────────────────────────────────
    const toKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const pubDaySet = new Set(pubs.map(p => toKey(new Date(p.published_at))));

    let streak = 0;
    const checkDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Si pas encore publié aujourd'hui, commencer le comptage depuis hier
    if (!pubDaySet.has(toKey(checkDay))) {
      checkDay.setDate(checkDay.getDate() - 1);
    }
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

    // ── Données cocon sémantique (pour score structure + couverture) ────────
    const { data: cocoonRec } = await supabase
      .from("semantic_cocoons")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    type CocoonCluster = {
      pillar?: { status?: string };
      support_pages?: { status?: string }[];
    };
    type CocoonData = {
      clusters?: CocoonCluster[];
      orphan_pages?: unknown[];
    };
    const cocoon = cocoonRec?.data as CocoonData | null;

    // ── GSC tendance : 30 derniers jours vs 30 jours précédents ─────────────
    let gscTrend: { clicksDelta: number; impressionsDelta: number } | null = null;
    const gscEntries = Object.values(gscMap);
    const hasGsc = gscEntries.length > 0;

    if (hasGsc && site?.google_access_token && site?.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const siteUrl = encodeURIComponent(site.gsc_site_url);
          // Période récente : J-32 → J-2 (30 jours)
          const recentEnd = new Date(now); recentEnd.setDate(recentEnd.getDate() - 2);
          const recentStart = new Date(now); recentStart.setDate(recentStart.getDate() - 32);
          // Période précédente : J-62 → J-32
          const prevEnd = new Date(now); prevEnd.setDate(prevEnd.getDate() - 32);
          const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 62);
          const fmt = (d: Date) => d.toISOString().split("T")[0];

          const [resRecent, resPrev] = await Promise.all([
            fetch(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ startDate: fmt(recentStart), endDate: fmt(recentEnd), rowLimit: 1 }),
            }),
            fetch(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ startDate: fmt(prevStart), endDate: fmt(prevEnd), rowLimit: 1 }),
            }),
          ]);

          if (resRecent.ok && resPrev.ok) {
            type TrendRow = { rows?: { clicks: number; impressions: number }[] };
            const recent = await resRecent.json() as TrendRow;
            const prev = await resPrev.json() as TrendRow;
            const rc = recent.rows?.[0]?.clicks ?? 0;
            const ri = recent.rows?.[0]?.impressions ?? 0;
            const pc = prev.rows?.[0]?.clicks ?? 0;
            const pi = prev.rows?.[0]?.impressions ?? 0;
            gscTrend = {
              clicksDelta: pc > 0 ? Math.round(((rc - pc) / pc) * 100) : (rc > 0 ? 100 : 0),
              impressionsDelta: pi > 0 ? Math.round(((ri - pi) / pi) * 100) : (ri > 0 ? 100 : 0),
            };
          }
        }
      } catch { /* tendance non-fatal */ }
    }

    // ── Score SEO — 4 piliers réels ──────────────────────────────────────────
    // Visibilité (0-30) | Trafic (0-25) | Couverture (0-25) | Structure (0-20)

    // 1. VISIBILITÉ : nombre de mots-clés par tranche de position
    let scoreVisibility = 0;
    if (hasGsc) {
      const top3 = gscEntries.filter(g => g.position <= 3).length;
      const top10 = gscEntries.filter(g => g.position > 3 && g.position <= 10).length;
      const top20 = gscEntries.filter(g => g.position > 10 && g.position <= 20).length;
      const top50 = gscEntries.filter(g => g.position > 20 && g.position <= 50).length;
      // top3 = 4pts chacun (max 12), top10 = 2pts (max 10), top20 = 0.5pts (max 5), top50 = 0.15pts (max 3)
      scoreVisibility = Math.min(30, Math.round(
        Math.min(12, top3 * 4) +
        Math.min(10, top10 * 2) +
        Math.min(5, top20 * 0.5) +
        Math.min(3, top50 * 0.15)
      ));
    }

    // 2. TRAFIC : clics + CTR réel vs CTR attendu par position
    let scoreTraffic = 0;
    if (hasGsc) {
      const totalClicks = gscEntries.reduce((s, g) => s + g.clicks, 0);
      const totalImpressions = gscEntries.reduce((s, g) => s + g.impressions, 0);
      // Sous-score clics : normalisé log (10 clics = 5pts, 100 = 10pts, 1000 = 15pts)
      const clickScore = totalClicks > 0 ? Math.min(15, Math.round(5 * Math.log10(totalClicks) * 2)) : 0;
      // Sous-score CTR : CTR réel vs CTR attendu
      // CTR attendu par position : pos1=30%, pos3=10%, pos5=5%, pos10=2%, pos20+=0.5%
      const expectedCtr = (pos: number) => pos <= 1 ? 0.30 : pos <= 3 ? 0.10 : pos <= 5 ? 0.05 : pos <= 10 ? 0.02 : 0.005;
      let ctrRatio = 0;
      if (totalImpressions > 0) {
        const realCtr = totalClicks / totalImpressions;
        const avgPos = gscEntries.reduce((s, g) => s + g.position * g.impressions, 0) / totalImpressions;
        const expected = expectedCtr(avgPos);
        ctrRatio = expected > 0 ? realCtr / expected : 0;
      }
      // ctrRatio >= 1.0 = excellent (10pts), 0.5 = moyen (5pts), 0 = mauvais
      const ctrScore = Math.min(10, Math.round(ctrRatio * 10));
      scoreTraffic = Math.min(25, clickScore + ctrScore);
    }

    // 3. COUVERTURE : pages du cocon existantes vs totales + keywords couverts
    let scoreCoverage = 0;
    if (cocoon?.clusters && cocoon.clusters.length > 0) {
      // Ratio pages existantes dans le cocon
      let totalPages = 0;
      let existingPages = 0;
      for (const cluster of cocoon.clusters) {
        totalPages++; // pilier
        if (cluster.pillar?.status === "existing" || cluster.pillar?.status === "existant") existingPages++;
        for (const sp of cluster.support_pages ?? []) {
          totalPages++;
          if (sp.status === "existing" || sp.status === "existant") existingPages++;
        }
      }
      const cocoonRatio = totalPages > 0 ? existingPages / totalPages : 0;
      // Cocon coverage : 0-15 pts
      scoreCoverage += Math.min(15, Math.round(cocoonRatio * 15));
    }
    // Keyword coverage : 0-10 pts
    scoreCoverage += Math.min(10, Math.round(keywordCoverageRatio * 10));
    scoreCoverage = Math.min(25, scoreCoverage);

    // 4. STRUCTURE : clusters complets + pages orphelines pénalisées
    let scoreStructure = 0;
    if (cocoon?.clusters && cocoon.clusters.length > 0) {
      // Clusters complets : un cluster est "complet" si le pilier + toutes les supports sont "existing"
      let completeClusters = 0;
      for (const cluster of cocoon.clusters) {
        const pillarOk = cluster.pillar?.status === "existing" || cluster.pillar?.status === "existant";
        const supports = cluster.support_pages ?? [];
        const allSupportsOk = supports.length > 0 && supports.every(sp => sp.status === "existing" || sp.status === "existant");
        if (pillarOk && allSupportsOk) completeClusters++;
      }
      const clusterRatio = completeClusters / cocoon.clusters.length;
      // 0-14 pts pour les clusters complets
      scoreStructure += Math.min(14, Math.round(clusterRatio * 14));

      // Pénalité pages orphelines : -1pt par orpheline (max -6)
      const orphanCount = cocoon.orphan_pages?.length ?? 0;
      scoreStructure = Math.max(0, scoreStructure - Math.min(6, orphanCount));
    }
    // Bonus : avoir un cocon (6pts)
    if (cocoon?.clusters && cocoon.clusters.length > 0) scoreStructure += 6;
    scoreStructure = Math.min(20, scoreStructure);

    // Score final
    const hasGscData = hasGsc;
    const maxScore = hasGscData ? 100 : 45; // Sans GSC, seuls couverture + structure comptent
    const rawScore = hasGscData
      ? scoreVisibility + scoreTraffic + scoreCoverage + scoreStructure
      : scoreCoverage + scoreStructure;
    const seoScore = Math.min(maxScore === 45 ? 44 : 98, rawScore);

    // Détail des piliers pour le frontend
    const scoreBreakdown = {
      visibility: { score: scoreVisibility, max: 30 },
      traffic: { score: scoreTraffic, max: 25 },
      coverage: { score: scoreCoverage, max: 25 },
      structure: { score: scoreStructure, max: 20 },
      hasGsc: hasGscData,
      maxScore,
      trend: gscTrend,
    };

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

    // ── Prochaines publications planifiées (même logique que le cron) ────────
    const { data: roadmapRow } = await supabase
      .from("roadmaps")
      .select("data")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const publishedKwSet = new Set(
      pubs.map(p => p.keyword?.toLowerCase()).filter(Boolean)
    );

    const plannedKeywords: string[] = [];
    // 1. Roadmap en priorité (comme le cron)
    const roadmapArticlesRaw = (roadmapRow?.data as { articles?: { keyword: string; priority: number }[] } | null)?.articles;
    if (roadmapArticlesRaw && roadmapArticlesRaw.length > 0) {
      const roadmapArticles = roadmapArticlesRaw
        .filter((a: { keyword: string }) => a.keyword && !publishedKwSet.has(a.keyword.toLowerCase()))
        .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority);
      for (const a of roadmapArticles) {
        if (plannedKeywords.length >= 7) break;
        plannedKeywords.push(a.keyword);
        publishedKwSet.add(a.keyword.toLowerCase());
      }
    }
    // 2. Rotation sur les mots-clés configurés (fallback, comme le cron)
    if (plannedKeywords.length < 7 && allKeywords.length > 0) {
      for (let i = 0; plannedKeywords.length < 7 && i < allKeywords.length; i++) {
        const kw = allKeywords[i];
        if (!publishedKwSet.has(kw.toLowerCase())) {
          plannedKeywords.push(kw);
          publishedKwSet.add(kw.toLowerCase());
        }
      }
    }

    // ── Publications récentes (pour la table) ────────────────────────────────
    const recentPublications = pubs.map(p => ({
      id: p.id,
      title: p.title,
      keyword: p.keyword,
      url: p.wordpress_url,
      published_at: p.published_at,
      page_type: p.keyword === "__page__" ? "page" : "article",
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
        scoreBreakdown,
        nextPublicationAt,
        streak,
        bestStreak,
      },
      pubsChart,
      keywordStats,
      uncoveredKeywords,
      calendarData,
      recentPublications,
      plannedKeywords,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
