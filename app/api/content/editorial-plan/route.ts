/**
 * Editorial Plan API
 *
 * Creates a detailed editorial plan for each section of the page.
 * Called AFTER structure + snippet, BEFORE content generation.
 *
 * For each H2/H3, defines:
 * - What to cover and why
 * - Examples and data points to include
 * - Where to place secondary keywords and semantic terms
 * - Differentiation points
 * - Relative importance and depth
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type EditorialSection = {
  title: string;
  objective: string;
  content_points: string[];
  examples: string[];
  seo_notes: string;
  importance: "high" | "medium" | "low";
};

export type EditorialPlan = {
  sections: EditorialSection[];
  content_flow: string;
  differentiation_points: string[];
  global_strategy: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "editorial-plan", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      keyword,
      intent_analysis,
      content_structure,
      keyword_strategy,
      featured_snippet,
    } = await request.json() as {
      keyword: string;
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
        recommended_content_type: string;
        angle: string;
      };
      content_structure?: {
        h1: string;
        h2_structure: { title: string; h3: string[] }[];
        featured_snippet_section: { type: string; title: string };
      };
      keyword_strategy?: {
        primary_keyword: string;
        secondary_keywords: string[];
        semantic_field: string[];
        seo_angle: string;
      };
      featured_snippet?: {
        snippet_type: string;
        snippet_text: string;
        placement: string;
      };
    };

    if (!keyword?.trim()) {
      return Response.json({ error: "Mot-clé requis" }, { status: 400 });
    }

    // ── Site context ───────────────────────────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, seo_context")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;
    const primaryKw = keyword_strategy?.primary_keyword ?? keyword;

    // Build structure listing for prompt
    const structureListing = content_structure
      ? content_structure.h2_structure.map(h2 =>
          `H2: ${h2.title}\n${h2.h3.map(h3 => `  H3: ${h3}`).join("\n")}`
        ).join("\n\n")
      : "Structure non définie — crée un plan basé sur le mot-clé.";

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans), spécialisé dans la rédaction SEO longue, la création de plans éditoriaux performants et la compréhension des attentes de Google.

Ta mission : créer un plan éditorial détaillé pour chaque section d'une page SEO AVANT sa rédaction.

INPUT :
{
  "primary_keyword": "${primaryKw}",
  "business": "${site.business_name}",
  "industry": "${site.industry}",
  "target_audience": "${seoCtx.target_customer ?? "non renseigné"}",
  "country": "${seoCtx.geography ?? "France"}"${intent_analysis ? `,
  "intent": {
    "type": "${intent_analysis.intent_type}",
    "user_intent": "${intent_analysis.user_intent}",
    "content_type": "${intent_analysis.recommended_content_type}",
    "angle": "${intent_analysis.angle}"
  }` : ""}${keyword_strategy ? `,
  "keywords": {
    "secondary": ${JSON.stringify(keyword_strategy.secondary_keywords)},
    "semantic_field": ${JSON.stringify(keyword_strategy.semantic_field.slice(0, 15))},
    "seo_angle": "${keyword_strategy.seo_angle}"
  }` : ""}${featured_snippet ? `,
  "featured_snippet": {
    "type": "${featured_snippet.snippet_type}",
    "text": "${featured_snippet.snippet_text.slice(0, 200)}",
    "placement": "${featured_snippet.placement}"
  }` : ""}
}

STRUCTURE SEO DE LA PAGE :
${content_structure ? `H1: ${content_structure.h1}` : `H1: (à définir pour "${primaryKw}")`}
${structureListing}

---

ANALYSE EN 6 PARTIES :

1. DÉVELOPPEMENT DES SECTIONS
Pour CHAQUE H2 et H3 de la structure ci-dessus, définis :
- L'objectif précis de la section (ce que l'utilisateur doit comprendre après lecture).
- Les points de contenu à traiter (3-5 points par section).
- Ce qui rend cette section unique et utile.

2. CONTENU À APPORTER
Pour chaque section, précise :
- Les informations factuelles à expliquer (données, définitions, mécanismes).
- Les exemples concrets à inclure (liés au secteur "${site.industry}").
- Les erreurs courantes à mentionner (ce que les gens font mal).
- Les conseils pratiques actionnables.

3. LOGIQUE DE PROGRESSION
Le plan doit :
- Suivre une progression logique du général au spécifique.
- Répondre progressivement à l'intention "${intent_analysis?.user_intent ?? primaryKw}".
- Éviter toute répétition entre sections (chaque section apporte quelque chose de nouveau).
- Chaque section doit justifier son existence.

4. VALEUR AJOUTÉE ET DIFFÉRENCIATION
Identifie :
- 3-5 points différenciants par rapport aux articles concurrents.
- Les angles originaux que cette page apporte.
- Les éléments d'expertise qui prouvent l'autorité.

5. PLACEMENT SEO
Pour chaque section, indique :
- Quel(s) mot(s)-clé(s) secondaire(s) intégrer naturellement.
- Quels termes du champ sémantique utiliser.
- Où ajouter du contenu stratégique (listes, tableaux, données).
${featured_snippet ? `- Le featured snippet est prévu "${featured_snippet.placement === "top" ? "en haut de page" : "après l'introduction"}" — le plan doit s'articuler autour.` : ""}

6. PROFONDEUR PAR SECTION
Pour chaque section, évalue :
- importance: "high" (section critique, doit être très détaillée), "medium" (important, bon niveau de détail), "low" (utile mais peut rester concis).
- Le nombre de mots approximatif attendu.

CONTRAINTES :
- Aucun contenu générique. Chaque point doit être spécifique à "${primaryKw}" et "${site.industry}".
- Aucune répétition entre sections.
- Penser utilisateur AVANT SEO : le plan doit produire un article réellement utile.
- Les exemples doivent être concrets et crédibles.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "sections": [
    {
      "title": "Titre H2 ou H3 (repris de la structure)",
      "objective": "Ce que cette section doit accomplir (1 phrase)",
      "content_points": ["Point 1 à traiter", "Point 2", "Point 3"],
      "examples": ["Exemple concret 1", "Exemple 2"],
      "seo_notes": "Mots-clés secondaires et termes sémantiques à intégrer dans cette section",
      "importance": "high|medium|low"
    }
  ],
  "content_flow": "Description de la progression logique globale de l'article (2-3 phrases)",
  "differentiation_points": ["Point différenciant 1", "Point 2", "Point 3"],
  "global_strategy": "Stratégie éditoriale globale : ton, approche, promesse de valeur (2-3 phrases)"
}`;

    const aiResult = await aiCall(
      { task: "editorial_plan" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const plan = parseAiJson<EditorialPlan>(aiResult.text);
    if (!plan) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      plan,
      keyword: primaryKw,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
