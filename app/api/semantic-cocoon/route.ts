import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 180;

/* ── GET — retourner le cocon en cache ──────────────────────────────────────── */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: record, error } = await supabase
      .from("semantic_cocoons")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error && error.code === "PGRST205") {
      return Response.json({ result: null, tableNotReady: true });
    }

    return Response.json({ result: record ?? null });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

/* ── POST — générer le cocon sémantique via Claude ──────────────────────────── */

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    // ── Récupérer le site ─────────────────────────────────────────────────────
    const { data: site } = await supabase
      .from("sites")
      .select("business_name, industry, site_url, keywords, seo_context, google_access_token, gsc_site_url")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!site) return Response.json({ error: "Site introuvable" }, { status: 404 });

    // ── Récupérer les publications existantes ─────────────────────────────────
    const { data: pubs } = await supabase
      .from("publications")
      .select("id, title, keyword, wordpress_url, published_at")
      .eq("user_id", user.id)
      .order("published_at", { ascending: false });

    const articles = pubs ?? [];

    // ── Récupérer la roadmap ──────────────────────────────────────────────────
    const { data: roadmapRec } = await supabase
      .from("roadmaps")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();

    type RoadmapArticle = { title: string; keyword: string; role: string; phase?: number };
    const roadmapArticles: RoadmapArticle[] =
      (roadmapRec?.data as { articles?: RoadmapArticle[] } | null)?.articles?.slice(0, 40) ?? [];

    // ── Récupérer les données GSC ─────────────────────────────────────────────
    type GscRow = { query: string; clicks: number; impressions: number; position: number };
    let gscQueries: GscRow[] = [];

    if (site.google_access_token && site.gsc_site_url) {
      try {
        const token = await getValidAccessToken(user.id);
        if (token) {
          const now = new Date();
          const endDate = new Date(now); endDate.setDate(endDate.getDate() - 2);
          const startDate = new Date(now); startDate.setDate(startDate.getDate() - 90);
          const fmt = (d: Date) => d.toISOString().split("T")[0];

          const res = await fetch(
            `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.gsc_site_url)}/searchAnalytics/query`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                startDate: fmt(startDate),
                endDate: fmt(endDate),
                dimensions: ["query"],
                rowLimit: 500,
              }),
            }
          );

          if (res.ok) {
            type Row = { keys: string[]; clicks: number; impressions: number; position: number };
            const data = await res.json() as { rows?: Row[] };
            gscQueries = (data.rows ?? []).map((r) => ({
              query: r.keys[0],
              clicks: r.clicks,
              impressions: r.impressions,
              position: Math.round(r.position * 10) / 10,
            }));
          }
        }
      } catch { /* GSC non-fatal */ }
    }

    // ── Construire le contexte ────────────────────────────────────────────────
    const seoCtx = (site.seo_context ?? {}) as Record<string, unknown>;
    const keywords = (site.keywords ?? []).join(", ") || "non configurés";

    const existingPagesCtx = articles.length > 0
      ? articles.map((a, i) =>
          `${i + 1}. "${a.title}" — mot-clé: "${a.keyword}" — URL: ${a.wordpress_url ?? "/article-" + a.id}`
        ).join("\n")
      : "Aucun article publié";

    const roadmapCtx = roadmapArticles.length > 0
      ? roadmapArticles.map((a, i) =>
          `${i + 1}. "${a.title}" (${a.keyword}) — rôle: ${a.role}`
        ).join("\n")
      : "Aucune roadmap générée";

    const gscCtx = gscQueries.length > 0
      ? gscQueries.slice(0, 200).map((q, i) =>
          `${i + 1}. "${q.query}" — ${q.clicks} clics, ${q.impressions} impressions, pos. ${q.position}`
        ).join("\n")
      : "Pas de données GSC (non connecté ou pas de données)";

    const intentCtx = [
      seoCtx.objective && `Objectif: ${seoCtx.objective}`,
      seoCtx.main_offer && `Offre: ${seoCtx.main_offer}`,
      seoCtx.target_customer && `Cible: ${seoCtx.target_customer}`,
      seoCtx.geography && `Zone: ${seoCtx.geography}`,
      Array.isArray(seoCtx.competitors) && (seoCtx.competitors as string[]).length > 0
        && `Concurrents: ${(seoCtx.competitors as string[]).join(", ")}`,
    ].filter(Boolean).join("\n") || "Non renseigné";

    // ── Prompt Claude ─────────────────────────────────────────────────────────
    const prompt = `Tu es un expert SEO senior (10+ ans) spécialisé dans les cocons sémantiques avancés, l'architecture SEO et la distribution du PageRank interne.

DATE ACTUELLE : ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
ANNÉE EN COURS : ${new Date().getFullYear()} (utilise TOUJOURS cette année si un mot-clé ou titre contient une année)

SITE : ${site.business_name}
SECTEUR : ${site.industry}
URL : ${site.site_url}
MOTS-CLÉS CONFIGURÉS : ${keywords}

INTENTION STRATÉGIQUE :
${intentCtx}

DONNÉES GOOGLE SEARCH CONSOLE (90 derniers jours) :
${gscCtx}

PAGES EXISTANTES (articles publiés) :
${existingPagesCtx}

ROADMAP SEO (articles planifiés) :
${roadmapCtx}

---

MISSION : Analyse toutes ces données et conçois un cocon sémantique intelligent et complet.

ÉTAPES :

1. ANALYSE GLOBALE
- Identifie les clusters de mots-clés dans les données GSC
- Détecte les pages fortes, faibles et les trous de contenu
- Évalue la maturité SEO actuelle du site

2. CLUSTERISATION
- Regroupe les mots-clés par intention de recherche et thématique
- Chaque cluster a un objectif SEO, un potentiel de trafic estimé, une priorité

3. STRUCTURE DU COCON
Pour chaque cluster :
- 1 page pilier (mot-clé stratégique principal)
- Pages support (sous-thématiques complémentaires)
- Relations / liens internes obligatoires entre les pages

4. MAPPING SITE
- Mappe chaque page existante dans le cocon
- Identifie les pages à créer vs existantes
- Détecte les pages orphelines ou inutiles

5. MAILLAGE INTERNE
- Liens sortants et entrants pour chaque page
- Pages support → page pilier
- Circulation optimale du jus SEO
- Max 3-5 liens par page, ancres naturelles

6. ESTIMATION DE PERFORMANCE
- Potentiel de trafic par cluster
- Gains SEO estimés sur 6 mois

7. INTELLIGENCE SEO
- Clusters incomplets à renforcer
- Pages manquantes critiques
- Incohérences détectées
- Opportunités de quick wins

CONTRAINTES :
- Pas de sur-optimisation
- Pas de contenu inutile ou dupliqué
- Qualité > quantité
- Penser comme un expert SEO humain senior

FORMAT DE RÉPONSE : JSON valide uniquement, aucun texte avant ou après.

{
  "score": <number 0-100, score de maturité du cocon actuel>,
  "score_label": "Inexistant|Faible|Moyen|Bon|Excellent",
  "diagnosis": "Diagnostic en 2-3 phrases du cocon actuel",
  "clusters": [
    {
      "name": "Nom du cluster thématique",
      "objective": "Objectif SEO du cluster en 1 phrase",
      "priority": "haute|moyenne|faible",
      "traffic_potential": <number, clics/mois estimés>,
      "pillar": {
        "title": "Titre de la page pilier",
        "keyword": "mot-clé principal",
        "status": "existing|to_create",
        "url": "URL si existante, sinon suggestion de slug"
      },
      "support_pages": [
        {
          "title": "Titre page support",
          "keyword": "mot-clé",
          "status": "existing|to_create",
          "url": "URL ou slug suggéré"
        }
      ],
      "internal_links": [
        {
          "from": "Titre page source",
          "to": "Titre page cible",
          "anchor": "Texte d'ancre naturel",
          "direction": "support_to_pillar|pillar_to_support|cross_cluster"
        }
      ]
    }
  ],
  "orphan_pages": [
    {
      "title": "Titre de la page orpheline",
      "url": "URL",
      "recommendation": "Rattacher au cluster X | Supprimer | Rediriger"
    }
  ],
  "missing_pages": [
    {
      "title": "Titre de la page manquante critique",
      "keyword": "mot-clé cible",
      "cluster": "Nom du cluster",
      "priority": "haute|moyenne",
      "reason": "Pourquoi cette page est critique"
    }
  ],
  "optimization_actions": [
    {
      "action": "Description de l'action",
      "impact": "fort|moyen|faible",
      "effort": "facile|moyen|difficile",
      "cluster": "Cluster concerné ou 'global'"
    }
  ],
  "traffic_potential": {
    "current_estimated": <number, trafic organique estimé actuel>,
    "potential_6_months": <number, trafic estimé après implémentation du cocon>,
    "growth_percentage": <number, % de croissance estimé>
  }
}`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    // Nettoyer : retirer les blocs markdown ```json ... ```
    const cleaned = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("[semantic-cocoon] Pas de JSON trouvé. Début de la réponse:", rawText.slice(0, 300));
      return Response.json({ error: "Réponse Claude invalide" }, { status: 500 });
    }

    let result: unknown;
    try {
      result = JSON.parse(cleaned.slice(start, end + 1));
    } catch (parseErr) {
      console.error("[semantic-cocoon] JSON parse error:", parseErr, "Extrait:", cleaned.slice(start, start + 200));
      // Tentative de réparation : supprimer les trailing commas
      try {
        const repaired = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
        result = JSON.parse(repaired);
      } catch {
        return Response.json({ error: "Réponse Claude non parseable" }, { status: 500 });
      }
    }

    // ── Sauvegarder (upsert) ──────────────────────────────────────────────────
    try {
      await supabase
        .from("semantic_cocoons")
        .upsert(
          { user_id: user.id, data: result, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch { /* table pas encore créée — non bloquant */ }

    return Response.json({ result });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
