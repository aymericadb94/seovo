import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

export const maxDuration = 120;

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

    // Process ALL URLs in batches of 5 to respect rate limits
    const BATCH_SIZE = 5;
    const allResults: { url: string; indexed: boolean | null; verdict: string; coverage: string }[] = [];

    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (url) => {
          try {
            const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ inspectionUrl: url, siteUrl: site.gsc_site_url }),
            });
            if (!res.ok) return { url, indexed: null, verdict: "UNKNOWN", coverage: "—" };
            const data = await res.json() as {
              inspectionResult?: {
                indexStatusResult?: { verdict: string; coverageState: string };
              };
            };
            const verdict = data.inspectionResult?.indexStatusResult?.verdict ?? "UNKNOWN";
            return {
              url,
              indexed: verdict === "PASS",
              verdict,
              coverage: data.inspectionResult?.indexStatusResult?.coverageState ?? "—",
            };
          } catch {
            return { url, indexed: null, verdict: "UNKNOWN", coverage: "—" };
          }
        })
      );

      allResults.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    return Response.json({ results: allResults });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
