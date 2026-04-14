import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";
import { listAllCmsContent, type CmsCredentials } from "@/lib/cms-update";

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

    const limited = rateLimit(user.id, { name: "roadmap", maxRequests: 5, windowSeconds: 3600 });
    if (limited) return limited;

    const { data: site, error: siteError } = await supabase
      .from("sites")
      .select("id, business_name, industry, site_url, cms, keywords, seo_context, gsc_site_url, google_access_token, wp_username, wp_app_password, shopify_api_key, shopify_store_url, wix_api_key, wix_site_id, custom_api_url, custom_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (siteError) return Response.json({ error: siteError.message }, { status: 500 });
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // Fetch CMS pages + DB data in parallel
    const creds: CmsCredentials = {
      cms: site.cms, site_url: site.site_url,
      wp_username: site.wp_username, wp_app_password: site.wp_app_password,
      shopify_api_key: site.shopify_api_key, shopify_store_url: site.shopify_store_url,
      wix_api_key: site.wix_api_key, wix_site_id: site.wix_site_id,
      custom_api_url: site.custom_api_url, custom_api_key: site.custom_api_key,
    };

    const [cmsContentResult, engineResult, projectionsResult, cocoonResult, gscQueries] = await Promise.all([
      listAllCmsContent(creds, 200).catch(() => []),
      supabase
        .from("seo_engine_results")
        .select("data")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("seo_projections")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("semantic_cocoons")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle(),
      // GSC direct (données fraîches)
      (async () => {
        if (!site.gsc_site_url || !site.google_access_token) return [];
        try {
          const token = await getValidAccessToken(user.id);
          if (!token) return [];
          const now = new Date();
          const endDate = new Date(now); endDate.setDate(endDate.getDate() - 2);
          const startDate = new Date(now); startDate.setDate(startDate.getDate() - 90);
          const fmt = (d: Date) => d.toISOString().split("T")[0];
          const res = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.gsc_site_url)}/searchAnalytics/query`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ["query"], rowLimit: 100 }),
            }
          );
          if (!res.ok) return [];
          type Row = { keys: string[]; clicks: number; impressions: number; position: number };
          const data = await res.json() as { rows?: Row[] };
          return (data.rows ?? []).map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: Math.round(r.position * 10) / 10 }));
        } catch { return []; }
      })(),
    ]);

    // CMS = source de vérité pour les titres existants
    let existingTitles: string[];
    if (cmsContentResult.length > 0) {
      existingTitles = cmsContentResult.map(p => p.title);
    } else {
      // Fallback DB
      const { data: pubs } = await supabase
        .from("publications")
        .select("title")
        .eq("user_id", user.id)
        .order("published_at", { ascending: false })
        .limit(20);
      existingTitles = (pubs ?? []).map(p => p.title);
    }
    const keywords = (site.keywords ?? []).join(", ") || "non configurés";
    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;

    // Extract cocoon data if available
    type CocoonCluster = { name: string; priority: string; traffic_potential: number; pillar: { title: string; keyword: string; status: string }; support_pages: { title: string; keyword: string; status: string }[] };
    type CocoonData = { clusters?: CocoonCluster[]; missing_pages?: { title: string; keyword: string; priority: string; reason: string }[]; optimization_actions?: { action: string; impact: string }[] };
    const cocoon = (cocoonResult.data?.data ?? null) as CocoonData | null;

    // Extract projections data if available
    type ProjItem = { keyword: string; estimated_gain: number; difficulty: string; action: string; target_position: number; timeframe: string; confidence_score?: number; sources?: string[] };
    type ProjData = { estimated_results?: ProjItem[]; total_estimated_gain?: { low: number; high: number }; has_gsc_data?: boolean };
    const proj = (projectionsResult.data?.data ?? null) as ProjData | null;
    const topOpportunities = (proj?.estimated_results ?? [])
      .filter(p => p.estimated_gain > 0)
      .slice(0, 12);

    // Build per-keyword gain map for enriched prompt
    const kwGainMap = new Map<string, { gain: number; confidence: number; sources: string[] }>();
    for (const item of proj?.estimated_results ?? []) {
      if (item.keyword && item.estimated_gain > 0) {
        kwGainMap.set(item.keyword.toLowerCase(), {
          gain: item.estimated_gain,
          confidence: item.confidence_score ?? 0.3,
          sources: item.sources ?? [],
        });
      }
    }

    const projectionsSection = topOpportunities.length > 0 ? `
---

POTENTIEL DE CROISSANCE SEO (moteur de projections RankPill) :
Gain total estimé : +${proj?.total_estimated_gain?.low ?? 0} à +${proj?.total_estimated_gain?.high ?? 0} clics/mois supplémentaires
Données GSC : ${proj?.has_gsc_data ? "OUI — projections basées sur données réelles" : "NON — estimations conservatrices"}

TOP OPPORTUNITÉS CLASSÉES PAR GAIN (à prioriser dans la roadmap) :
${topOpportunities.map((p, i) => `${i + 1}. "${p.keyword}" — +${p.estimated_gain} clics/mois estimés | Action: ${p.action} | Difficulté: ${p.difficulty} | Délai: ${p.timeframe}`).join("\n")}

CONTRAINTE CRITIQUE : Les mots-clés ci-dessus classés "Facile" ou avec le plus fort gain estimé DOIVENT apparaître dans la PHASE 1 de la roadmap. C'est le chemin le plus direct vers la croissance organique.
` : "";

    // Extract cocoon structure
    const cocoonClusters = cocoon?.clusters ?? [];
    const cocoonSection = cocoonClusters.length > 0 ? `
---

COCON SÉMANTIQUE (architecture SEO validée par l'utilisateur) :
${cocoonClusters.map((c, i) => `
CLUSTER ${i + 1}: "${c.name}" (priorité: ${c.priority}, potentiel: +${c.traffic_potential} clics/mois)
  - Page pilier: "${c.pillar.title}" (${c.pillar.keyword}) [${c.pillar.status}]
  - Pages support: ${c.support_pages.map(p => `"${p.title}" (${p.keyword}) [${p.status}]`).join(", ")}
`).join("")}
${(cocoon?.missing_pages ?? []).length > 0 ? `PAGES MANQUANTES IDENTIFIÉES :
${(cocoon?.missing_pages ?? []).map(p => `- "${p.title}" (${p.keyword}) — ${p.reason}`).join("\n")}` : ""}

CONTRAINTE ABSOLUE : La roadmap DOIT suivre la structure du cocon sémantique ci-dessus. Chaque article de la roadmap doit correspondre à une page pilier ou support d'un cluster. Les pages manquantes identifiées doivent être incluses en priorité. Ne PAS inventer de nouveaux sujets hors du cocon.
` : "";

    // Extract SEO engine data if available
    type EngineData = {
      seo_understanding?: { current_seo_state?: string; main_seo_gap?: string; estimated_traffic_potential?: string };
      editorial_strategy?: { semantic_pillars?: string[]; content_gaps?: string[]; recommended_topics?: string[]; next_5_articles?: { title: string; keyword: string; reason: string }[] };
      opportunities?: { type?: string; title?: string; target_keyword?: string; score?: number }[];
      gsc_insights?: { type?: string; query?: string; position?: number; insight?: string }[];
      has_gsc_data?: boolean;
    };
    const engine = (engineResult.data?.data ?? null) as EngineData | null;

    const engineSection = engine ? `
---

ANALYSE SEO RÉELLE DU SITE (données moteur RankPill) :

État SEO actuel : ${engine.seo_understanding?.current_seo_state ?? "inconnu"}
Problème SEO principal identifié : ${engine.seo_understanding?.main_seo_gap ?? "non analysé"}
Potentiel trafic estimé : ${engine.seo_understanding?.estimated_traffic_potential ?? "non estimé"}
Données GSC disponibles : ${engine.has_gsc_data ? "OUI — insights basés sur données réelles" : "NON — analyse basée sur crawl uniquement"}

PILIERS SÉMANTIQUES DÉTECTÉS :
${(engine.editorial_strategy?.semantic_pillars ?? []).map(p => `- ${p}`).join("\n") || "- Non détectés"}

GAPS DE CONTENU IDENTIFIÉS (sujets non couverts par le site) :
${(engine.editorial_strategy?.content_gaps ?? []).map(g => `- ${g}`).join("\n") || "- Non détectés"}

SUJETS RECOMMANDÉS PAR LE MOTEUR :
${(engine.editorial_strategy?.recommended_topics ?? []).map(t => `- ${t}`).join("\n") || "- Non détectés"}

QUICK WINS GSC (requêtes en position 5-20 à exploiter en priorité) :
${(engine.gsc_insights ?? []).filter(i => i.type === "quick_win").slice(0, 10).map(i => `- "${i.query}" (pos. ${i.position}) — ${i.insight}`).join("\n") || "- Aucun (GSC non connectée)"}

OPPORTUNITÉS DE CRÉATION DÉTECTÉES :
${(engine.opportunities ?? []).filter(o => o.type === "content_creation").slice(0, 8).map(o => `- ${o.title} (kw: "${o.target_keyword}", score: ${o.score})`).join("\n") || "- Aucune détectée"}

5 PROCHAINS ARTICLES RECOMMANDÉS PAR LE MOTEUR :
${(engine.editorial_strategy?.next_5_articles ?? []).map((a, i) => `${i + 1}. "${a.title}" (kw: ${a.keyword}) — ${a.reason}`).join("\n") || "- Non disponibles"}

CONTRAINTE SUPPLÉMENTAIRE : La roadmap doit intégrer et développer les gaps, piliers et opportunités ci-dessus. Les articles identifiés par le moteur comme quick wins ou opportunités doivent apparaître dans la PHASE 1 ou PHASE 2.
` : `
---

ANALYSE SEO : Moteur SEO non encore exécuté — génère la roadmap à partir des mots-clés configurés et de l'analyse du secteur.
`;

    // GSC direct section (données fraîches, pas via cocon)
    type GscRow = { query: string; clicks: number; impressions: number; position: number };
    const gscRows = gscQueries as GscRow[];
    const gscSection = gscRows.length > 0 ? `
---

DONNÉES GOOGLE SEARCH CONSOLE (90 derniers jours — données fraîches) :
${gscRows.slice(0, 50).map((q, i) => `${i + 1}. "${q.query}" — ${q.clicks} clics, ${q.impressions} impressions, pos. ${q.position}`).join("\n")}

QUICK WINS GSC (requêtes en position 5-20 avec fort volume → articles à prioriser en PHASE 1) :
${gscRows.filter(q => q.position >= 5 && q.position <= 20 && q.impressions >= 30).slice(0, 10).map(q => `- "${q.query}" — pos. ${q.position}, ${q.impressions} imp/mois`).join("\n") || "Aucun quick win détecté"}
` : "";

    const intentSection = (seoCtx.objective || seoCtx.main_offer || seoCtx.target_customer) ? `
INTENTION STRATÉGIQUE (onboarding) :
- Objectif business : ${seoCtx.objective ?? "non renseigné"}
- Offre prioritaire : ${seoCtx.main_offer ?? "non renseigné"}
- Cible client : ${seoCtx.target_customer ?? "non renseigné"}
- Zone géographique : ${seoCtx.geography ?? "national"}${seoCtx.geography_detail ? ` — ${seoCtx.geography_detail}` : ""}
- Concurrents : ${Array.isArray(seoCtx.competitors) ? (seoCtx.competitors as string[]).join(", ") || "non renseignés" : "non renseignés"}
- Contraintes : ${seoCtx.constraints ?? "aucune"}
` : "";

    const currentYear = new Date().getFullYear();
    const prompt = `Tu es un expert SEO senior spécialisé en stratégie de contenu avancée et en domination des résultats Google en ${currentYear}.

Ta mission est de générer une roadmap éditoriale de 20 articles raccord avec l'analyse SEO réelle du site.

DATE ACTUELLE : ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
ANNÉE EN COURS : ${currentYear} (utilise TOUJOURS cette année si un titre ou mot-clé contient une année, JAMAIS une année passée)

SITE : ${site.business_name}
SECTEUR : ${site.industry}
URL : ${site.site_url}
MOTS-CLÉS CONFIGURÉS : ${keywords}
${kwGainMap.size > 0 ? `GAINS ESTIMÉS PAR MOT-CLÉ (moteur de projections) :\n${(site.keywords ?? []).filter((k: string) => kwGainMap.has(k.toLowerCase())).slice(0, 20).map((k: string) => { const info = kwGainMap.get(k.toLowerCase())!; return `- "${k}" → +${info.gain} clics/mois (confiance: ${Math.round(info.confidence * 100)}%, sources: ${info.sources.join("+")})`; }).join("\n")}\n` : ""}ARTICLES DÉJÀ PUBLIÉS : ${existingTitles.length > 0 ? existingTitles.slice(0, 10).map(t => `"${t}"`).join(", ") : "aucun"}
${intentSection}${cocoonSection}${projectionsSection}${gscSection}${engineSection}
---

OBJECTIFS :
- Construire un cocon sémantique ancré dans les piliers détectés par le moteur SEO
- Exploiter les quick wins GSC identifiés (articles qui peuvent ranker vite)
- Couvrir les gaps de contenu détectés par le moteur
- Générer 20 articles différenciants, utiles, et directement actionnables
- Attirer du trafic qualifié aligné avec l'offre et la cible déclarées
- Respecter les critères EEAT
- Ne jamais dupliquer les articles déjà publiés

CONTRAINTES CRITIQUES :
- Les articles PHASE 1 doivent inclure les quick wins GSC et les 5 articles recommandés par le moteur
- Les piliers sémantiques identifiés doivent guider la structure du cocon
- Chaque article doit répondre à une intention de recherche précise
- Aucun contenu générique — chaque titre doit être spécifique à CE business

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
      "summary": "1 phrase max",
      "priority": 1
    }
  ],
  "phases": [
    {
      "phase": 1,
      "label": "Fondations & Quick Wins",
      "weeks": "Semaines 1-4",
      "ids": [1, 2, 3, 4, 5, 6, 7],
      "rationale": "Pourquoi commencer par ces articles"
    },
    {
      "phase": 2,
      "label": "Expansion",
      "weeks": "Semaines 5-10",
      "ids": [8, 9, 10, 11, 12, 13, 14],
      "rationale": "Logique de la deuxième phase"
    },
    {
      "phase": 3,
      "label": "Domination",
      "weeks": "Semaines 11-16",
      "ids": [15, 16, 17, 18, 19, 20],
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

IMPORTANT :
- Génère exactement 20 articles. IDs de 1 à 20. Priorités de 1 (urgent) à 20.
- Chaque champ texte = 1 phrase courte maximum (pas de paragraphes).
- Réponds avec du JSON brut uniquement — aucun bloc markdown, aucun texte avant ou après l'accolade ouvrante.`;

    // roadmap_strategy → Opus (strategic decision)
    const aiResult = await aiCall(
      { task: "roadmap_strategy" },
      { messages: [{ role: "user", content: prompt }], max_tokens: 12000 }
    );

    const data = parseAiJson(aiResult.text);
    if (!data) {
      console.error("[roadmap] JSON parse failed. Raw start:", aiResult.text.slice(0, 200));
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
