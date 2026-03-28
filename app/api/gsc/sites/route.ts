import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/google";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const token = await getValidAccessToken(user.id);
    if (!token) return Response.json({ error: "Google non connecté" }, { status: 403 });

    const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return Response.json({ error: "Erreur Google API" }, { status: res.status });

    const data = await res.json() as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
    const sites = (data.siteEntry ?? []).map(s => ({
      url: s.siteUrl,
      permission: s.permissionLevel,
    }));

    return Response.json({ sites });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
