import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  try {
    const { keyword, businessName, industry, allKeywords } = await request.json();

    const otherKeywords = (allKeywords ?? []).filter((k: string) => k !== keyword).slice(0, 5);
    const internalLinksContext = otherKeywords.length > 0
      ? `\n\nMots-clés secondaires à mentionner naturellement pour le maillage interne : ${otherKeywords.join(", ")}`
      : "";

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      system: `Tu es le meilleur rédacteur SEO francophone au monde. Chaque article que tu produis est unique, créatif, et génère du trafic organique réel. Tu ne produis jamais de contenu générique ou répétitif. Tu penses comme un éditeur de presse spécialisé qui veut captiver son lecteur tout en satisfaisant les algorithmes Google.`,
      messages: [
        {
          role: "user",
          content: `Tu es un rédacteur SEO expert de niveau mondial, spécialisé dans le secteur "${industry ?? "e-commerce"}". Tu travailles pour "${businessName}" — tu connais parfaitement leur audience, leur ton, et leurs objectifs commerciaux.

MISSION : Rédiger un article de blog SEO exceptionnel sur le mot-clé principal : "${keyword}"${internalLinksContext}

EXIGENCES DE QUALITÉ (niveau agence SEO premium) :

1. TITRE (H1) : Accrocheur, contient le mot-clé, donne envie de lire. Entre 50-60 caractères idéalement.

2. MÉTA DESCRIPTION : 150-160 caractères, incitative, contient le mot-clé.

3. INTRODUCTION (150-200 mots) : Accroche forte qui parle directement au lecteur. Pose le problème ou l'opportunité. Annonce ce qu'il va apprendre.

4. CORPS DE L'ARTICLE (1200-1800 mots) :
   - 4 à 6 sections H2 bien structurées
   - Sous-sections H3 quand nécessaire
   - Paragraphes courts et aérés (3-4 lignes max)
   - Exemples concrets liés au secteur
   - Données chiffrées pour crédibiliser
   - Listes à puces pour améliorer la lisibilité
   - Ton : expert mais accessible, jamais robotique
   - Densité de mots-clés : naturelle, 1-2% maximum

5. SECTION FAQ (3-4 questions) : Questions que se pose vraiment l'audience cible.

6. CONCLUSION (100-150 mots) : Résumé des points clés + appel à l'action fort.

FORMAT DE RÉPONSE : JSON valide uniquement, sans texte avant ni après.

{"title": "Le titre H1 optimisé", "meta_description": "La méta description 150-160 caractères", "content": "Le contenu HTML complet"}

Le contenu HTML doit utiliser : <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>. Pas de <html>, <body>, <head>.`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return Response.json({ error: "Format de réponse invalide de Claude" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
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
