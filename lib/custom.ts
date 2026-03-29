export async function publishToCustomApi(
  apiUrl: string,
  apiKey: string,
  title: string,
  content: string,
  metaDescription: string,
  siteUrl: string
): Promise<string> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ title, content, meta_description: metaDescription }),
  });
  if (!res.ok) throw new Error(`Custom API: ${res.status} — ${await res.text()}`);

  try {
    const data = await res.json() as { url?: string; slug?: string };
    if (data.url) return data.url;
    if (data.slug) return `${siteUrl.replace(/\/$/, "")}/${data.slug}`;
  } catch {
    // Response is not JSON or has no url/slug field
  }
  return siteUrl;
}
