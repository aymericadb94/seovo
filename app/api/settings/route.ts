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
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
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
    const keywords = typeof body.keywords === "string"
      ? body.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
      : body.keywords;

    const { error } = await supabase
      .from("sites")
      .update({
        business_name: body.business_name,
        industry: body.industry,
        site_url: body.site_url,
        wp_username: body.wp_username || null,
        wp_app_password: body.wp_app_password || null,
        shopify_api_key: body.shopify_api_key || null,
        keywords,
        frequency: body.frequency,
      })
      .eq("user_id", user.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
