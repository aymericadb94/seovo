import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";
import { inspectUrls, type IndexationStatus } from "@/lib/gsc-indexing";

export const maxDuration = 120;

/** GET — return cached indexation results */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data: site } = await supabase
      .from("sites")
      .select("indexation_cache")
      .eq("user_id", user.id)
      .single();

    const cache = site?.indexation_cache as {
      results?: Record<string, IndexationStatus>;
      updated_at?: string;
    } | null;

    return Response.json({
      results: cache?.results ?? null,
      updated_at: cache?.updated_at ?? null,
    });
  } catch {
    return Response.json({ results: null });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { urls } = await request.json() as { urls: string[] };

    const { data: site } = await supabase
      .from("sites")
      .select("gsc_site_url")
      .eq("user_id", user.id)
      .single();

    if (!site?.gsc_site_url) return Response.json({ error: "GSC non configuré" }, { status: 404 });

    const token = await getValidAccessToken(user.id);
    if (!token) return Response.json({ error: "Google non connecté" }, { status: 403 });

    // Utiliser la lib centralisée (batches de 5, données enrichies)
    const allResults = await inspectUrls(token, site.gsc_site_url, urls);

    // Merge with existing cache (don't overwrite auto-check results)
    const { data: existingSite } = await supabase
      .from("sites")
      .select("indexation_cache")
      .eq("user_id", user.id)
      .single();
    const existingCache = (existingSite?.indexation_cache as { results?: Record<string, IndexationStatus> } | null)?.results ?? {};
    const mergedResults: Record<string, IndexationStatus> = { ...existingCache };
    for (const r of allResults) mergedResults[r.url] = r;

    await supabase
      .from("sites")
      .update({
        indexation_cache: {
          results: mergedResults,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("user_id", user.id);

    return Response.json({ results: allResults });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
