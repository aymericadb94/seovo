import { createClient } from "@/lib/supabase/server";

// Route proxy — appelée par le dashboard, utilise CRON_SECRET côté serveur uniquement
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return Response.json({ error: "CRON_SECRET non configuré" }, { status: 500 });
    }

    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/cron/publish`, {
      headers: { Authorization: `Bearer ${secret}` },
    });

    const json = await res.json();
    return Response.json(json, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
