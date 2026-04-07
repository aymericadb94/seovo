/**
 * Roadmap Integration API
 *
 * Post-publication step that connects a newly published page to the
 * global SEO strategy. Analyzes the page's role, estimates impact,
 * defines next actions, and updates the roadmap.
 *
 * Called AFTER publication. Non-blocking — failure doesn't affect
 * the published page.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type RoadmapIntegration = {
  roadmap_position: string;
  dependencies: string[];
  seo_role: string;
  impact: {
    traffic_potential: string;
    cluster_impact: string;
  };
  next_actions: string[];
  priority: "high" | "medium" | "low";
  justification: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "roadmap-integrate", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      keyword,
      title,
      url,
      cocoon_positioning,
    } = await request.json() as {
      keyword: string;
      title: string;
      url?: string;
      cocoon_positioning?: {
        page_type: string;
        seo_role: string;
        priority: string;
        pillar_relation: string;
        risk_level: string;
      };
    };

    if (!keyword?.trim()) {
      return Response.json({ error: "Mot-clé requis" }, { status: 400 });
    }

    // ── Gather all context ─────────────────────────────────────────────────
    const [siteRes, pubsRes, roadmapRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("business_name, industry, seo_context").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", user.id),
      supabase.from("roadmaps").select("data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const site = siteRes.data;
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const publications = pubsRes.data ?? [];
    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;

    // Existing pages
    const existingPages = publications.map(p => ({
      title: p.title,
      keyword: p.keyword,
      url: p.wordpress_url,
    }));

    // Cocoon structure
    type CocoonCluster = {
      name: string;
      priority: string;
      pillar: { title: string; keyword: string; status: string };
      support_pages: { title: string; keyword: string; status: string }[];
    };
    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];

    // Find cluster
    let clusterCtx = "non classifié";
    let clusterDetail = "";
    for (const c of clusters) {
      const allKws = [c.pillar?.keyword, ...(c.support_pages?.map(sp => sp.keyword) ?? [])].filter(Boolean);
      if (allKws.some(k => k?.toLowerCase() === keyword.toLowerCase())) {
        clusterCtx = c.name;
        const toCreate = c.support_pages?.filter(sp => sp.status === "to_create") ?? [];
        const existing = c.support_pages?.filter(sp => sp.status === "existing") ?? [];
        clusterDetail = `Pilier: "${c.pillar?.title}" (${c.pillar?.status})
Pages support existantes: ${existing.length}
Pages support à créer: ${toCreate.length}
${toCreate.length > 0 ? `Prochaines pages: ${toCreate.slice(0, 5).map(sp => `"${sp.title}" (${sp.keyword})`).join(", ")}` : ""}`;
        break;
      }
    }

    // Roadmap
    type RoadmapArticle = { title: string; keyword: string; role: string; priority?: number };
    type RoadmapPhase = { name: string; ids: number[] };
    const roadmapData = roadmapRes.data?.data as { articles?: RoadmapArticle[]; phases?: RoadmapPhase[] } | null;
    const roadmapArticles = roadmapData?.articles ?? [];
    const roadmapPhases = roadmapData?.phases ?? [];

    const roadmapCtx = roadmapArticles.length > 0
      ? roadmapArticles.slice(0, 30).map((a, i) => {
          let phase = "?";
          for (const p of roadmapPhases) {
            if (p.ids?.includes(i)) { phase = p.name; break; }
          }
          const isPublished = existingPages.some(ep => ep.keyword?.toLowerCase() === a.keyword?.toLowerCase());
          return `  ${i + 1}. "${a.title}" (${a.keyword}) — ${a.role} — phase: ${phase} — ${isPublished ? "PUBLIÉ" : "À CRÉER"}`;
        }).join("\n")
      : "Aucune roadmap";

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un stratège SEO senior (10+ ans), spécialisé en planification éditoriale, cocon sémantique et priorisation SEO.

Ta mission : intégrer une page VENANT D'ÊTRE PUBLIÉE dans la stratégie SEO globale. Analyser son impact et définir les prochaines actions.

PAGE PUBLIÉE :
Titre : "${title}"
Mot-clé : "${keyword}"
URL : ${url ?? "non disponible"}
Type : ${cocoon_positioning?.page_type ?? "non défini"}
Rôle SEO : ${cocoon_positioning?.seo_role ?? "non défini"}
Priorité : ${cocoon_positioning?.priority ?? "non défini"}
Relation pilier : ${cocoon_positioning?.pillar_relation ?? "non défini"}
Risque : ${cocoon_positioning?.risk_level ?? "non défini"}

SITE : ${site.business_name} — ${site.industry}
Objectif : ${seoCtx.objective ?? "croissance organique"}
Audience : ${seoCtx.target_customer ?? "non renseigné"}

CLUSTER : ${clusterCtx}
${clusterDetail}

PAGES PUBLIÉES (${existingPages.length} total) :
${existingPages.slice(0, 20).map((p, i) => `  ${i + 1}. "${p.title}" (${p.keyword})`).join("\n") || "  Aucune"}

ROADMAP SEO :
${roadmapCtx}

---

ANALYSE EN 6 PARTIES :

1. POSITION DANS LA ROADMAP
- À quel moment de la stratégie cette page arrive-t-elle ?
- Était-elle prévue dans la roadmap ? Si oui, est-elle en avance ou en retard ?
- Quelles pages dépendaient de celle-ci pour être publiées ?

2. RÔLE STRATÉGIQUE
- Rôle dans le cluster : pilier, support, renforcement.
- Objectif principal : attirer du trafic, soutenir le pilier, convertir.
- Contribution à la stratégie globale.

3. IMPACT SEO ESTIMÉ
- Potentiel de trafic (estimation qualitative : fort/moyen/faible, avec justification).
- Impact sur le cluster (renforce-t-il significativement le cocon ?).
- Contribution au score SEO global du site.

4. PROCHAINES ACTIONS
Définir 3-5 actions concrètes à effectuer suite à cette publication :
- Prochaine page à créer dans le cluster (et pourquoi).
- Pages existantes à optimiser (ajouter des liens vers cette nouvelle page).
- Liens entrants à créer depuis d'autres pages publiées.
- Contenu complémentaire manquant.

5. COHÉRENCE GLOBALE
Vérifier :
- Pas de duplication avec d'autres pages publiées.
- Cohérence avec le cocon sémantique.
- Alignement avec la roadmap et l'objectif business.

6. PRIORISATION
- La publication de cette page change-t-elle les priorités de la roadmap ?
- Quelle est la nouvelle action la plus urgente ?

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "roadmap_position": "Position de cette page dans la stratégie (1-2 phrases)",
  "dependencies": ["Pages qui peuvent maintenant être créées grâce à celle-ci"],
  "seo_role": "Rôle stratégique confirmé après publication (1 phrase)",
  "impact": {
    "traffic_potential": "Estimation du potentiel de trafic (1 phrase)",
    "cluster_impact": "Impact sur le cluster et le cocon (1 phrase)"
  },
  "next_actions": ["Action 1 concrète", "Action 2", "Action 3"],
  "priority": "high|medium|low",
  "justification": "Pourquoi cette priorité et ces prochaines actions (2-3 phrases)"
}`;

    const aiResult = await aiCall(
      { task: "roadmap_integration" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const integration = parseAiJson<RoadmapIntegration>(aiResult.text);
    if (!integration) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      integration,
      keyword,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
