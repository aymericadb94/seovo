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
      photos: { src: { large2x: string }; width: number; height: number; alt: string; photographer: string }[];
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
