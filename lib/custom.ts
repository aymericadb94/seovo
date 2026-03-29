function normalizeUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `https://${url}`;
}

export async function publishToCustomApi(
  apiUrl: string,
  apiKey: string,
  title: string,
  content: string,
  metaDescription: string,
  siteUrl: string
): Promise<string> {
  const normalizedSiteUrl = normalizeUrl(siteUrl).replace(/\/$/, "");

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
    if (data.url) return normalizeUrl(data.url);
    if (data.slug) {
      const slug = data.slug.startsWith("/") ? data.slug : `/${data.slug}`;
      return `${normalizedSiteUrl}${slug}`;
    }
  } catch {
    // Response is not JSON or has no url/slug field
  }
  return normalizedSiteUrl;
}
