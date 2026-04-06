/**
 * Value Enhancement API
 *
 * Adds concrete value to an already-written and semantically-enriched article:
 * - Concrete examples and real-world situations
 * - Actionable tips and best practices
 * - Expert insights and business logic
 * - Credibility reinforcement
 *
 * Called AFTER semantic enrichment, BEFORE publication.
 * Does NOT rewrite — only adds value to existing content.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type EnhancementResult = {
  enhanced_content: string;
  added_examples: string[];
  added_insights: string[];
  added_tips: string[];
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "value-enhance", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      content,
      title,
      keyword,
      intent_analysis,
      keyword_strategy,
      language = "fr",
    } = await request.json() as {
      content: string;
      title: string;
      keyword: string;
      language?: string;
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
        recommended_content_type: string;
        angle: string;
      };
      keyword_strategy?: {
        primary_keyword: string;
        seo_angle: string;
      };
    };

    if (!content?.trim()) {
      return Response.json({ error: "Contenu requis" }, { status: 400 });
    }

    // ── Site context ───────────────────────────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, seo_context")
      .eq("user_id", user.id)
      .maybeSingle();

    const seoCtx = (site?.seo_context ?? {}) as Record<string, unknown>;
    const primaryKw = keyword_strategy?.primary_keyword ?? keyword;

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un rédacteur SEO senior (10+ ans), spécialisé dans la création de contenu à forte valeur, le copywriting SEO, l'engagement utilisateur et le contenu expert.

Ta mission : ENRICHIR un contenu SEO existant en ajoutant de la valeur concrète. Tu ne réécris PAS le contenu — tu l'améliores en ajoutant des éléments différenciants.

LANGUE : ${language}. Tout le contenu ajouté doit être dans cette langue.

ARTICLE À AMÉLIORER :
Titre : "${title}"
Mot-clé principal : "${primaryKw}"
Secteur : "${site?.industry ?? "non spécifié"}"
Business : "${site?.business_name ?? ""}"
Audience cible : "${seoCtx.target_customer ?? "non renseigné"}"
${intent_analysis ? `Intention : ${intent_analysis.intent_type} — ${intent_analysis.user_intent}
Angle SEO : ${intent_analysis.angle}` : ""}
${keyword_strategy ? `Angle de différenciation : ${keyword_strategy.seo_angle}` : ""}

CONTENU HTML ACTUEL :
${content.slice(0, 12000)}

---

ANALYSE ET AMÉLIORATION EN 5 PARTIES :

1. IDENTIFICATION DES ZONES FAIBLES
Repère dans le contenu :
- Les passages trop génériques (vrai pour n'importe quel secteur).
- Les sections qui manquent de concret (théorie sans application).
- Le contenu abstrait qui pourrait être illustré.
- Les affirmations non étayées (manque de preuve ou d'exemple).

2. AJOUT D'EXEMPLES CONCRETS
Pour chaque zone identifiée, ajoute :
- Des exemples spécifiques au secteur "${site?.industry ?? ""}" (pas génériques).
- Des situations réelles que l'audience cible rencontre.
- Des cas pratiques avec des résultats concrets (chiffres si possible).
- Des comparaisons avant/après pour illustrer l'impact.
Format : intègre les exemples naturellement dans le texte existant (1-3 phrases par ajout).

3. AJOUT DE CONSEILS ACTIONNABLES
Ajoute :
- Des recommandations que le lecteur peut appliquer immédiatement.
- Des bonnes pratiques du secteur.
- Des erreurs courantes à éviter (avec pourquoi c'est une erreur).
- Des astuces de professionnel que seul un expert connaît.
Format : listes à puces ou paragraphes courts intégrés aux sections existantes.

4. AJOUT D'INSIGHTS EXPERTS
Ajoute :
- Des observations pertinentes basées sur l'expérience métier.
- Des nuances que les articles concurrents ignorent.
- De la logique métier (pourquoi X fonctionne et pas Y).
- Des tendances ou évolutions du secteur.
Format : 1-2 phrases insérées naturellement, ton d'autorité sans arrogance.

5. RENFORCEMENT DE LA CRÉDIBILITÉ
Améliore :
- Le ton expert (précision des formulations).
- La spécificité des informations (remplacer "beaucoup" par un chiffre plausible).
- L'utilité réelle (chaque paragraphe doit apporter quelque chose de concret).
- Les transitions (lier les ajouts au contenu existant de manière fluide).

CONTRAINTES ABSOLUES :
- NE CHANGE PAS la structure HTML (H2, H3 restent identiques).
- NE SUPPRIME PAS de contenu existant.
- NE RÉÉCRIS PAS les paragraphes — ajoute à côté ou après.
- Les ajouts doivent s'intégrer naturellement (pas de "Par exemple," répétitif).
- Contenu ajouté : +5-15% max. Ne pas alourdir inutilement.
- Aucune sur-optimisation SEO. Rester naturel.
- Aucun contenu artificiel ou inventé de manière non crédible.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "enhanced_content": "Le contenu HTML amélioré complet (même structure, valeur ajoutée)",
  "added_examples": ["Description de chaque exemple ajouté"],
  "added_insights": ["Description de chaque insight ajouté"],
  "added_tips": ["Description de chaque conseil ajouté"]
}`;

    const aiResult = await aiCall(
      { task: "value_enhancement" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const enhancement = parseAiJson<EnhancementResult>(aiResult.text);
    if (!enhancement) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      enhancement,
      keyword: primaryKw,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
