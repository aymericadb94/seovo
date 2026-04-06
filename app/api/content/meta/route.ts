/**
 * Meta Optimization API
 *
 * Generates optimized title SEO + meta description for maximum CTR.
 * Creates 3 title variants (50-60 chars) and 2 meta variants (140-160 chars).
 *
 * Called AFTER content audit, BEFORE publication.
 * Picks the best variant automatically based on CTR strategy.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type MetaOptimization = {
  titles: [string, string, string];
  meta_descriptions: [string, string];
  ctr_strategy: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "meta-optimization", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      primary_keyword,
      secondary_keywords,
      content_summary,
      intent_analysis,
      seo_angle,
      language = "fr",
    } = await request.json() as {
      primary_keyword: string;
      secondary_keywords?: string[];
      content_summary?: string;
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
        recommended_content_type: string;
        angle: string;
      };
      seo_angle?: string;
      language?: string;
    };

    if (!primary_keyword?.trim()) {
      return Response.json({ error: "Mot-clé principal requis" }, { status: 400 });
    }

    // ── Site context ───────────────────────────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, seo_context")
      .eq("user_id", user.id)
      .maybeSingle();

    const seoCtx = (site?.seo_context ?? {}) as Record<string, unknown>;

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert senior en SEO et copywriting (10+ ans d'expérience), spécialisé dans l'optimisation du CTR, la rédaction de titles SEO performants, les meta descriptions engageantes et la psychologie du clic.

Ta mission : créer un title SEO et une meta description qui maximisent le taux de clic dans les résultats Google.

LANGUE : ${language}

CONTEXTE :
Site : ${site?.business_name ?? ""} — ${site?.industry ?? ""}
Audience : ${seoCtx.target_customer ?? "non renseigné"}
Mot-clé principal : "${primary_keyword}"
Mots-clés secondaires : ${secondary_keywords?.length ? secondary_keywords.join(", ") : "non fournis"}
${content_summary ? `Résumé du contenu : ${content_summary}` : ""}
${intent_analysis ? `Intention de recherche : ${intent_analysis.intent_type} — ${intent_analysis.user_intent}
Type de contenu recommandé : ${intent_analysis.recommended_content_type}
Angle : ${intent_analysis.angle}` : ""}
${seo_angle ? `Angle SEO / différenciation : ${seo_angle}` : ""}

---

ANALYSE ET CRÉATION EN 4 PARTIES :

1. TITLE SEO (3 variantes)
Crée 3 variantes de title, chacune avec un angle différent :

Variante 1 — Bénéfice utilisateur : met en avant ce que le lecteur va obtenir.
Variante 2 — Curiosité / question : suscite l'envie d'en savoir plus.
Variante 3 — Clarté / promesse directe : dit exactement ce que la page contient.

Chaque title doit :
- Inclure le mot-clé principal de manière naturelle (pas forcé en début).
- Être clair et compréhensible en 1 seconde.
- Donner envie de cliquer sans être du clickbait.
- Rester crédible et professionnel.
- Faire entre 50 et 60 caractères (STRICT — compte les caractères).

Techniques autorisées :
- Chiffres concrets ("7 étapes", "en 2025").
- Bénéfice clair ("pour doubler vos résultats").
- Curiosité mesurée ("ce que personne ne vous dit").
- Urgence douce ("avant qu'il soit trop tard").

Techniques INTERDITES :
- Majuscules excessives.
- Clickbait agressif ("INCROYABLE", "CHOQUANT").
- Promesses mensongères.
- Répétition du mot-clé.
- Emojis.

2. META DESCRIPTION (2 variantes)
Crée 2 variantes de meta description, chacune avec un ton différent :

Variante 1 — Informatif et expert : résume la valeur avec autorité.
Variante 2 — Engageant et persuasif : pousse au clic avec une promesse claire.

Chaque meta description doit :
- Résumer la valeur unique de la page en 1-2 phrases.
- Donner envie de cliquer avec une promesse claire et honnête.
- Être naturelle (pas une liste de mots-clés).
- Contenir un appel à l'action implicite ou explicite.
- Faire entre 140 et 160 caractères (STRICT — compte les caractères).

Techniques autorisées :
- Promesse de valeur ("Découvrez comment...").
- Preuve sociale implicite ("utilisé par les experts").
- Bénéfice concret ("pour gagner du temps").
- Question engageante ("Vous cherchez à... ?").

Techniques INTERDITES :
- Bourrage de mots-clés.
- Phrases vides ("Bienvenue sur notre page").
- Sur-optimisation.
- Répétition du title.

3. STRATÉGIE CTR
Explique en 2-3 phrases :
- Pourquoi ces variantes fonctionnent pour ce mot-clé et cette intention.
- Quel angle psychologique est utilisé pour maximiser le clic.
- En quoi elles se différencient des résultats concurrents typiques.

4. CONTRÔLE QUALITÉ
Avant de répondre, vérifie pour CHAQUE variante :
- ✅ Longueur title : 50-60 caractères.
- ✅ Longueur meta : 140-160 caractères.
- ✅ Mot-clé principal présent naturellement.
- ✅ Pas de clickbait excessif.
- ✅ Pas de promesse mensongère.
- ✅ Pas de répétition du mot-clé.
- ✅ Crédible et professionnel.
- ✅ Donne réellement envie de cliquer.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "titles": [
    "Title variante 1 — bénéfice (50-60 chars)",
    "Title variante 2 — curiosité (50-60 chars)",
    "Title variante 3 — clarté (50-60 chars)"
  ],
  "meta_descriptions": [
    "Meta variante 1 — informatif expert (140-160 chars)",
    "Meta variante 2 — engageant persuasif (140-160 chars)"
  ],
  "ctr_strategy": "Explication de la stratégie CTR choisie (2-3 phrases)"
}`;

    const aiResult = await aiCall(
      { task: "meta_optimization" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const meta = parseAiJson<MetaOptimization>(aiResult.text);
    if (!meta) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      meta,
      keyword: primary_keyword,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
