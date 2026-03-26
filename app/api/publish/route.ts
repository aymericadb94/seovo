export async function POST(request: Request) {
  try {
    const { title, content } = await request.json();

    const wpUrl = process.env.WORDPRESS_URL;
    const username = process.env.WORDPRESS_USERNAME;
    const appPassword = process.env.WORDPRESS_APP_PASSWORD;

    const credentials = Buffer.from(`${username}:${appPassword}`).toString("base64");

    const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        title,
        content,
        status: "publish",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error: `WordPress a refusé la publication : ${error}` }, { status: 500 });
    }

    const post = await res.json();
    return Response.json({ url: post.link, id: post.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
