/**
 * Shopify OAuth — Step 0: Store client secret temporarily in user metadata
 * Called right before redirecting to Shopify OAuth.
 */

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const { clientSecret } = await request.json();
  if (!clientSecret) return Response.json({ error: "clientSecret requis" }, { status: 400 });

  await supabase.auth.updateUser({
    data: { shopify_pending_secret: clientSecret },
  });

  return Response.json({ ok: true });
}
