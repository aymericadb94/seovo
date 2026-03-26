export async function GET() {
  try {
    const wpUrl = process.env.WORDPRESS_URL;
    const username = process.env.WORDPRESS_USERNAME;
    const appPassword = process.env.WORDPRESS_APP_PASSWORD;

    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");

    const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts?per_page=100&orderby=date&order=desc`, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!res.ok) {
      return Response.json({ error: "Impossible de récupérer les articles" }, { status: 500 });
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
