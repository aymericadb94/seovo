export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ ok: false, error: "OPENAI_API_KEY non définie" });
  }

  const start = Date.now();

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: "Professional blog illustration: vintage clothing wholesale warehouse. Clean, modern, editorial style. No text or watermarks.",
        n: 1,
        size: "1024x1024",
        response_format: "url",
      }),
    });

    const duration = Math.round((Date.now() - start) / 1000);
    const body = await res.text();

    if (!res.ok) {
      return Response.json({ ok: false, status: res.status, error: body, duration, keyPrefix: key.slice(0, 8) + "..." });
    }

    const data = JSON.parse(body);
    return Response.json({ ok: true, url: data.data?.[0]?.url, duration: `${duration}s` });
  } catch (err) {
    const duration = Math.round((Date.now() - start) / 1000);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err), duration });
  }
}
