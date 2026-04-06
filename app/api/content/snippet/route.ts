/**
 * Featured Snippet API
 *
 * Creates an optimized featured snippet (position 0) for a page.
 * Called AFTER content structure, BEFORE content generation.
 *
 * The snippet is injected into the article as-is, and the content
 * generation prompt is told not to regenerate it.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type FeaturedSnippet = {
  snippet_type: "definition" | "list" | "steps";
  snippet_text: string;
  structured_version: string[];
  placement: "top" | "after_intro";
  integration_text: string;
  justification: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "featured-snippet", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      keyword,
      intent_analysis,
      content_structure,
      keyword_strategy,
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
        featured_snippet_section: {
          type: string;
          title: string;
          reason: string;
        };
      };
      keyword_strategy?: {
        primary_keyword: string;
        seo_angle: string;
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

    // Determine snippet type from structure analysis or intent
    const snippetType = content_structure?.featured_snippet_section?.type
      ?? (intent_analysis?.recommended_content_type === "guide" || intent_analysis?.recommended_content_type === "tutoriel"
        ? "steps"
        : intent_analysis?.intent_type === "informationnelle"
        ? "definition"
        : "list");

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans), spécialisé dans les featured snippets (position 0 Google), la structuration de réponses SEO et la compréhension des SERP.

Ta mission : créer un featured snippet parfait pour capturer la position 0 de Google.

INPUT :
{
  "primary_keyword": "${primaryKw}",
  "business": "${site.business_name}",
  "industry": "${site.industry}",
  "country": "${seoCtx.geography ?? "France"}",
  "target_audience": "${seoCtx.target_customer ?? "non renseigné"}",
  "snippet_type_hint": "${snippetType}"${intent_analysis ? `,
  "intent": {
    "type": "${intent_analysis.intent_type}",
    "user_intent": "${intent_analysis.user_intent}",
    "content_type": "${intent_analysis.recommended_content_type}",
    "angle": "${intent_analysis.angle}"
  }` : ""}${content_structure ? `,
  "structure": {
    "h1": "${content_structure.h1}",
    "snippet_section": {
      "type": "${content_structure.featured_snippet_section.type}",
      "title": "${content_structure.featured_snippet_section.title}"
    }
  }` : ""}${keyword_strategy ? `,
  "seo_angle": "${keyword_strategy.seo_angle}"` : ""}
}

ANALYSE EN 5 PARTIES :

1. TYPE DE SNIPPET
Choisis le format le plus adapté pour capturer la position 0 :
- "definition" : réponse courte et directe (pour "qu'est-ce que", concepts, définitions).
  → Format : un paragraphe de 40-60 mots qui commence par "[Sujet] est..." ou "[Sujet] désigne..."
- "list" : liste à puces (pour conseils, avantages, éléments à connaître).
  → Format : 4-8 points courts et percutants.
- "steps" : étapes numérotées (pour guides, tutoriels, processus).
  → Format : 4-8 étapes claires et actionnables.

Le type suggéré est "${snippetType}", mais change-le si un autre format est plus pertinent pour cette requête.

2. RÉPONSE PRINCIPALE (snippet_text)
Crée LA réponse parfaite en 40-60 mots :
- Répond DIRECTEMENT à la requête "${primaryKw}".
- Claire, concise, sans blabla.
- Parfaitement compréhensible seule (sans contexte supplémentaire).
- Contient le mot-clé principal naturellement (pas en premier mot).
- Pas de "En effet", "Il est important de noter", "Dans cet article" — va droit au but.

3. VERSION STRUCTURÉE (structured_version)
Crée une version en liste/étapes :
- Si "definition" : reformuler en 3-5 points clés.
- Si "list" : 4-8 éléments courts (max 15 mots chacun).
- Si "steps" : 4-8 étapes actionnables (commencer par un verbe).
Chaque élément doit pouvoir être lu indépendamment.

4. PLACEMENT ET INTÉGRATION
- placement : "top" (après le H1, avant l'intro) ou "after_intro" (après les 2 premiers paragraphes).
  → "top" est préféré pour les définitions et réponses directes.
  → "after_intro" pour les listes et étapes qui nécessitent un contexte.
- integration_text : le titre H2 ou la phrase d'introduction qui précède le snippet.
  → Doit être formulé comme une question si possible ("Qu'est-ce que..." / "Comment..." / "Quels sont...").

5. OPTIMISATION
Vérifie :
- Le mot-clé principal apparaît 1 fois dans snippet_text (naturellement).
- Le snippet est lisible par un enfant de 12 ans.
- Aucune sur-optimisation, aucun keyword stuffing.
- Le format correspond à ce que Google affiche réellement pour ce type de requête.

CONTRAINTES :
- Ultra clair, ultra concis.
- Aucune phrase inutile ou de remplissage.
- Langage simple et direct.
- Le snippet doit fonctionner EN DEHORS du contexte de l'article.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "snippet_type": "definition|list|steps",
  "snippet_text": "La réponse directe en 40-60 mots, claire et percutante",
  "structured_version": ["Élément 1", "Élément 2", "Élément 3", "..."],
  "placement": "top|after_intro",
  "integration_text": "Le titre H2 ou la phrase d'introduction du snippet",
  "justification": "Pourquoi ce format et cette réponse sont optimaux pour la position 0 (1 phrase)"
}`;

    const aiResult = await aiCall(
      { task: "featured_snippet" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const snippet = parseAiJson<FeaturedSnippet>(aiResult.text);
    if (!snippet) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      snippet,
      keyword: primaryKw,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
