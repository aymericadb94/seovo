import { createClient } from "@/lib/supabase/server";
import { testWixConnection } from "@/lib/wix";
import { testShopifyConnection } from "@/lib/shopify";
import { sendOnboardingRecapEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Validation des champs obligatoires côté serveur
    if (!body.business_name?.trim()) {
      return Response.json({ error: "Le nom de l'entreprise est requis." }, { status: 400 });
    }
    if (!body.industry?.trim()) {
      return Response.json({ error: "Le secteur d'activité est requis." }, { status: 400 });
    }
    if (!body.cms) {
      return Response.json({ error: "Le CMS est requis." }, { status: 400 });
    }
    if (!body.site_url?.trim()) {
      return Response.json({ error: "L'URL du site est requise." }, { status: 400 });
    }

    // Vérifier la connexion avant de sauvegarder
    if (body.cms === "wordpress") {
      try {
        const testRes = await fetch(`${body.site_url}/wp-json/wp/v2/posts?per_page=1`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${body.wp_username}:${body.wp_app_password}`).toString("base64")}`,
            "ngrok-skip-browser-warning": "true",
          },
        });
        if (!testRes.ok) {
          return Response.json({ error: "Connexion WordPress échouée. Vérifiez vos identifiants." }, { status: 400 });
        }
      } catch {
        return Response.json({ error: "Impossible de joindre le site WordPress. Vérifiez l'URL." }, { status: 400 });
      }
    }

    if (body.cms === "shopify") {
      const shopifyStoreUrl = ((body.shopify_store_url || body.site_url) as string).replace(/\/$/, "");
      if (!shopifyStoreUrl.includes(".myshopify.com")) {
        return Response.json({ error: "L'URL Shopify (.myshopify.com) est requise pour la connexion API." }, { status: 400 });
      }

      const result = await testShopifyConnection(shopifyStoreUrl, body.shopify_api_key);
      if (!result.ok) {
        return Response.json({ error: `Connexion Shopify échouée : ${result.reason}` }, { status: 400 });
      }
    }

    let wixMemberId: string | null = null;
    if (body.cms === "wix") {
      const result = await testWixConnection(body.wix_api_key, body.wix_site_id);
      if (!result.ok) {
        return Response.json({ error: `Connexion Wix échouée : ${result.reason}` }, { status: 400 });
      }
      wixMemberId = result.memberId ?? null;
    }

    if (body.cms === "custom") {
      if (!body.custom_api_url) {
        return Response.json({ error: "URL de l'endpoint API manquante." }, { status: 400 });
      }
    }

    // Pick up GSC tokens temporarily stored in user metadata during onboarding OAuth
    const gscTokens = user.user_metadata as {
      gsc_pending_access_token?: string;
      gsc_pending_refresh_token?: string;
      gsc_pending_token_expiry?: number;
    } | null;

    const insertData: Record<string, unknown> = {
      user_id: user.id,
      business_name: body.business_name,
      industry: body.industry,
      cms: body.cms,
      site_url: body.site_url,
      wp_username: body.wp_username || null,
      wp_app_password: body.wp_app_password || null,
      shopify_api_key: body.shopify_api_key || null,
      shopify_store_url: body.shopify_store_url || null,
      wix_api_key: body.wix_api_key || null,
      wix_site_id: body.wix_site_id || null,
      wix_member_id: wixMemberId,
      custom_api_url: body.custom_api_url || null,
      custom_api_key: body.custom_api_key || null,
      keywords: body.keywords,
      frequency: body.frequency,
      gsc_site_url: body.gsc_site_url || null,
      ...(gscTokens?.gsc_pending_access_token ? {
        google_access_token: gscTokens.gsc_pending_access_token,
        google_refresh_token: gscTokens.gsc_pending_refresh_token ?? null,
        google_token_expiry: gscTokens.gsc_pending_token_expiry ?? null,
      } : {}),
    };

    if (body.seo_context) {
      insertData.seo_context = body.seo_context;
    }

    const { error } = await supabase.from("sites").insert(insertData);

    // Clear pending GSC tokens from user metadata (non-fatal)
    if (gscTokens?.gsc_pending_access_token) {
      supabase.auth.updateUser({ data: {
        gsc_pending_access_token: null,
        gsc_pending_refresh_token: null,
        gsc_pending_token_expiry: null,
      } }).catch(() => {});
    }

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Email récap onboarding (non bloquant)
    try {
      if (user.email) {
        await sendOnboardingRecapEmail({
          to: user.email,
          businessName: body.business_name,
          siteUrl: body.site_url,
          cms: body.cms,
          keywords: body.keywords ?? [],
        });
      }
    } catch { /* Email optionnel */ }

    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
