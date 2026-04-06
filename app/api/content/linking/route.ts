/**
 * Internal Linking API
 *
 * Inserts intelligent internal links into finished content.
 * Called as the LAST content transformation step, before publication.
 *
 * Uses cocoon structure, existing pages, and positioning data to:
 * - Select 3-5 strategic link targets
 * - Create natural anchor texts
 * - Insert links seamlessly into existing sentences
 * - Respect cocoon hierarchy (support → pillar, etc.)
 */

import { createClient } from "@/lib/supabase/server";
import { aiCall, parseAiJson } from "@/lib/ai-router";
import { rateLimit } from "@/lib/rate-limit";

export type LinkingResult = {
  updated_content: string;
  links_added: {
    anchor: string;
    target: string;
    placement: string;
    objective: "seo" | "ux" | "conversion";
  }[];
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "internal-linking", maxRequests: 20, windowSeconds: 3600 });
    if (limited) return limited;

    const {
      content,
      title,
      keyword,
      cocoon_positioning,
      language = "fr",
    } = await request.json() as {
      content: string;
      title: string;
      keyword: string;
      language?: string;
      cocoon_positioning?: {
        page_type: string;
        seo_role: string;
        pillar_relation: string;
        linking_strategy: {
          outgoing: { target: string; anchor: string; reason: string }[];
          incoming: { source: string; anchor: string; reason: string }[];
        };
        risk_level: string;
      };
    };

    if (!content?.trim()) {
      return Response.json({ error: "Contenu requis" }, { status: 400 });
    }

    // ── Gather context ─────────────────────────────────────────────────────
    const [siteRes, pubsRes, cocoonRes] = await Promise.all([
      supabase.from("sites").select("business_name, industry, site_url").eq("user_id", user.id).maybeSingle(),
      supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", user.id),
      supabase.from("semantic_cocoons").select("data").eq("user_id", user.id).maybeSingle(),
    ]);

    const site = siteRes.data;
    const publications = pubsRes.data ?? [];

    // Build target pages list (published pages with URLs)
    const targetPages = publications
      .filter(p => p.wordpress_url)
      .map(p => ({ title: p.title, keyword: p.keyword, url: p.wordpress_url }));

    // Extract cocoon structure for context
    type CocoonCluster = {
      name: string;
      pillar: { title: string; keyword: string; url?: string };
      support_pages: { title: string; keyword: string; url?: string }[];
    };
    const cocoonData = cocoonRes.data?.data as { clusters?: CocoonCluster[] } | null;
    const clusters = cocoonData?.clusters ?? [];

    // Find the cluster this page belongs to
    let clusterContext = "";
    for (const c of clusters) {
      const allKws = [c.pillar?.keyword, ...(c.support_pages?.map(sp => sp.keyword) ?? [])].filter(Boolean);
      if (allKws.some(k => k?.toLowerCase() === keyword.toLowerCase())) {
        const pages = [
          `Pilier: "${c.pillar?.title}" (${c.pillar?.keyword})${c.pillar?.url ? ` → ${c.pillar.url}` : ""}`,
          ...(c.support_pages?.map(sp => `Support: "${sp.title}" (${sp.keyword})${sp.url ? ` → ${sp.url}` : ""}`) ?? []),
        ];
        clusterContext = `\nCluster "${c.name}" :\n${pages.join("\n")}`;
        break;
      }
    }

    // Cocoon positioning outgoing links
    const outgoingLinks = cocoon_positioning?.linking_strategy?.outgoing ?? [];
    const riskLevel = cocoon_positioning?.risk_level ?? "low";
    const pageType = cocoon_positioning?.page_type ?? "support";

    // ── AI Prompt ──────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans), spécialisé dans le maillage interne avancé, le cocon sémantique et l'optimisation on-page.

Ta mission : intégrer un maillage interne intelligent dans un contenu SEO finalisé. Les liens doivent être naturels, stratégiques et invisibles pour l'utilisateur.

LANGUE : ${language}

ARTICLE :
Titre : "${title}"
Mot-clé : "${keyword}"
Type de page : ${pageType}
Rôle SEO : ${cocoon_positioning?.seo_role ?? "non défini"}
Relation pilier : ${cocoon_positioning?.pillar_relation ?? "non défini"}
Risque SEO : ${riskLevel}
Site : ${site?.site_url ?? ""}
${clusterContext}

PAGES DISPONIBLES POUR LE MAILLAGE (publiées avec URL) :
${targetPages.length > 0
  ? targetPages.slice(0, 20).map((p, i) => `${i + 1}. "${p.title}" (${p.keyword}) → ${p.url}`).join("\n")
  : "Aucune page publiée avec URL disponible."}

LIENS SORTANTS RECOMMANDÉS PAR L'ANALYSE STRATÉGIQUE :
${outgoingLinks.length > 0
  ? outgoingLinks.map(l => `- Vers "${l.target}" avec ancre "${l.anchor}" (${l.reason})`).join("\n")
  : "Aucune recommandation spécifique."}

CONTENU HTML À MAILLER :
${content.slice(0, 12000)}

---

ANALYSE ET INSERTION EN 6 PARTIES :

1. ANALYSE DU CONTENU
- Identifie les passages où un lien interne s'intègre naturellement.
- Repère les mentions de sujets couverts par d'autres pages.
- Détecte les opportunités de liens dans les H2, les listes, les exemples.

2. SÉLECTION DES LIENS (3 à 5 maximum)
Priorise dans cet ordre :
- Page pilier du cluster (si cette page est support → lien obligatoire vers pilier).
- Pages recommandées par l'analyse stratégique ci-dessus.
- Pages stratégiques à booster (nouvelles pages, pages mal positionnées).
- Pages complémentaires du même cluster.
${riskLevel === "high" ? "⚠️ Risque élevé : limite à 2-3 liens maximum, très conservateur." : ""}

3. INTÉGRATION NATURELLE
Pour chaque lien :
- Insère le lien DANS une phrase existante (pas de phrase ajoutée juste pour le lien).
- Le lien doit apporter de la valeur au lecteur (pas juste du jus SEO).
- Le contexte autour du lien doit rendre le clic logique et utile.
- Format HTML : <a href="URL">texte d'ancre</a>

4. TEXTES D'ANCRE
- Naturels et variés (pas 2 ancres identiques).
- Jamais le mot-clé exact de la page cible répété (risque de sur-optimisation).
- 2-5 mots par ancre, intégrés dans le flux de la phrase.
- Exemples bons : "découvrir nos solutions de...", "comprendre comment...", "notre guide sur..."
- Exemples mauvais : "cliquez ici", "en savoir plus", mot-clé exact seul.

5. STRATÉGIE COCON
- Support → Pilier : lien obligatoire si pertinent.
- Pages fortes → Pages faibles : transférer le jus SEO.
- Cohérence sémantique : ne linker que des pages thématiquement proches.
- Pas de liens vers des pages d'un cluster complètement différent.

6. CONTRÔLE RISQUE
- Maximum ${riskLevel === "high" ? "2-3" : "3-5"} liens dans l'article.
- Aucun paragraphe avec plus d'1 lien.
- Aucun lien dans l'introduction ou la conclusion (sauf vers le pilier).
- Si une page n'a pas d'URL publiée, NE PAS créer le lien.

CONTRAINTES ABSOLUES :
- NE CHANGE PAS le contenu existant (seulement ajouter des balises <a>).
- NE CHANGE PAS la structure HTML (H2, H3 intacts).
- Les liens doivent pointer vers des URLs RÉELLES de la liste ci-dessus.
- Si aucune page n'est pertinente, retourne le contenu inchangé avec links_added vide.

FORMAT DE SORTIE : JSON uniquement, sans texte avant ou après.

{
  "updated_content": "Le contenu HTML avec les liens <a> insérés naturellement",
  "links_added": [
    {
      "anchor": "Le texte d'ancre utilisé",
      "target": "L'URL complète de la page cible",
      "placement": "Dans quelle section le lien est placé (H2 ou description)",
      "objective": "seo|ux|conversion"
    }
  ]
}`;

    const aiResult = await aiCall(
      { task: "internal_linking" },
      { messages: [{ role: "user", content: prompt }] }
    );

    const linking = parseAiJson<LinkingResult>(aiResult.text);
    if (!linking) {
      return Response.json({ error: "Réponse IA non parseable" }, { status: 500 });
    }

    return Response.json({
      linking,
      keyword,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
