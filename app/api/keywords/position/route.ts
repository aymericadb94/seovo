/**
 * Cocoon Positioning API
 *
 * Determines the strategic position of a page within the semantic cocoon.
 * Called AFTER intent analysis validates the keyword, BEFORE content generation.
 *
 * Analyzes:
 * - Page type (pillar / support / complementary)
 * - SEO role and priority
 * - Strategic linking relationships
 * - Internal linking strategy
 * - Risk assessment (duplication, cannibalization)
 * - Roadmap alignment
 *
 * Returns a positioning blueprint that feeds into the content generator.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type CocoonPosition = {
  page_type: "pillar" | "support" | "complementary";
  seo_role: string;
  priority: "high" | "medium" | "low";
  pillar_relation: string;
  supporting_pages: string[];
  internal_conflicts: string[];
  linking_strategy: {
    outgoing: { target: string; anchor: string; reason: string }[];
    incoming: { source: string; anchor: string; reason: string }[];
  };
  roadmap_position: string;
  risk_level: "low" | "medium" | "high";
  justification: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "cocoon-position", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const { keyword, intent_analysis } = await request.json() as {
      keyword: string;
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
        recommended_content_type: string;
        angle: string;
      };
    };

    if (!keyword?.trim()) {
      return Response.json({ error: "Mot-clé requis" }, { status: 400 });
    }

    // ── Gather all context in parallel ─────────────────────────────────────
    const [siteRes, pubsRes, roadmapRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("business_name, industry, site_url, keywords, seo_context").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", user.id),
      supabase.from("roadmaps").select("data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const site = siteRes.data;
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // ── Parse existing pages ───────────────────────────────────────────────
    const publications = pubsRes.data ?? [];
    const existingPages = publications.map(p => ({
      title: p.title,
      keyword: p.keyword,
      url: p.wordpress_url,
    }));

    // ── Parse cocoon structure ─────────────────────────────────────────────
    type CocoonCluster = {
      name: string;
      priority: string;
      pillar: { title: string; keyword: string; status: string; url?: string };
      support_pages: { title: string; keyword: string; status: string; url?: string }[];
      internal_links?: { from: string; to: string; anchor: string; direction: string }[];
    };
    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];

    // Find which cluster this keyword belongs to
    let targetCluster: CocoonCluster | null = null;
    let keywordRole = "unknown";
    for (const c of clusters) {
      if (c.pillar?.keyword?.toLowerCase() === keyword.toLowerCase()) {
        targetCluster = c;
        keywordRole = "pillar";
        break;
      }
      if (c.support_pages?.some(sp => sp.keyword?.toLowerCase() === keyword.toLowerCase())) {
        targetCluster = c;
        keywordRole = "support";
        break;
      }
    }

    // ── Parse roadmap ──────────────────────────────────────────────────────
    type RoadmapArticle = { title: string; keyword: string; role: string; intent?: string; angle?: string; priority?: number };
    type RoadmapPhase = { name: string; ids: number[] };
    const roadmapData = roadmapRes.data?.data as { articles?: RoadmapArticle[]; phases?: RoadmapPhase[] } | null;
    const roadmapArticles = roadmapData?.articles ?? [];
    const roadmapPhases = roadmapData?.phases ?? [];

    const roadmapArticle = roadmapArticles.find(
      a => a.keyword?.toLowerCase() === keyword.toLowerCase()
    );

    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;

    // ── Build cocoon context for prompt ────────────────────────────────────
    const cocoonCtx = clusters.length > 0
      ? clusters.map(c => {
          const supportList = c.support_pages?.map(sp =>
            `    - "${sp.title}" (${sp.keyword}) [${sp.status}]`
          ).join("\n") || "    (aucune)";
          return `  Cluster "${c.name}" (priorité: ${c.priority}):
    Pilier: "${c.pillar?.title}" (${c.pillar?.keyword}) [${c.pillar?.status}]
    Pages support:
${supportList}`;
        }).join("\n\n")
      : "Aucun cocon sémantique généré";

    const roadmapCtx = roadmapArticles.length > 0
      ? roadmapArticles.slice(0, 30).map((a, i) => {
          // Find phase
          let phase = "?";
          for (const p of roadmapPhases) {
            if (p.ids?.includes(i)) { phase = p.name; break; }
          }
          return `  ${i + 1}. "${a.title}" (${a.keyword}) — rôle: ${a.role}, phase: ${phase}`;
        }).join("\n")
      : "Aucune roadmap";

    const existingCtx = existingPages.length > 0
      ? existingPages.map((p, i) => `  ${i + 1}. "${p.title}" — mot-clé: "${p.keyword}"`).join("\n")
      : "Aucune page publiée";

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un architecte SEO senior (10+ ans), spécialisé dans les cocons sémantiques, le maillage interne et le positionnement stratégique de contenu.

Ta mission : déterminer la position exacte d'une page dans le cocon sémantique existant AVANT de créer le contenu.

INPUT :
{
  "keyword": "${keyword}",
  "cluster": "${targetCluster?.name ?? "non classifié"}",
  "keyword_role_in_cocoon": "${keywordRole}",
  "business": "${site.business_name}",
  "industry": "${site.industry}",
  "site_url": "${site.site_url}",
  "objective": "${seoCtx.objective ?? "croissance organique"}",
  "target_audience": "${seoCtx.target_customer ?? "non renseigné"}"${intent_analysis ? `,
  "intent_analysis": {
    "intent_type": "${intent_analysis.intent_type}",
    "user_intent": "${intent_analysis.user_intent}",
    "content_type": "${intent_analysis.recommended_content_type}",
    "angle": "${intent_analysis.angle}"
  }` : ""}${roadmapArticle ? `,
  "roadmap_context": {
    "role": "${roadmapArticle.role}",
    "intent": "${roadmapArticle.intent ?? ""}",
    "angle": "${roadmapArticle.angle ?? ""}",
    "priority": ${roadmapArticle.priority ?? "null"}
  }` : ""}
}

COCON SÉMANTIQUE EXISTANT :
${cocoonCtx}

PAGES PUBLIÉES :
${existingCtx}

ROADMAP SEO :
${roadmapCtx}

---

ANALYSE EN 6 PARTIES :

1. POSITION DANS LE COCON
- Type de page : pilier (trafic principal du cluster), support (renforce le pilier), ou complémentaire (niche/longue traîne).
- Relation avec la page pilier du cluster : laquelle ? pourquoi ?
- Relation avec les autres pages support : complémentarité, hiérarchie.

2. OBJECTIF SEO
- Rôle principal : attirer du trafic (mot-clé à volume), renforcer le pilier (jus SEO), ou convertir (intention transactionnelle/commerciale).
- Niveau de priorité : high (critique pour la stratégie), medium (important mais pas urgent), low (nice-to-have).

3. RELATIONS STRATÉGIQUES
- Pages que cette page doit pousser (liens sortants vers pages stratégiques).
- Pages qui doivent soutenir cette page (liens entrants à créer).
- Pages concurrentes internes (risque de cannibalisation).

4. STRATÉGIE DE MAILLAGE INTERNE
- Liens sortants obligatoires : vers quelles pages, avec quel texte d'ancre, pourquoi.
- Liens entrants à créer : depuis quelles pages existantes, avec quel texte d'ancre.
- Logique de circulation : comment le jus SEO doit circuler.

5. RISQUE SEO
- Risque de duplication avec des pages existantes.
- Risque de cannibalisation (même mot-clé ou intention trop proche).
- Cohérence avec le cocon existant.

6. ALIGNEMENT ROADMAP
- Position dans l'ordre de publication recommandé.
- Dépendances : quelles pages doivent exister avant celle-ci ?
- Impact sur la stratégie globale.

CONTRAINTES :
- Penser comme un architecte SEO, pas un exécutant mécanique.
- Chaque page doit avoir un rôle unique et précis.
- Les liens doivent être naturels et stratégiques, pas systématiques.
- Max 3-5 liens sortants, 2-4 liens entrants recommandés.
- Ancres naturelles et variées (pas de sur-optimisation).

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "page_type": "pillar|support|complementary",
  "seo_role": "Description précise du rôle SEO de cette page (1-2 phrases)",
  "priority": "high|medium|low",
  "pillar_relation": "Relation avec la page pilier du cluster (1 phrase)",
  "supporting_pages": ["Titres des pages support liées à celle-ci"],
  "internal_conflicts": ["Titres des pages à risque de cannibalisation (vide si aucun)"],
  "linking_strategy": {
    "outgoing": [
      {"target": "Titre ou keyword de la page cible", "anchor": "Texte d'ancre naturel", "reason": "Pourquoi ce lien"}
    ],
    "incoming": [
      {"source": "Titre ou keyword de la page source", "anchor": "Texte d'ancre naturel", "reason": "Pourquoi ce lien"}
    ]
  },
  "roadmap_position": "Position recommandée dans l'ordre de publication (1-2 phrases)",
  "risk_level": "low|medium|high",
  "justification": "Justification stratégique complète du positionnement (2-3 phrases)"
}`;

    // cocoon_positioning → Opus (strategic architecture decision)
    const aiResult = await aiCall(
      { task: "cocoon_positioning" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const position = parseAiJson<CocoonPosition>(aiResult.text);
    if (!position) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      position,
      keyword,
      cluster: targetCluster?.name ?? null,
      keyword_role: keywordRole,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
