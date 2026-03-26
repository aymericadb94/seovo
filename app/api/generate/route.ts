import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { keyword, businessName } = await request.json();

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Tu es un expert SEO. Rédige un article de blog optimisé pour le mot-clé "${keyword}" pour l'entreprise "${businessName}".

L'article doit :
- Avoir un titre accrocheur qui contient le mot-clé
- Faire entre 600 et 800 mots
- Être structuré avec des sous-titres (H2, H3)
- Être rédigé en HTML (balises <h2>, <h3>, <p>, <ul>, <li>)
- Contenir naturellement le mot-clé plusieurs fois
- Finir par un appel à l'action

Réponds UNIQUEMENT avec un JSON valide dans ce format exact, sans texte avant ni après :
{"title": "Le titre de l'article", "content": "<p>Le contenu HTML...</p>"}`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Format de réponse invalide de Claude" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return Response.json({ title: parsed.title, content: parsed.content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    return Response.json({ error: message }, { status: 500 });
  }
}
