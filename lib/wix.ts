// ─── Types Ricos (format natif Wix) ──────────────────────────────────────────

type Decoration = { type: "BOLD" } | { type: "ITALIC" };

type TextNode = {
  type: "TEXT";
  id: string;
  nodes: [];
  textData: { text: string; decorations: Decoration[] };
};

type ParagraphNode = {
  type: "PARAGRAPH";
  id: string;
  nodes: TextNode[];
  paragraphData: Record<string, unknown>;
};

type HeadingNode = {
  type: "HEADING";
  id: string;
  nodes: TextNode[];
  headingData: { level: number };
};

type ListItemNode = {
  type: "LIST_ITEM";
  id: string;
  nodes: ParagraphNode[];
};

type ListNode = {
  type: "BULLETED_LIST" | "ORDERED_LIST";
  id: string;
  nodes: ListItemNode[];
};

type RicosNode = ParagraphNode | HeadingNode | ListNode;

// ─── Convertisseur HTML → Ricos ───────────────────────────────────────────────

let _idCounter = 0;
function genId() {
  return `n${++_idCounter}`;
}

function parseInline(html: string): TextNode[] {
  const clean = html.replace(/<br\s*\/?>/gi, " ");
  const segments = clean.split(/(<strong>[\s\S]*?<\/strong>|<em>[\s\S]*?<\/em>)/);
  const result: TextNode[] = [];

  for (const seg of segments) {
    if (!seg) continue;
    const boldMatch = seg.match(/^<strong>([\s\S]*?)<\/strong>$/);
    const italicMatch = seg.match(/^<em>([\s\S]*?)<\/em>$/);
    const inner = boldMatch?.[1] ?? italicMatch?.[1] ?? seg;
    const text = inner.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
    if (!text) continue;
    result.push({
      type: "TEXT",
      id: "",
      nodes: [],
      textData: {
        text,
        decorations: boldMatch ? [{ type: "BOLD" }] : italicMatch ? [{ type: "ITALIC" }] : [],
      },
    });
  }

  return result.length > 0 ? result : [{ type: "TEXT", id: "", nodes: [], textData: { text: " ", decorations: [] } }];
}

function makeParagraph(html: string): ParagraphNode {
  return { type: "PARAGRAPH", id: genId(), nodes: parseInline(html), paragraphData: {} };
}

function makeHeading(html: string, level: number): HeadingNode {
  return { type: "HEADING", id: genId(), nodes: parseInline(html), headingData: { level } };
}

function makeList(html: string, ordered: boolean): ListNode {
  const items: ListItemNode[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRegex.exec(html)) !== null) {
    items.push({
      type: "LIST_ITEM",
      id: genId(),
      nodes: [makeParagraph(m[1])],
    });
  }
  return {
    type: ordered ? "ORDERED_LIST" : "BULLETED_LIST",
    id: genId(),
    nodes: items,
  };
}

export function htmlToRicos(html: string): object {
  _idCounter = 0;
  const nodes: RicosNode[] = [];
  const blockRegex = /<(h2|h3|h4|p|ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[3].trim();
    if (tag === "h2") nodes.push(makeHeading(inner, 2));
    else if (tag === "h3") nodes.push(makeHeading(inner, 3));
    else if (tag === "h4") nodes.push(makeHeading(inner, 4));
    else if (tag === "p") nodes.push(makeParagraph(inner));
    else if (tag === "ul") nodes.push(makeList(inner, false));
    else if (tag === "ol") nodes.push(makeList(inner, true));
  }

  if (nodes.length === 0) {
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    nodes.push(makeParagraph(text));
  }

  return {
    nodes,
    metadata: {
      version: 1,
      createdTimestamp: new Date().toISOString(),
      id: genId(),
    },
  };
}

// ─── Publication Wix ──────────────────────────────────────────────────────────

const WIX_API = "https://www.wixapis.com/blog/v3/posts";

function wixHeaders(apiKey: string, siteId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: apiKey,
    "wix-site-id": siteId,
  };
}

export async function publishToWix(
  apiKey: string,
  siteId: string,
  title: string,
  content: string,
  metaDescription: string
): Promise<string> {
  const richContent = htmlToRicos(content);

  const res = await fetch(WIX_API, {
    method: "POST",
    headers: wixHeaders(apiKey, siteId),
    body: JSON.stringify({
      post: {
        title,
        richContent,
        excerpt: metaDescription,
        status: "PUBLISHED",
      },
    }),
  });

  if (!res.ok) throw new Error(`Wix: ${await res.text()}`);
  const data = await res.json() as { post: { id: string; slug: string } };
  return `https://www.wix.com/blog/${data.post?.slug ?? data.post?.id}`;
}

// ─── Analyse DA Wix ───────────────────────────────────────────────────────────

export async function analyzeWixSite(apiKey: string, siteId: string) {
  try {
    const res = await fetch(`${WIX_API}?limit=5`, {
      headers: wixHeaders(apiKey, siteId),
    });
    if (!res.ok) return { existingTitles: [], styleGuide: "" };

    const data = await res.json() as { posts: { title: string; richContent?: { nodes: { textData?: { text: string } }[] } }[] };
    const posts = data.posts ?? [];

    const existingTitles = posts.map((p) => p.title);
    return { existingTitles, styleGuide: "" }; // DA Wix : pas de HTML accessible facilement
  } catch {
    return { existingTitles: [], styleGuide: "" };
  }
}

// ─── Test de connexion Wix ────────────────────────────────────────────────────

export async function testWixConnection(apiKey: string, siteId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(`${WIX_API}?limit=1`, {
      headers: wixHeaders(apiKey, siteId),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "Clé API invalide ou Site ID incorrect" };
    if (res.status === 404) return { ok: false, reason: "Site Wix introuvable — vérifiez le Site ID" };
    return { ok: false, reason: `Erreur ${res.status}` };
  } catch {
    return { ok: false, reason: "Impossible de joindre l'API Wix" };
  }
}
