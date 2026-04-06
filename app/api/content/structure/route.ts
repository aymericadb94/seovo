/**
 * Content Structure API
 *
 * Creates the optimal SEO structure (H1, H2s, H3s, featured snippet)
 * for a page before content generation.
 *
 * Called AFTER intent + positioning + keyword strategy, BEFORE writing.
 * The structure blueprint feeds directly into the content generation prompt.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type ContentStructure = {
  h1: string;
  h2_structure: {
    title: string;
    h3: string[];
  }[];
  featured_snippet_section: {
    type: "definition" | "list" | "answer";
    title: string;
    reason: string;
  };
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "content-structure", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      keyword,
      intent_analysis,
      cocoon_positioning,
      keyword_strategy,
    } = await request.json() as {
      keyword: string;
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
        recommended_content_type: string;
        angle: string;
        serp_analysis: string;
      };
      cocoon_positioning?: {
        page_type: string;
        seo_role: string;
        pillar_relation: string;
      };
      keyword_strategy?: {
        primary_keyword: string;
        secondary_keywords: string[];
        semantic_field: string[];
        seo_angle: string;
      };
    };

    if (!keyword?.trim()) {
      return Response.json({ error: "Mot-clé requis" }, { status: 400 });
    }

    // ── Gather site context ────────────────────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, seo_context")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;
    const primaryKw = keyword_strategy?.primary_keyword ?? keyword;

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans), spécialisé dans la structuration de contenu, l'optimisation des balises Hn et la compréhension des SERP.

Ta mission : créer la structure SEO parfaite pour une page AVANT sa rédaction.

INPUT :
{
  "primary_keyword": "${primaryKw}",
  "business": "${site.business_name}",
  "industry": "${site.industry}",
  "target_audience": "${seoCtx.target_customer ?? "non renseigné"}",
  "country": "${seoCtx.geography ?? "France"}"${intent_analysis ? `,
  "intent_analysis": {
    "intent_type": "${intent_analysis.intent_type}",
    "user_intent": "${intent_analysis.user_intent}",
    "content_type": "${intent_analysis.recommended_content_type}",
    "angle": "${intent_analysis.angle}",
    "serp_analysis": "${intent_analysis.serp_analysis}"
  }` : ""}${cocoon_positioning ? `,
  "cocoon_positioning": {
    "page_type": "${cocoon_positioning.page_type}",
    "seo_role": "${cocoon_positioning.seo_role}",
    "pillar_relation": "${cocoon_positioning.pillar_relation}"
  }` : ""}${keyword_strategy ? `,
  "keyword_strategy": {
    "secondary_keywords": ${JSON.stringify(keyword_strategy.secondary_keywords)},
    "semantic_field": ${JSON.stringify(keyword_strategy.semantic_field.slice(0, 15))},
    "seo_angle": "${keyword_strategy.seo_angle}"
  }` : ""}
}

ANALYSE EN 5 PARTIES :

1. H1 — TITRE PRINCIPAL
Crée UN seul H1 :
- Contient le mot-clé principal "${primaryKw}" de manière naturelle.
- Orienté utilisateur (promesse de valeur, pas juste un mot-clé).
- Pas de sur-optimisation (pas de keyword stuffing).
- 50-70 caractères idéalement.
- Doit donner envie de lire et être compréhensible immédiatement.

2. H2 — SECTIONS PRINCIPALES (4 à 6)
Crée 4 à 6 H2 qui :
- Couvrent l'INTÉGRALITÉ de l'intention de recherche.
- Sont organisés dans un ordre logique (du général au spécifique, ou chronologique, ou par importance).
- Intègrent naturellement les mots-clés secondaires (1 par H2 max).
- Ne sont JAMAIS redondants entre eux.
- Répondent chacun à un aspect distinct du sujet.
${intent_analysis?.recommended_content_type === "guide" || intent_analysis?.recommended_content_type === "tutoriel"
  ? "- Pour un guide/tutoriel : suivre une progression étape par étape."
  : intent_analysis?.recommended_content_type === "comparatif"
  ? "- Pour un comparatif : organiser par critère de comparaison ou par solution."
  : intent_analysis?.recommended_content_type === "liste"
  ? "- Pour une liste : organiser par catégorie ou par ordre de pertinence."
  : "- Adapter la structure au type de contenu attendu."}

3. H3 — SOUS-SECTIONS (2 à 4 par H2)
Pour chaque H2, crée 2 à 4 H3 qui :
- Détaillent les points importants de la section.
- Structurent la lecture pour le scan (l'utilisateur doit comprendre la page en lisant les titres).
- Anticipent les questions que l'utilisateur se pose à ce stade de la lecture.
- Utilisent des termes du champ sémantique naturellement.

4. LOGIQUE DE PROGRESSION
La structure doit :
- Répondre complètement à la requête "${primaryKw}" sans laisser de zone d'ombre.
- Suivre une progression logique (l'utilisateur ne doit jamais se demander "pourquoi cette section ici ?").
- Anticiper les questions suivantes (chaque section mène naturellement à la suivante).
- Être lisible en mode "scan" (les titres seuls racontent une histoire cohérente).

5. FEATURED SNIPPET — POSITION 0
Identifie LA meilleure section pour capturer un featured snippet :
- "definition" : si la requête commence par "qu'est-ce que", "définition", ou est un concept.
- "list" : si la requête implique des étapes, des conseils, des éléments à lister.
- "answer" : si la requête est une question directe avec une réponse concise.
- Indique quel H2 doit contenir cette section optimisée.

CONTRAINTES :
- Lisibilité prioritaire sur le SEO. Un humain doit trouver cette structure naturelle.
- Aucune répétition du mot-clé principal dans les H2/H3 (sauf 1 fois max si naturel).
- Aucun H2 trop similaire à un autre (pas de "avantages de X" puis "bénéfices de X").
- Pas de H2/H3 artificiels ou creux (chaque titre doit promettre une vraie valeur).
- Penser UX + SEO : la structure doit être aussi bonne pour l'utilisateur que pour Google.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "h1": "Le titre H1 optimisé et naturel",
  "h2_structure": [
    {
      "title": "Le titre H2",
      "h3": ["H3 sous-section 1", "H3 sous-section 2", "H3 sous-section 3"]
    }
  ],
  "featured_snippet_section": {
    "type": "definition|list|answer",
    "title": "Le titre de la section optimisée pour le featured snippet",
    "reason": "Pourquoi cette section est la meilleure candidate (1 phrase)"
  }
}`;

    const aiResult = await aiCall(
      { task: "content_structure" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const structure = parseAiJson<ContentStructure>(aiResult.text);
    if (!structure) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      structure,
      keyword: primaryKw,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
