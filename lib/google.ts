import { createClient } from "@/lib/supabase/server";

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: site } = await supabase
    .from("sites")
    .select("google_access_token, google_refresh_token, google_token_expiry")
    .eq("user_id", userId)
    .single();

  if (!site?.google_access_token) return null;

  // Token still valid (with 60s margin)
  if (site.google_token_expiry && Date.now() < site.google_token_expiry - 60000) {
    return site.google_access_token;
  }

  // Refresh the token
  if (!site.google_refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: site.google_refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await res.json() as { access_token?: string; expires_in?: number };
  if (!tokens.access_token) return null;

  await supabase
    .from("sites")
    .update({
      google_access_token: tokens.access_token,
      google_token_expiry: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    })
    .eq("user_id", userId);

  return tokens.access_token;
}
