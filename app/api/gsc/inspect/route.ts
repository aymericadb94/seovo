import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

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

    // Inspect up to 10 URLs (API rate limit)
    const targets = urls.slice(0, 10);

    const results = await Promise.all(
      targets.map(async (url) => {
        try {
          const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inspectionUrl: url, siteUrl: site.gsc_site_url }),
          });
          if (!res.ok) return { url, indexed: null, verdict: "UNKNOWN" };
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
          return { url, indexed: null, verdict: "UNKNOWN" };
        }
      })
    );

    return Response.json({ results });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
