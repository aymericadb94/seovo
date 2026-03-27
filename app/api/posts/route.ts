import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return Response.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { data: site } = await supabase
      .from("sites")
      .select("cms, site_url, wp_username, wp_app_password")
      .eq("user_id", user.id)
      .single();

    if (!site) return Response.json({ error: "Site non configuré" }, { status: 404 });
    if (site.cms !== "wordpress") return Response.json({ error: "Disponible uniquement pour WordPress" }, { status: 400 });
    if (!site.wp_username || !site.wp_app_password) return Response.json({ error: "Identifiants WordPress manquants" }, { status: 400 });

    const credentials = Buffer.from(`${site.wp_username}:${site.wp_app_password}`).toString("base64");
    const res = await fetch(`${site.site_url}/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc`, {
      headers: { Authorization: `Basic ${credentials}` },
    });

    if (!res.ok) {
      return Response.json({ error: "Impossible de récupérer les articles WordPress" }, { status: 500 });
    }

    const posts = await res.json();
    const simplified = posts.map((post: {
      id: number;
      title: { rendered: string };
      date: string;
      link: string;
      status: string;
    }) => ({
      id: post.id,
      title: post.title.rendered,
      date: post.date,
      url: post.link,
      status: post.status,
    }));

    return Response.json(simplified);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
