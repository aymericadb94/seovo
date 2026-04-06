/**
 * Final Quality Check API
 *
 * Last gate before publication. Validates the content is:
 * - Complete and coherent
 * - Properly optimized (not over/under)
 * - Well structured (H1/H2/H3 logic)
 * - User-friendly (readability, UX)
 * - Cocoon-aligned (internal links coherence)
 *
 * Returns a verdict: ready / improve / rewrite.
 * If "improve", applies corrections directly in final_content.
 * If "rewrite", flags the content — caller decides next step.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type FinalCheckResult = {
  quality_score: number;
  seo_score: number;
  readability_score: number;
  issues: string[];
  improvements: string[];
  final_verdict: "ready" | "improve" | "rewrite";
  final_content: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "final-check", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      content,
      title,
      meta_description,
      primary_keyword,
      seo_structure,
      cocoon_positioning,
      language = "fr",
    } = await request.json() as {
      content: string;
      title: string;
      meta_description?: string;
      primary_keyword: string;
      language?: string;
      seo_structure?: {
        h1: string;
        sections: { h2: string; subsections?: { h3: string }[] }[];
      };
      cocoon_positioning?: {
        page_type: string;
        seo_role: string;
        pillar_relation: string;
        risk_level: string;
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

    // ── Structure context ─────────────────────────────────────────────────
    let structureCtx = "";
    if (seo_structure) {
      structureCtx = `\nSTRUCTURE PRÉVUE :
H1 : "${seo_structure.h1}"
${seo_structure.sections?.map((s, i) => {
  const subs = s.subsections?.map(sub => `    - H3 : "${sub.h3}"`).join("\n") ?? "";
  return `  ${i + 1}. H2 : "${s.h2}"${subs ? "\n" + subs : ""}`;
}).join("\n") ?? ""}`;
    }

    // ── Cocoon context ────────────────────────────────────────────────────
    let cocoonCtx = "";
    if (cocoon_positioning) {
      cocoonCtx = `\nPOSITIONNEMENT COCON :
Type de page : ${cocoon_positioning.page_type}
Rôle SEO : ${cocoon_positioning.seo_role}
Relation pilier : ${cocoon_positioning.pillar_relation}
Risque : ${cocoon_positioning.risk_level}`;
    }

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert senior en SEO (10+ ans d'expérience), spécialisé dans l'audit de contenu SEO, la qualité rédactionnelle, l'optimisation globale et l'UX/lisibilité.

Ta mission : effectuer le CONTRÔLE FINAL d'un contenu SEO avant publication. Tu es la dernière étape de qualité. Sois exigeant.

LANGUE : ${language}

CONTEXTE :
Site : ${site?.business_name ?? ""} — ${site?.industry ?? ""}
Audience : ${seoCtx.target_customer ?? "non renseigné"}
Objectif : ${seoCtx.objective ?? "croissance organique"}

Ce contenu a déjà été :
1. Analysé (intention de recherche)
2. Positionné dans le cocon sémantique
3. Structuré (H1/H2/H3)
4. Rédigé par IA
5. Enrichi sémantiquement
6. Amélioré (exemples, conseils, insights)
7. Maillé (liens internes)
8. Audité anti-sur-optimisation
9. Optimisé CTR (title & meta)

Tu dois faire le contrôle final avant publication.

ARTICLE :
Title SEO : "${title}"
Meta description : "${meta_description ?? "non fournie"}"
Mot-clé principal : "${primary_keyword}"
${structureCtx}
${cocoonCtx}

CONTENU HTML :
${content.slice(0, 14000)}

---

CONTRÔLE FINAL EN 10 PARTIES :

1. COHÉRENCE GLOBALE
Vérifie :
- Le contenu répond-il à l'intention de recherche du mot-clé "${primary_keyword}" ?
- Y a-t-il des contradictions entre sections ?
- Le title SEO et la meta description sont-ils alignés avec le contenu ?
- Le ton est-il cohérent du début à la fin ?
- L'angle éditorial est-il maintenu tout au long de l'article ?

2. QUALITÉ DU CONTENU
Analyse :
- Le contenu apporte-t-il une VRAIE valeur au lecteur ?
- Les informations sont-elles précises et crédibles ?
- Y a-t-il de la profondeur ou est-ce superficiel ?
- Les exemples et conseils sont-ils concrets et actionnables ?
- Le contenu se distingue-t-il des résultats concurrents ?

3. STRUCTURE
Vérifie :
- La hiérarchie H1 > H2 > H3 est-elle logique et respectée ?
- La progression est-elle naturelle (du général au spécifique, ou problème → solution) ?
- Chaque section apporte-t-elle quelque chose de nouveau ?
- Les transitions entre sections sont-elles fluides ?
- La longueur des sections est-elle équilibrée ?

4. SEO
Vérifie :
- Le mot-clé principal est-il utilisé naturellement (pas de bourrage) ?
- La densité est-elle acceptable (1-2% max) ?
- Les mots-clés secondaires et le champ sémantique sont-ils présents ?
- Les balises H2/H3 contiennent-elles des variations pertinentes ?
- Il n'y a AUCUNE sur-optimisation résiduelle.

5. UX / LISIBILITÉ
Analyse :
- Le texte se lit-il facilement ? Fluidité naturelle ?
- Les paragraphes sont-ils aérés (pas de blocs de texte massifs) ?
- Les listes et éléments visuels cassent-ils la monotonie ?
- Le niveau de langue est-il adapté à l'audience cible ?
- Un lecteur humain apprécierait-il vraiment ce contenu ?

6. MAILLAGE INTERNE
Vérifie :
- Les liens internes sont-ils pertinents et bien placés ?
- Les ancres de lien sont-elles naturelles et variées ?
- Les liens respectent-ils la logique du cocon sémantique ?
- Il n'y a pas trop de liens (3-5 max) ni de liens dans l'introduction ?
- Aucun lien cassé ou vers une URL manquante.

7. DÉFAUTS
Identifie :
- Toute erreur factuelle ou incohérence.
- Toute faiblesse rédactionnelle (phrase bancale, formulation maladroite).
- Tout pattern IA résiduel (formules répétitives, ton robotique).
- Toute information manquante qui affaiblit l'article.
- Tout problème de formatage HTML.

8. SCORE FINAL
Attribue 3 scores sur 100 :
- quality_score : qualité globale du contenu (valeur, profondeur, crédibilité).
- seo_score : optimisation SEO (mots-clés, structure, maillage).
- readability_score : lisibilité et UX (fluidité, clarté, confort).

9. VERDICT
Détermine :
- "ready" : le contenu est irréprochable, prêt à publier tel quel.
- "improve" : le contenu est bon mais a des défauts mineurs → applique les corrections.
- "rewrite" : le contenu a des problèmes majeurs → liste les problèmes (rare si les étapes précédentes ont bien fonctionné).

Sois EXIGEANT mais JUSTE. Ne valide pas automatiquement. Pense comme Google + utilisateur exigeant.

10. CORRECTIONS (si verdict = "improve")
Applique DIRECTEMENT dans le contenu :
- Reformulations des passages faibles.
- Corrections de structure si nécessaire.
- Suppression des patterns IA résiduels.
- Amélioration des transitions.
- Tout ajustement nécessaire pour un score > 85.

CONTRAINTES ABSOLUES :
- CONSERVE la structure HTML (H2, H3, liens <a href>).
- NE SUPPRIME PAS de contenu de valeur.
- NE CHANGE PAS les URLs des liens internes.
- Si le contenu est déjà excellent (score > 90), retourne-le quasi inchangé.
- Sois honnête : si c'est moyen, dis-le. Si c'est bien, dis-le aussi.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "quality_score": 0-100,
  "seo_score": 0-100,
  "readability_score": 0-100,
  "issues": ["Chaque problème identifié, même mineur"],
  "improvements": ["Chaque amélioration appliquée au contenu"],
  "final_verdict": "ready|improve|rewrite",
  "final_content": "Le contenu HTML final après corrections (ou identique si ready)"
}`;

    const aiResult = await aiCall(
      { task: "final_check" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const check = parseAiJson<FinalCheckResult>(aiResult.text);
    if (!check) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      check,
      keyword: primary_keyword,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
