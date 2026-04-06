/**
 * Keyword Strategy API
 *
 * Defines the complete keyword strategy for a page:
 * - Primary keyword (validated, non-conflicting)
 * - Secondary keywords (long tail, variants, questions)
 * - Semantic field (natural terms, synonyms, related expressions)
 * - Cannibalization analysis
 * - SEO angle and priority
 *
 * Called AFTER intent analysis + cocoon positioning, BEFORE content generation.
 * The result feeds directly into the content generation prompt.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type KeywordStrategy = {
  primary_keyword: string;
  secondary_keywords: string[];
  semantic_field: string[];
  cannibalization_risk: "low" | "medium" | "high";
  conflicting_pages: string[];
  seo_angle: string;
  priority: "high" | "medium" | "low";
  justification: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "keyword-strategy", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const { keyword, intent_analysis, cocoon_positioning } = await request.json() as {
      keyword: string;
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
        recommended_content_type: string;
        angle: string;
      };
      cocoon_positioning?: {
        page_type: string;
        seo_role: string;
        pillar_relation: string;
        linking_strategy: {
          outgoing: { target: string; anchor: string }[];
        };
      };
    };

    if (!keyword?.trim()) {
      return Response.json({ error: "Mot-clé requis" }, { status: 400 });
    }

    // ── Gather context ─────────────────────────────────────────────────────
    const [siteRes, pubsRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("business_name, industry, site_url, keywords, seo_context").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", user.id),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const site = siteRes.data;
    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const publications = pubsRes.data ?? [];
    const existingPages = publications.map(p => ({
      title: p.title,
      keyword: p.keyword,
      url: p.wordpress_url,
    }));

    // ── Extract cluster keywords from cocoon ───────────────────────────────
    type CocoonCluster = {
      name: string;
      pillar: { keyword: string; title: string };
      support_pages: { keyword: string; title: string }[];
    };
    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];

    // Find cluster for this keyword + gather all cluster keywords
    let clusterName = "non classifié";
    let clusterKeywords: string[] = [];
    for (const c of clusters) {
      const allKws = [
        c.pillar?.keyword,
        ...(c.support_pages?.map(sp => sp.keyword) ?? []),
      ].filter(Boolean);

      if (allKws.some(k => k?.toLowerCase() === keyword.toLowerCase())) {
        clusterName = c.name;
        clusterKeywords = allKws.filter(k => k?.toLowerCase() !== keyword.toLowerCase()) as string[];
        break;
      }
    }

    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans), spécialisé dans la recherche de mots-clés, la structuration sémantique et l'évitement de cannibalisation.

Ta mission : définir la stratégie de mots-clés parfaite pour une page avant sa rédaction.

INPUT :
{
  "keyword_initial": "${keyword}",
  "cluster": "${clusterName}",
  "business": "${site.business_name}",
  "industry": "${site.industry}",
  "site_url": "${site.site_url}",
  "objective": "${seoCtx.objective ?? "croissance organique"}",
  "target_audience": "${seoCtx.target_customer ?? "non renseigné"}",
  "country": "${seoCtx.geography ?? "France"}"${intent_analysis ? `,
  "intent_analysis": {
    "intent_type": "${intent_analysis.intent_type}",
    "user_intent": "${intent_analysis.user_intent}",
    "content_type": "${intent_analysis.recommended_content_type}",
    "angle": "${intent_analysis.angle}"
  }` : ""}${cocoon_positioning ? `,
  "cocoon_positioning": {
    "page_type": "${cocoon_positioning.page_type}",
    "seo_role": "${cocoon_positioning.seo_role}",
    "pillar_relation": "${cocoon_positioning.pillar_relation}"
  }` : ""},
  "existing_pages": ${JSON.stringify(existingPages.slice(0, 25).map(p => ({ title: p.title, keyword: p.keyword })))},
  "cluster_keywords": ${JSON.stringify(clusterKeywords.slice(0, 20))}
}

ANALYSE EN 6 PARTIES :

1. MOT-CLÉ PRINCIPAL
Choisis UN seul mot-clé principal :
- Le plus aligné avec l'intention utilisateur identifiée.
- Le plus pertinent SEO pour ce business et ce secteur.
- Sans conflit avec les pages existantes ci-dessus.
- Si le mot-clé initial est bon, garde-le. Sinon, propose une meilleure variante.

2. MOTS-CLÉS SECONDAIRES (5 à 10)
Définis des mots-clés secondaires :
- Variantes naturelles du mot-clé principal.
- Expressions longue traîne (3-5 mots).
- Questions que les utilisateurs posent réellement ("comment...", "pourquoi...", "quel...").
- Mots-clés complémentaires du même champ sémantique.
- Aucun doublon avec les mots-clés des pages existantes.

3. CHAMP SÉMANTIQUE (10 à 20 termes)
Crée une liste de termes associés :
- Synonymes naturels du sujet.
- Expressions courantes dans ce domaine.
- Termes que Google attend dans un contenu expert sur ce sujet.
- Pas de mots-clés à cibler, mais des termes à intégrer naturellement.

4. ANALYSE CANNIBALISATION
Vérifie chaque page existante :
- Y a-t-il un chevauchement d'intention avec une page existante ?
- Le mot-clé principal est-il déjà ciblé par une autre page ?
- Risque : low (aucun conflit), medium (chevauchement partiel), high (conflit direct).

5. ANGLE SEO
Définis l'angle différenciant :
- Comment cette page se distingue des autres pages du site.
- Quel aspect unique elle couvre que les autres ne couvrent pas.
- L'opportunité SEO réelle (trafic potentiel, difficulté).

6. PRIORITÉ
Évalue :
- Potentiel SEO (volume de recherche estimé, intention commerciale).
- Difficulté (concurrence, autorité nécessaire).
- Pertinence business (alignement avec l'offre et la cible).

CONTRAINTES :
- Aucune sur-optimisation. Densité mot-clé < 2%.
- Mots-clés secondaires = variantes naturelles, PAS des synonymes forcés.
- Le champ sémantique enrichit le contenu, il ne le pollue pas.
- Penser comme Google : qu'est-ce qu'un contenu expert et naturel sur ce sujet ?

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "primary_keyword": "Le mot-clé principal validé",
  "secondary_keywords": ["mot-clé 2", "mot-clé 3", "..."],
  "semantic_field": ["terme 1", "terme 2", "..."],
  "cannibalization_risk": "low|medium|high",
  "conflicting_pages": ["Titre de la page en conflit (si applicable)"],
  "seo_angle": "L'angle SEO différenciant de cette page (1-2 phrases)",
  "priority": "high|medium|low",
  "justification": "Pourquoi cette stratégie de mots-clés est optimale (2-3 phrases)"
}`;

    // keyword_strategy → Sonnet (execution: applying strategic decisions)
    const aiResult = await aiCall(
      { task: "keyword_strategy" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const strategy = parseAiJson<KeywordStrategy>(aiResult.text);
    if (!strategy) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      strategy,
      keyword,
      cluster: clusterName,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
