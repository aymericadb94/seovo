/**
 * Génération d'images via DALL-E 3 (OpenAI API)
 * Fallback automatique vers Pexels si DALL-E échoue.
 */

import { fetchPexelsImage, fetchPexelsImages, type PexelsImage } from "@/lib/pexels";

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
    console.warn("[image-gen] OPENAI_API_KEY manquante, fallback Pexels");
    return pexelsFallback(query);
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
      return pexelsFallback(query);
    }

    const data = await res.json() as {
      data: { url: string; revised_prompt?: string }[];
    };

    const img = data.data?.[0];
    if (!img?.url) {
      console.error("[image-gen] aucune image retournée");
      return pexelsFallback(query);
    }

    console.log(`[image-gen] image générée pour "${query}"`);
    return {
      url: img.url,
      alt: query,
    };
  } catch (err) {
    console.error("[image-gen] DALL-E exception:", err);
    return pexelsFallback(query);
  }
}

/**
 * Fallback Pexels
 */
async function pexelsFallback(query: string): Promise<GeneratedImage | null> {
  console.log(`[image-gen] fallback Pexels pour "${query}"`);
  const img = await fetchPexelsImage(query);
  if (!img) return null;
  return { url: img.url, alt: img.alt };
}

/**
 * Génère plusieurs images pour des queries différentes.
 * DALL-E séquentiel, fallback Pexels si échec.
 */
export async function generateImages(
  queries: string[],
  maxResults: number = 3,
): Promise<Map<string, GeneratedImage>> {
  const uniqueQueries = [...new Set(queries)].slice(0, maxResults);
  const results = new Map<string, GeneratedImage>();

  for (const query of uniqueQueries) {
    const img = await generateImage(query, { size: "1792x1024" });
    if (img) {
      results.set(query, img);
    }
  }

  return results;
}
