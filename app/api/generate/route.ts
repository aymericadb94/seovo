import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { keyword, businessName, industry, allKeywords, language = "fr" } = await request.json();

    const otherKeywords = (allKeywords ?? []).filter((k: string) => k !== keyword).slice(0, 5);
    const internalLinksContext = otherKeywords.length > 0
      ? `\n\nSecondary keywords to mention naturally for internal linking: ${otherKeywords.join(", ")}`
      : "";

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 8000,
      system: `You are the world's best SEO content writer. Every article you produce is unique, creative, and generates real organic traffic. You never produce generic or repetitive content. You always write in the language specified — this is non-negotiable.`,
      messages: [
        {
          role: "user",
          content: `You are a world-class SEO writer specializing in the "${industry ?? "e-commerce"}" sector. You work for "${businessName}".

MISSION: Write an exceptional SEO blog article on the main keyword: "${keyword}"

LANGUAGE: Write the ENTIRE article in ${language}. Every word must be in ${language}.${internalLinksContext}

QUALITY REQUIREMENTS (premium SEO agency level):

1. TITLE (H1): Catchy, contains the keyword, 50-60 characters ideally.

2. META DESCRIPTION: 150-160 characters, compelling, contains the keyword.

3. INTRODUCTION (150-200 words): Strong hook, states the problem or opportunity.

4. ARTICLE BODY (1200-1800 words):
   - 4 to 6 well-structured H2 sections
   - H3 subsections when needed
   - Short paragraphs (3-4 lines max)
   - Concrete examples related to the sector
   - Figures and statistics for credibility
   - Bullet lists for readability
   - Tone: expert but accessible, never robotic
   - Keyword density: natural, 1-2% maximum

5. FAQ SECTION (3-4 questions): Questions the target audience really asks.

6. CONCLUSION (100-150 words): Summary + strong call to action.

RESPONSE FORMAT: Valid JSON only, no text before or after.

{"title": "The optimized H1 title", "meta_description": "The 150-160 character meta description", "content": "The complete HTML content"}

HTML must use: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>. No <html>, <body>, <head>.`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    let parsed: { title: string; content: string; meta_description: string };
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        return Response.json({ error: "Format de réponse invalide de Claude" }, { status: 500 });
      }
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return Response.json({ error: "Impossible de lire la réponse de Claude" }, { status: 500 });
    }
    return Response.json({
      title: parsed.title,
      content: parsed.content,
      meta_description: parsed.meta_description,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
