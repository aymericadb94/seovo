/**
 * Shopify OAuth — Step 2: Exchange authorization code for access token
 *
 * Shopify redirects here with: ?code={code}&shop={shop}&state={state}
 * We exchange the code for a permanent access token (shpat_...)
 * Then redirect back to onboarding/settings.
 */

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const stateParam = url.searchParams.get("state");

  if (!code || !shop || !stateParam) {
    return redirectWithError(url.origin, "onboarding", "Paramètres OAuth manquants");
  }

  // Decode state
  let state: { userId: string; storeUrl: string; clientId: string; context: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return redirectWithError(url.origin, "onboarding", "State OAuth invalide");
  }

  // Verify user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) {
    return redirectWithError(url.origin, state.context, "Session expirée. Reconnectez-vous.");
  }

  // Retrieve Client Secret from user metadata (stored temporarily before OAuth redirect)
  const clientSecret = (user.user_metadata as Record<string, string>)?.shopify_pending_secret;
  if (!clientSecret) {
    return redirectWithError(url.origin, state.context, "Client Secret introuvable. Réessayez la connexion.");
  }

  // Exchange authorization code for access token
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: state.clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[shopify/callback] Token exchange failed:", tokenRes.status, errText);
      return redirectWithError(url.origin, state.context, `Échange de token échoué (${tokenRes.status})`);
    }

    const tokenData = await tokenRes.json() as { access_token: string; scope: string };
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return redirectWithError(url.origin, state.context, "Token d'accès vide dans la réponse Shopify");
    }

    // Verify the token works
    const testRes = await fetch(`https://${shop}/admin/api/2025-01/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });

    if (!testRes.ok) {
      return redirectWithError(url.origin, state.context, "Le token obtenu ne fonctionne pas. Vérifiez les permissions.");
    }

    // Store the access token temporarily in user metadata
    // It will be saved to the sites table during onboarding submit or settings save
    await supabase.auth.updateUser({
      data: {
        shopify_pending_token: accessToken,
        shopify_pending_store_url: `https://${shop}`,
        shopify_pending_secret: null, // Clear the secret
      },
    });

    // Redirect back with success
    const redirectTarget = state.context === "settings" ? "/settings" : "/onboarding";
    return Response.redirect(`${url.origin}${redirectTarget}?shopify=success`);
  } catch (err) {
    console.error("[shopify/callback] Error:", err);
    return redirectWithError(url.origin, state.context, "Erreur lors de la connexion Shopify");
  }
}

function redirectWithError(origin: string, context: string, reason: string) {
  const target = context === "settings" ? "/settings" : "/onboarding";
  return Response.redirect(`${origin}${target}?shopify=error&reason=${encodeURIComponent(reason)}`);
}
