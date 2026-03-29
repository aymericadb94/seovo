import { createClient } from "@/lib/supabase/server";
import { sendPasswordChangedEmail } from "@/lib/email";

export async function PATCH(request: Request) {
  try {
    const { password } = await request.json() as { password: string };

    if (!password || password.length < 8) {
      return Response.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    // Email de confirmation (non bloquant)
    try {
      if (user.email) {
        await sendPasswordChangedEmail({ to: user.email });
      }
    } catch { /* Email optionnel */ }

    return Response.json({ success: true });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur inconnue" }, { status: 500 });
  }
}
