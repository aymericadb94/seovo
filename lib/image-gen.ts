/**
 * Génération d'images via DALL-E 3 (OpenAI API)
 *
 * Remplace Pexels pour des images uniques et pertinentes au contenu.
 * Même interface que lib/pexels.ts pour un remplacement transparent.
 */

export type GeneratedImage = {
  url: string;
  alt: string;
};

/**
 * Génère une image via DALL-E 3
 */
export async function generateImage(
  query: string,
  options: { size?: "1024x1024" | "1792x1024" | "1024x1792"; style?: "natural" | "vivid" } = {},
): Promise<GeneratedImage | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error("[image-gen] OPENAI_API_KEY manquante");
    return null;
  }

  const { size = "1792x1024", style = "natural" } = options;

  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Professional blog illustration: ${query}. Clean, modern, editorial style. No text or watermarks.`,
        n: 1,
        size,
        style,
        response_format: "url",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[image-gen] DALL-E error ${res.status}:`, err);
      return null;
    }

    const data = await res.json() as {
      data: { url: string; revised_prompt?: string }[];
    };

    const img = data.data?.[0];
    if (!img?.url) {
      console.error("[image-gen] aucune image retournée");
      return null;
    }

    console.log(`[image-gen] image générée pour "${query}"`);
    return {
      url: img.url,
      alt: query,
    };
  } catch (err) {
    console.error("[image-gen] exception:", err);
    return null;
  }
}

/**
 * Génère plusieurs images pour des queries différentes.
 * Séquentiel pour respecter les rate limits DALL-E.
 */
export async function generateImages(
  queries: string[],
  maxResults: number = 3,
): Promise<Map<string, GeneratedImage>> {
  const uniqueQueries = [...new Set(queries)].slice(0, maxResults);
  const results = new Map<string, GeneratedImage>();

  // Séquentiel pour DALL-E rate limits (5 img/min sur free tier)
  for (const query of uniqueQueries) {
    const img = await generateImage(query, { size: "1792x1024" });
    if (img) {
      results.set(query, img);
    }
  }

  return results;
}
