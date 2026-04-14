import { generateImage } from "@/lib/image-gen";

export async function GET() {
  const start = Date.now();
  const img = await generateImage("vintage clothing wholesale warehouse");
  const duration = Math.round((Date.now() - start) / 1000);

  if (!img) {
    return Response.json({ ok: false, error: "Aucune image générée — vérifier OPENAI_API_KEY", duration });
  }

  return Response.json({
    ok: true,
    url: img.url,
    alt: img.alt,
    duration: `${duration}s`,
  });
}
