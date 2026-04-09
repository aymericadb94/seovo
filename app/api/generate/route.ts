export const maxDuration = 300;

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { runGenerationPipeline, type PipelineResult } from "@/lib/generation-pipeline";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });

    const limited = rateLimit(user.id, { name: "generate", maxRequests: 10, windowSeconds: 600 });
    if (limited) return limited;

    const body = await request.json();
    const { keyword, businessName, industry, language = "fr" } = body;

    if (!keyword) return Response.json({ error: "Mot-clé requis" }, { status: 400 });

    // SSE streaming mode — stream agent progress then final result
    const url = new URL(request.url);
    const isStream = url.searchParams.get("stream") === "1";

    if (isStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const result = await runGenerationPipeline(
              supabase,
              user!.id,
              { keyword, language, business_name: businessName ?? "", industry: industry ?? "e-commerce" },
              (step, agent) => {
                const event = JSON.stringify({ type: "progress", step, agent });
                controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              },
            );

            // Send final result
            const event = JSON.stringify({ type: "done", result: formatResult(result) });
            controller.enqueue(encoder.encode(`data: ${event}\n\n`));
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Erreur inconnue";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // Non-streaming mode
    const result = await runGenerationPipeline(
      supabase,
      user.id,
      { keyword, language, business_name: businessName ?? "", industry: industry ?? "e-commerce" },
    );

    return Response.json(formatResult(result));
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}

function formatResult(result: PipelineResult) {
  return {
    title: result.title,
    content: result.html,
    meta_description: result.meta_description,
    cover_image_query: result.content.pexels_query ?? null,
    cover_alt_text: result.content.cover_alt_text ?? null,
    section_image_queries: result.content.section_image_queries ?? [],
    structured: {
      hero: result.content.hero,
      quick_answer: result.content.quick_answer,
      sections: result.content.sections,
      insights: result.content.insights,
      mistakes: result.content.mistakes,
      faq: result.content.faq,
      cta: { text: result.content.cta ?? "", button_text: "", button_url: null },
      internal_links: result.linking.links.map(l => ({ anchor: l.anchor, target: l.target_url })),
    },
    // Pipeline metadata
    pipeline: {
      intent: result.intent,
      serp: result.serp,
      diff: result.diff,
      structure: result.structure,
      linking: result.linking,
      risk: result.risk,
      ctr: result.ctr,
    },
  };
}
