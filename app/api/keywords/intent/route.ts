/**
 * Intent Analysis API
 *
 * Analyzes search intent depth BEFORE creating content.
 * Prevents useless page creation by evaluating:
 * - Real user intent behind the keyword
 * - Expected SERP content type
 * - Cannibalization risk with existing pages
 * - Strategic fit within the cocoon/roadmap
 *
 * Returns a decision: create | optimize | ignore
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type IntentAnalysis = {
  intent_type: "informationnelle" | "transactionnelle" | "navigationnelle" | "commerciale";
  user_intent: string;
  serp_analysis: string;
  recommended_content_type: string;
  angle: string;
  risk_level: "low" | "medium" | "high";
  decision: "create" | "optimize" | "ignore";
  justification: string;
  cannibalization_target?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "intent-analysis", maxRequests: 30, windowSeconds: 3600 });
    if (limited) return limited;

    const { keyword } = await request.json() as { keyword: string };
    if (!keyword?.trim()) {
      return Response.json({ error: "Mot-clé requis" }, { status: 400 });
    }

    // ── Gather context ────────────────────────────────────────────────────────
    const [siteRes, pubsRes, roadmapRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("business_name, industry, site_url, keywords, seo_context").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", user.id),
      supabase.from("roadmaps").select("data").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
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

    // Find the cluster this keyword belongs to
    type CocoonCluster = { name: string; pillar: { keyword: string }; support_pages: { keyword: string }[] };
    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];
    let cluster = "non classifié";
    for (const c of clusters) {
      if (c.pillar?.keyword?.toLowerCase() === keyword.toLowerCase()) {
        cluster = c.name;
        break;
      }
      if (c.support_pages?.some(sp => sp.keyword?.toLowerCase() === keyword.toLowerCase())) {
        cluster = c.name;
        break;
      }
    }

    // Find roadmap context
    type RoadmapArticle = { keyword: string; role: string; intent: string; angle: string };
    const roadmapData = roadmapRes.data?.data as { articles?: RoadmapArticle[] } | null;
    const roadmapArticle = (roadmapData?.articles ?? []).find(
      a => a.keyword?.toLowerCase() === keyword.toLowerCase()
    );

    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;

    // ── AI Analysis ───────────────────────────────────────────────────────────
    const prompt = `Tu es un expert senior en SEO (10+ ans d'expérience), spécialisé dans l'analyse d'intention de recherche, la compréhension des SERP, la stratégie de contenu SEO, et la détection des besoins utilisateurs.

Ta mission : analyser en profondeur l'intention de recherche d'un mot-clé AVANT de créer du contenu. Tu dois éviter toute création de page inutile ou mal positionnée.

INPUT :
{
  "keyword": "${keyword}",
  "cluster": "${cluster}",
  "business_goal": "${seoCtx.objective ?? "croissance organique"}",
  "target_audience": "${seoCtx.target_customer ?? "non renseigné"}",
  "country": "${seoCtx.geography ?? "France"}",
  "industry": "${site.industry}",
  "business_name": "${site.business_name}",
  "site_url": "${site.site_url}",
  "existing_pages": ${JSON.stringify(existingPages.slice(0, 20).map(p => ({ title: p.title, keyword: p.keyword })))}${roadmapArticle ? `,
  "roadmap_context": {
    "role": "${roadmapArticle.role}",
    "intent": "${roadmapArticle.intent}",
    "angle": "${roadmapArticle.angle}"
  }` : ""}
}

ANALYSE EN 6 PARTIES :

1. TYPE D'INTENTION — Classifier : informationnelle, transactionnelle, navigationnelle, ou commerciale.

2. INTENTION RÉELLE — Ce que l'utilisateur veut VRAIMENT. Pas le mot-clé littéral, mais le problème qu'il cherche à résoudre. Son niveau de maturité dans le parcours d'achat.

3. ANALYSE SERP (SIMULÉE) — Déduire les types de contenus qui dominent les résultats Google pour cette requête (guides, listes, comparatifs, outils, pages produits). Quel niveau de profondeur est attendu ?

4. ANGLE SEO RECOMMANDÉ — L'angle exact de la page, la promesse principale, la différenciation possible par rapport aux résultats existants.

5. RISQUE SEO — Cannibalisation possible avec les pages existantes ci-dessus ? Risque de créer une page inutile ? Difficulté estimée du mot-clé ?

6. DÉCISION — "create" (nouvelle page justifiée), "optimize" (une page existante couvre déjà ce sujet), ou "ignore" (mot-clé non stratégique / trop difficile / pas d'intention claire).

CONTRAINTES :
- Aucune généralité. Chaque analyse doit être spécifique à CE mot-clé et CE business.
- Penser comme Google : qu'est-ce que l'algorithme attend comme contenu pour cette requête ?
- Si une page existante couvre déjà le sujet → decision = "optimize" et indiquer laquelle.
- Si le mot-clé n'a aucun potentiel réel → decision = "ignore" avec justification honnête.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "intent_type": "informationnelle|transactionnelle|navigationnelle|commerciale",
  "user_intent": "Ce que l'utilisateur cherche réellement (1-2 phrases précises)",
  "serp_analysis": "Types de contenus attendus dans les SERP + niveau de profondeur (1-2 phrases)",
  "recommended_content_type": "guide|liste|comparatif|tutoriel|page_produit|faq|etude_de_cas",
  "angle": "L'angle exact et différenciant recommandé pour cette page (1 phrase)",
  "risk_level": "low|medium|high",
  "decision": "create|optimize|ignore",
  "justification": "Pourquoi cette décision est la bonne (2-3 phrases stratégiques)"${existingPages.length > 0 ? `,
  "cannibalization_target": "Titre de la page existante qui risque la cannibalisation (si applicable, sinon null)"` : ""}
}`;

    // intent_analysis → Opus (strategic decision)
    const aiResult = await aiCall(
      { task: "intent_analysis" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const analysis = parseAiJson<IntentAnalysis>(aiResult.text);
    if (!analysis) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({ analysis, keyword, cluster });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
