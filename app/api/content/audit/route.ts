/**
 * Content Quality Audit API
 *
 * Post-optimization step that detects and corrects:
 * - SEO over-optimization (keyword stuffing, unnatural placement)
 * - AI-generated content patterns (repetitive structures, robotic phrasing)
 * - Readability issues (flow, clarity, natural rhythm)
 *
 * Called AFTER linking, BEFORE publication.
 * Returns corrected content + detailed audit report.
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type AuditResult = {
  issues_detected: string[];
  keyword_usage_analysis: string;
  ai_pattern_detection: string;
  readability_score: string;
  naturalness_score: number;
  risk_level: "low" | "medium" | "high";
  recommended_changes: string[];
  corrected_content: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "content-audit", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      content,
      primary_keyword,
      secondary_keywords,
      semantic_field,
      language = "fr",
    } = await request.json() as {
      content: string;
      primary_keyword: string;
      secondary_keywords?: string[];
      semantic_field?: string[];
      language?: string;
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

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert senior en SEO (10+ ans d'expérience), spécialisé dans la détection de sur-optimisation SEO, la qualité de contenu, l'optimisation naturelle et le comportement des algorithmes Google.

Ta mission : auditer un contenu SEO finalisé pour détecter toute forme de sur-optimisation ou de contenu artificiel, puis corriger les problèmes identifiés.

LANGUE : ${language}

CONTEXTE :
Site : ${site?.business_name ?? ""} — ${site?.industry ?? ""}
Ce contenu a été structuré, rédigé, enrichi sémantiquement, optimisé et maillé.
Tu dois maintenant vérifier sa qualité avant publication.

DONNÉES D'ENTRÉE :
Mot-clé principal : "${primary_keyword}"
Mots-clés secondaires : ${secondary_keywords?.length ? secondary_keywords.join(", ") : "non fournis"}
Champ sémantique : ${semantic_field?.length ? semantic_field.join(", ") : "non fourni"}

CONTENU HTML À AUDITER :
${content.slice(0, 14000)}

---

ANALYSE EN 7 PARTIES :

1. ANALYSE DU MOT-CLÉ PRINCIPAL
Vérifie :
- La fréquence du mot-clé principal dans le contenu (densité acceptable : 1-2%).
- Les répétitions excessives ou non naturelles.
- Les placements artificiels (début de chaque paragraphe, bourrage dans les titres).
- Les variations insuffisantes (toujours la même forme exacte).
Signale chaque occurrence problématique avec son contexte.

2. ANALYSE DES PHRASES
Identifie :
- Les phrases robotiques ou trop structurées (sujet-verbe-complément répétitif).
- Les structures de phrases répétitives (3+ phrases consécutives avec le même pattern).
- Le manque de fluidité (transitions absentes, enchaînements mécaniques).
- Les phrases trop longues ou trop courtes en séquence.
- Le manque de variation dans les connecteurs logiques.

3. ANALYSE SÉMANTIQUE
Vérifie :
- La richesse du vocabulaire (diversité lexicale).
- La diversité des termes utilisés pour exprimer les mêmes concepts.
- L'absence de variation (même mot répété au lieu de synonymes).
- L'intégration naturelle des mots-clés secondaires et du champ sémantique.
- La sur-utilisation de certains termes.

4. DÉTECTION DE PATTERNS IA
Identifie les marqueurs typiques de contenu généré par IA :
- Répétitions de formules ("il est important de", "il convient de noter", "en effet").
- Tournures artificiellement équilibrées ("d'une part... d'autre part").
- Manque de nuance (tout est présenté comme certain, pas de doute).
- Listes trop parfaitement structurées.
- Absence d'opinion, de ton personnel ou d'expérience.
- Phrases d'introduction génériques à chaque section.
- Conclusions qui répètent l'introduction.

5. LISIBILITÉ
Vérifie :
- La fluidité générale (se lit-il comme un texte écrit par un humain expert ?).
- La clarté des explications (pas de jargon inutile).
- Le confort de lecture (rythme, variation de longueur).
- Les transitions entre sections (naturelles ou mécaniques ?).
- Le ton (expert mais accessible, pas professoral ni robotique).

6. CORRECTIONS
Pour chaque problème identifié, propose :
- Des reformulations naturelles (réécrire les phrases robotiques).
- Des suppressions (retirer les répétitions inutiles du mot-clé).
- Des améliorations (ajouter des variations, des nuances, du naturel).
- Des ajustements de ton (rendre le texte plus humain, plus engageant).
Applique TOUTES les corrections dans le contenu corrigé final.

7. SCORE
Attribue :
- Un score de naturalité de 0 à 100 (100 = indiscernable d'un texte humain expert).
- Un niveau de risque SEO : "low" (aucun risque), "medium" (corrections mineures), "high" (risque de pénalité).

CONTRAINTES ABSOLUES :
- NE SUR-CORRIGE PAS. Si le contenu est déjà naturel, ne le modifie pas inutilement.
- CONSERVE le sens et l'intention de chaque phrase.
- CONSERVE la structure HTML (H2, H3, liens intacts).
- CONSERVE les liens <a href> existants intacts (ne modifie pas les URLs ni les ancres).
- PRIVILÉGIE le naturel : chaque correction doit rendre le texte PLUS humain.
- ÉVITE toute optimisation forcée.
- Si le score est déjà > 85, applique uniquement des corrections mineures.

OBJECTIF : le contenu corrigé doit donner l'impression d'avoir été écrit par un humain expert du secteur "${site?.industry ?? ""}".

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "issues_detected": ["Description précise de chaque problème trouvé"],
  "keyword_usage_analysis": "Analyse de la densité et du placement du mot-clé (1-2 phrases)",
  "ai_pattern_detection": "Résumé des patterns IA détectés (1-2 phrases)",
  "readability_score": "Évaluation de la lisibilité (1 phrase)",
  "naturalness_score": 0-100,
  "risk_level": "low|medium|high",
  "recommended_changes": ["Chaque changement recommandé et appliqué"],
  "corrected_content": "Le contenu HTML complet après corrections"
}`;

    const aiResult = await aiCall(
      { task: "content_audit" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const audit = parseAiJson<AuditResult>(aiResult.text);
    if (!audit) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      audit,
      keyword: primary_keyword,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
