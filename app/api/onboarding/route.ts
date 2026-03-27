import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
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
      try {
        const baseUrl = (body.site_url as string).replace(/\/$/, "");
        const testRes = await fetch(`${baseUrl}/admin/api/2024-01/shop.json`, {
          headers: {
            "X-Shopify-Access-Token": body.shopify_api_key,
            "Content-Type": "application/json",
          },
        });
        if (!testRes.ok) {
          return Response.json({ error: "Connexion Shopify échouée. Vérifiez l'URL et la clé API." }, { status: 400 });
        }
      } catch {
        return Response.json({ error: "Impossible de joindre la boutique Shopify. Vérifiez l'URL." }, { status: 400 });
      }
    }

    const { error } = await supabase.from("sites").insert({
      user_id: user.id,
      business_name: body.business_name,
      industry: body.industry,
      cms: body.cms,
      site_url: body.site_url,
      wp_username: body.wp_username || null,
      wp_app_password: body.wp_app_password || null,
      shopify_api_key: body.shopify_api_key || null,
      keywords: body.keywords,
      frequency: body.frequency,
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
