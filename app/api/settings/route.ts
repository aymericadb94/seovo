import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const { data, error } = await supabase
      .from("sites")
      .select("*")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Aucun site configuré" }, { status: 404 });
    return Response.json({
      ...data,
      gsc_connected: !!data.google_access_token,
      // Never expose tokens to client
      google_access_token: undefined,
      google_refresh_token: undefined,
      google_token_expiry: undefined,
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const body = await request.json();

    // Mise à jour partielle — si seul gsc_site_url est envoyé, on ne touche qu'à ce champ
    if (Object.keys(body).length === 1 && "gsc_site_url" in body) {
      const { error } = await supabase
        .from("sites")
        .update({ gsc_site_url: body.gsc_site_url || null })
        .eq("user_id", user.id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ success: true });
    }

    const keywords = typeof body.keywords === "string"
      ? body.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
      : body.keywords;

    const target_languages = Array.isArray(body.target_languages) && body.target_languages.length > 0
      ? body.target_languages
      : ["fr"];

    const { error } = await supabase
      .from("sites")
      .update({
        business_name: body.business_name,
        industry: body.industry,
        site_url: body.site_url,
        wp_username: body.wp_username || null,
        wp_app_password: body.wp_app_password || null,
        shopify_api_key: body.shopify_api_key || null,
        wix_api_key: body.wix_api_key || null,
        wix_site_id: body.wix_site_id || null,
        custom_api_url: body.custom_api_url || null,
        custom_api_key: body.custom_api_key || null,
        gsc_site_url: body.gsc_site_url || null,
        keywords,
        frequency: body.frequency,
        target_languages,
      })
      .eq("user_id", user.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
