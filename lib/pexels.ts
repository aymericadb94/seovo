export type PexelsImage = {
  url: string;
  width: number;
  height: number;
  alt: string;
  photographer: string;
};

export async function fetchPexelsImage(query: string): Promise<PexelsImage | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.error("[pexels] PEXELS_API_KEY manquante");
    return null;
  }
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: key } }
    );
    if (!res.ok) {
      console.error(`[pexels] ${res.status} pour query="${query}"`);
      return null;
    }
    const data = await res.json() as {
      photos: { src: { large2x: string; large: string; medium: string }; width: number; height: number; alt: string; photographer: string }[];
    };
    const photo = data.photos?.[0];
    if (!photo) {
      console.error(`[pexels] aucun résultat pour query="${query}"`);
      return null;
    }
    console.log(`[pexels] image trouvée pour "${query}": ${photo.src.large2x.slice(0, 80)}`);
    return {
      url: photo.src.large2x,
      width: photo.width,
      height: photo.height,
      alt: photo.alt || query,
      photographer: photo.photographer,
    };
  } catch (err) {
    console.error("[pexels] exception:", err);
    return null;
  }
}

/**
 * Fetch multiple unique Pexels images for different queries.
 * Returns a Map<query, PexelsImage>. Deduplicates results.
 */
export async function fetchPexelsImages(
  queries: string[],
  maxResults: number = 5
): Promise<Map<string, PexelsImage>> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return new Map();

  const uniqueQueries = [...new Set(queries)].slice(0, maxResults);
  const results = new Map<string, PexelsImage>();
  const usedUrls = new Set<string>();

  // Fetch in parallel (max 5 to respect rate limits)
  const fetches = uniqueQueries.map(async (query, idx) => {
    try {
      // Use per_page=3 so we can skip duplicates
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape&page=${idx + 1}`,
        { headers: { Authorization: key } }
      );
      if (!res.ok) return;
      const data = await res.json() as {
        photos: { src: { large2x: string; large: string; medium: string }; width: number; height: number; alt: string; photographer: string }[];
      };
      // Pick first photo not already used
      for (const photo of data.photos ?? []) {
        if (!usedUrls.has(photo.src.large2x)) {
          usedUrls.add(photo.src.large2x);
          results.set(query, {
            url: photo.src.large2x,
            width: photo.width,
            height: photo.height,
            alt: photo.alt || query,
            photographer: photo.photographer,
          });
          break;
        }
      }
    } catch { /* non-fatal */ }
  });

  await Promise.all(fetches);
  return results;
}

/**
 * Inject images into HTML content after H2 headings.
 * Places one image after the first <p> following each targeted H2.
 *
 * @param html       - The article HTML content
 * @param images     - Array of { url, alt } to inject (one per H2 section)
 * @param maxImages  - Maximum number of images to insert (default 3)
 * @returns HTML with <figure> elements injected
 */
export function injectImagesIntoHtml(
  html: string,
  images: { url: string; alt: string }[],
  maxImages: number = 3,
): string {
  if (images.length === 0) return html;

  // Find positions after the first </p> following each </h2>
  const h2Regex = /<\/h2>/gi;
  const insertPositions: number[] = [];
  let match;

  while ((match = h2Regex.exec(html)) !== null) {
    // Find the next </p> after this </h2>
    const afterH2 = html.indexOf("</p>", match.index + match[0].length);
    if (afterH2 !== -1) {
      insertPositions.push(afterH2 + 4); // after </p>
    }
  }

  if (insertPositions.length === 0) return html;

  // Distribute images evenly across sections, skip the first H2 (too close to top)
  const positions = insertPositions.slice(1); // skip first section
  const step = Math.max(1, Math.floor(positions.length / maxImages));
  const selectedPositions: { pos: number; imgIdx: number }[] = [];

  for (let i = 0; i < maxImages && i * step < positions.length; i++) {
    selectedPositions.push({ pos: positions[i * step], imgIdx: i });
  }

  // Insert in reverse order to preserve positions
  let result = html;
  for (let i = selectedPositions.length - 1; i >= 0; i--) {
    const { pos, imgIdx } = selectedPositions[i];
    const img = images[imgIdx % images.length];
    const figure = `\n<figure style="margin:2em 0;text-align:center"><img src="${img.url}" alt="${escapeHtml(img.alt)}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px" /><figcaption style="font-size:0.85em;color:#666;margin-top:0.5em">${escapeHtml(img.alt)}</figcaption></figure>\n`;
    result = result.slice(0, pos) + figure + result.slice(pos);
  }

  return result;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
