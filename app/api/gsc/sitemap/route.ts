import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { submitSitemap } from "@/lib/gsc-indexing";

/**
 * POST /api/gsc/sitemap — soumet le sitemap au GSC manuellement
 * Body optionnel: { sitemap_url?: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("gsc_site_url")
      .eq("user_id", user.id)
      .single();

    if (!site?.gsc_site_url) {
      return Response.json({ error: "GSC non configuré" }, { status: 404 });
    }

    const token = await getValidAccessToken(user.id);
    if (!token) {
      return Response.json({ error: "Google non connecté" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { sitemap_url?: string };
    const result = await submitSitemap(token, site.gsc_site_url, body.sitemap_url);

    return Response.json(result);
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    );
  }
}
