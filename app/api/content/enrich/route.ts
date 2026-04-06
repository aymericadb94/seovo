/**
 * Semantic Enrichment API
 *
 * Enriches an already-written article with deeper semantics:
 * - Adds synonyms, related terms, co-occurrences
 * - Improves sentence fluidity and variety
 * - Adds micro-content (precision, short examples, useful details)
 * - Removes repetitions
 * - Never rewrites the content — only improves it
 *
 * Called AFTER content generation, BEFORE publication.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type EnrichmentResult = {
  improved_content: string;
  improvements: string[];
  semantic_additions: string[];
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "semantic-enrich", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      content,
      title,
      keyword,
      keyword_strategy,
      intent_analysis,
      language = "fr",
    } = await request.json() as {
      content: string;
      title: string;
      keyword: string;
      language?: string;
      keyword_strategy?: {
        primary_keyword: string;
        secondary_keywords: string[];
        semantic_field: string[];
      };
      intent_analysis?: {
        intent_type: string;
        user_intent: string;
      };
    };

    if (!content?.trim()) {
      return Response.json({ error: "Contenu requis" }, { status: 400 });
    }

    // ── Site context ───────────────────────────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry")
      .eq("user_id", user.id)
      .maybeSingle();

    const primaryKw = keyword_strategy?.primary_keyword ?? keyword;

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans) spécialisé en sémantique SEO avancée, NLP, optimisation naturelle de contenu et enrichissement lexical.

Ta mission : ENRICHIR un contenu SEO existant SANS le réécrire. Tu améliores la profondeur sémantique, la fluidité et la qualité perçue.

LANGUE : ${language}. Tout le contenu enrichi doit rester dans cette langue.

ARTICLE À ENRICHIR :
Titre : "${title}"
Mot-clé principal : "${primaryKw}"
Secteur : "${site?.industry ?? "non spécifié"}"
${keyword_strategy ? `Mots-clés secondaires : ${keyword_strategy.secondary_keywords.join(", ")}
Champ sémantique : ${keyword_strategy.semantic_field.join(", ")}` : ""}
${intent_analysis ? `Intention : ${intent_analysis.intent_type} — ${intent_analysis.user_intent}` : ""}

CONTENU HTML ACTUEL :
${content.slice(0, 12000)}

---

ANALYSE ET ENRICHISSEMENT EN 5 PARTIES :

1. ANALYSE DU CONTENU
- Identifie les zones pauvres en sémantique (paragraphes trop courts ou superficiels).
- Repère les répétitions de mots ou de formulations.
- Détecte les manques d'information (points importants non couverts).
- Vérifie la couverture des mots-clés secondaires et du champ sémantique.

2. ENRICHISSEMENT SÉMANTIQUE
Pour chaque zone identifiée :
- Ajoute des synonymes naturels (pas des synonymes forcés).
- Intègre des termes liés et des cooccurrences sémantiques que Google attend.
- Ajoute des expressions connexes du domaine "${site?.industry ?? ""}".
- Enrichis le vocabulaire sans alourdir.

3. AMÉLIORATION DES PHRASES
- Fluidifie les phrases maladroites ou trop longues.
- Élimine les répétitions de mots à proximité (même mot dans 2 phrases consécutives).
- Améliore la clarté des passages confus.
- Varie la longueur des phrases (alterner courtes et développées).
- NE CHANGE PAS le sens ou la structure globale.

4. AJOUT DE MICRO-CONTENU
Si pertinent, ajoute :
- Des précisions utiles (1-2 phrases max par ajout).
- Des exemples courts et concrets liés au secteur.
- Des détails qui renforcent la crédibilité (données, chiffres, comparaisons).
- Des transitions améliorées entre sections.

5. VÉRIFICATION ANTI-SUR-OPTIMISATION
- Le mot-clé principal ne doit PAS apparaître plus souvent qu'avant.
- Aucun keyword stuffing.
- Le contenu enrichi doit rester 100% naturel.
- Aucune formule générique ajoutée ("il est important de", "il convient de noter").

CONTRAINTES ABSOLUES :
- NE CHANGE PAS la structure (H2, H3 restent identiques).
- NE SUPPRIME PAS de contenu existant.
- NE RÉÉCRIS PAS les paragraphes — améliore-les.
- Les ajouts doivent s'intégrer naturellement au texte existant.
- Le contenu enrichi doit être plus long que l'original (5-15% d'ajout max).

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "improved_content": "Le contenu HTML enrichi complet (même structure, contenu amélioré)",
  "improvements": [
    "Description courte de chaque amélioration appliquée"
  ],
  "semantic_additions": [
    "Liste des termes sémantiques ajoutés au contenu"
  ]
}`;

    const aiResult = await aiCall(
      { task: "semantic_enrichment" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const enrichment = parseAiJson<EnrichmentResult>(aiResult.text);
    if (!enrichment) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      enrichment,
      keyword: primaryKw,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
