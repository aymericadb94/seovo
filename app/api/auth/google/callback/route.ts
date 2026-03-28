import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.rankpill.fr";
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return Response.redirect(`${appUrl}/settings?gsc=error`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  console.error("[GSC callback] token exchange:", JSON.stringify({ status: tokenRes.status, error: tokens.error, desc: tokens.error_description, hasToken: !!tokens.access_token }));

  if (!tokens.access_token) {
    const reason = encodeURIComponent(tokens.error_description ?? tokens.error ?? "token_exchange_failed");
    return Response.redirect(`${appUrl}/settings?gsc=error&reason=${reason}`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.redirect(`${appUrl}/login`);
  }

  await supabase
    .from("sites")
    .update({
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token ?? null,
      google_token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    })
    .eq("user_id", user.id);

  return Response.redirect(`${appUrl}/settings?gsc=success`);
}
