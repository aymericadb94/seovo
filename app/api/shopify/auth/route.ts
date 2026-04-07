/**
 * Shopify OAuth — Step 1: Redirect user to Shopify for authorization
 *
 * Query params: shopifyStoreUrl, clientId, scopes (optional)
 * Redirects to: https://{store}.myshopify.com/admin/oauth/authorize?...
 */

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

  const url = new URL(request.url);
  const storeUrl = url.searchParams.get("shopifyStoreUrl")?.replace(/\/$/, "") || "";
  const clientId = url.searchParams.get("clientId") || "";
  const context = url.searchParams.get("context") || "onboarding"; // "onboarding" | "settings"

  if (!storeUrl || !clientId) {
    return Response.json({ error: "shopifyStoreUrl et clientId requis" }, { status: 400 });
  }

  if (!storeUrl.includes(".myshopify.com")) {
    return Response.json({ error: "L'URL doit être au format https://nom.myshopify.com" }, { status: 400 });
  }

  const scopes = "read_content,write_content";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const redirectUri = `${baseUrl}/api/shopify/callback`;

  // Store state in a nonce to prevent CSRF
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    storeUrl,
    clientId,
    context,
    ts: Date.now(),
  })).toString("base64url");

  const authUrl = `${storeUrl}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return Response.redirect(authUrl);
}
