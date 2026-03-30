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

type TableCellNode = {
  type: "TABLE_CELL";
  id: string;
  nodes: ParagraphNode[];
  tableCellData: { cellStyle: { verticalAlignment: string }; borderColors: Record<string, string> };
};

type TableRowNode = {
  type: "TABLE_ROW";
  id: string;
  nodes: TableCellNode[];
};

type TableNode = {
  type: "TABLE";
  id: string;
  nodes: TableRowNode[];
  tableData: { dimensions: { colsWidthRatio: number[]; rowsHeight: number[] } };
};

type RicosNode = ParagraphNode | HeadingNode | ListNode | TableNode;

// ─── Convertisseur HTML → Ricos ───────────────────────────────────────────────

let _idCounter = 0;
function genId() {
  return `n${++_idCounter}`;
}

function parseInline(html: string): TextNode[] {
  const clean = html.replace(/<br\s*\/?>/gi, " ");
  // Support <strong> with attributes (e.g. <strong class="...">)
  const segments = clean.split(/(<strong[^>]*>[\s\S]*?<\/strong>|<em[^>]*>[\s\S]*?<\/em>)/);
  const result: TextNode[] = [];

  for (const seg of segments) {
    if (!seg) continue;
    const boldMatch = seg.match(/^<strong[^>]*>([\s\S]*?)<\/strong>$/);
    const italicMatch = seg.match(/^<em[^>]*>([\s\S]*?)<\/em>$/);
    const inner = boldMatch?.[1] ?? italicMatch?.[1] ?? seg;
    // Preserve spaces — don't trim, only skip purely empty nodes
    const text = inner
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, "\u00a0");
    if (!text.trim()) continue;
    result.push({
      type: "TEXT",
      id: "",
      nodes: [],
      textData: {
        text, // spaces preserved
        decorations: boldMatch ? [{ type: "BOLD" }] : italicMatch ? [{ type: "ITALIC" }] : [],
      },
    });
  }

  return result.length > 0 ? result : [{ type: "TEXT", id: "", nodes: [], textData: { text: " ", decorations: [] } }];
}

function makeParagraph(html: string): ParagraphNode {
  return {
    type: "PARAGRAPH",
    id: genId(),
    nodes: parseInline(html),
    paragraphData: { textStyle: { lineHeight: "1.8" } },
  };
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

function makeTable(html: string): TableNode {
  const rows: TableRowNode[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells: TableCellNode[] = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push({
        type: "TABLE_CELL",
        id: genId(),
        nodes: [makeParagraph(cellMatch[1])],
        tableCellData: {
          cellStyle: { verticalAlignment: "TOP" },
          borderColors: {},
        },
      });
    }
    if (cells.length > 0) {
      rows.push({ type: "TABLE_ROW", id: genId(), nodes: cells });
    }
  }
  const colCount = rows[0]?.nodes.length ?? 1;
  return {
    type: "TABLE",
    id: genId(),
    nodes: rows,
    tableData: {
      dimensions: {
        colsWidthRatio: Array(colCount).fill(1),
        rowsHeight: Array(rows.length).fill(44),
      },
    },
  };
}

export function htmlToRicos(html: string): object {
  _idCounter = 0;
  const nodes: RicosNode[] = [];

  // Tables first (before generic block regex since they span multiple lines with nested tags)
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tables: { index: number; length: number; node: TableNode }[] = [];
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    tables.push({
      index: tableMatch.index,
      length: tableMatch[0].length,
      node: makeTable(tableMatch[1]),
    });
  }

  // Remove tables from html before processing blocks
  let htmlWithoutTables = html;
  for (const t of [...tables].reverse()) {
    htmlWithoutTables = htmlWithoutTables.slice(0, t.index) + `<TABLE_PLACEHOLDER_${tables.indexOf(t)}>` + htmlWithoutTables.slice(t.index + t.length);
  }

  const blockRegex = /<(h2|h3|h4|p|ul|ol)([^>]*)>([\s\S]*?)<\/\1>|<TABLE_PLACEHOLDER_(\d+)>/gi;
  let match;

  while ((match = blockRegex.exec(htmlWithoutTables)) !== null) {
    if (match[4] !== undefined) {
      // Table placeholder
      nodes.push(tables[parseInt(match[4])].node);
      continue;
    }
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

const WIX_POSTS_API = "https://www.wixapis.com/blog/v3/posts";
const WIX_DRAFTS_API = "https://www.wixapis.com/blog/v3/draft-posts";

function wixHeaders(apiKey: string, siteId: string) {
  return {
    "Content-Type": "application/json",
    Authorization: apiKey,
    "wix-site-id": siteId,
  };
}

// ─── Image cover via Pexels ───────────────────────────────────────────────────

import { fetchPexelsImage } from "@/lib/pexels";

async function importImageToWix(
  apiKey: string,
  siteId: string,
  imageUrl: string,
  displayName: string
): Promise<{ id: string; url: string; width: number; height: number } | null> {
  try {
    const res = await fetch("https://www.wixapis.com/site-media/v1/files/import", {
      method: "POST",
      headers: wixHeaders(apiKey, siteId),
      body: JSON.stringify({
        url: imageUrl,
        displayName: displayName.slice(0, 60),
        mimeType: "image/jpeg",
        mediaType: "IMAGE",
      }),
    });
    const rawBody = await res.text();
    if (!res.ok) {
      console.error(`[wix/importImage] ${res.status}: ${rawBody.slice(0, 300)}`);
      return null;
    }
    console.log("[wix/importImage] response:", rawBody.slice(0, 600));
    const data = JSON.parse(rawBody) as {
      file?: {
        id?: string;
        url?: string; // wix:image://v1/... scheme
        internalTags?: Record<string, string>[];
      };
    };
    const fileId = data.file?.id;
    if (!fileId) {
      console.error("[wix/importImage] no file.id in response");
      return null;
    }
    return {
      id: fileId,
      url: data.file?.url ?? imageUrl,
      width: 1200,
      height: 630,
    };
  } catch (err) {
    console.error("[wix/importImage] exception:", err);
    return null;
  }
}

// ─── Résolution memberId ──────────────────────────────────────────────────────

async function getWixMemberId(apiKey: string, siteId: string): Promise<string | null> {
  // Stratégie 1 : lire le memberId depuis un post existant
  try {
    const res = await fetch(`${WIX_POSTS_API}?limit=1`, {
      headers: wixHeaders(apiKey, siteId),
    });
    if (res.ok) {
      const data = await res.json() as { posts?: { memberId?: string }[] };
      const id = data.posts?.[0]?.memberId;
      if (id) return id;
    }
  } catch { /* fallback */ }

  // Stratégie 2 : le membre le plus ancien = l'owner du site
  try {
    const res = await fetch("https://www.wixapis.com/members/v1/members/query", {
      method: "POST",
      headers: wixHeaders(apiKey, siteId),
      body: JSON.stringify({
        query: {
          sort: [{ fieldName: "createdDate", order: "ASC" }],
          paging: { limit: 1 },
          fieldsets: ["FULL"],
        },
      }),
    });
    if (res.ok) {
      const data = await res.json() as { members?: { id?: string }[] };
      const id = data.members?.[0]?.id;
      if (id) return id;
    }
  } catch { /* fallback */ }

  return null;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

export async function publishToWix(
  apiKey: string,
  siteId: string,
  title: string,
  content: string,
  metaDescription: string,
  siteUrl?: string,
  storedMemberId?: string | null,
  imageQuery?: string | null,
  imageAlt?: string | null
): Promise<string> {
  const richContent = htmlToRicos(content);
  const headers = wixHeaders(apiKey, siteId);

  // Utiliser le memberId stocké en base, ou le résoudre dynamiquement en fallback
  const memberId = storedMemberId || await getWixMemberId(apiKey, siteId);
  if (!memberId) {
    throw new Error("Impossible de récupérer l'identifiant du propriétaire du site Wix. Vérifiez que votre clé API a les permissions 'Membres' en lecture, ou publiez au moins un article manuellement sur votre blog Wix.");
  }

  // Image de couverture (optionnelle)
  let mediaData: Record<string, unknown> | undefined;
  if (imageQuery) {
    console.log(`[wix/cover] recherche Pexels: "${imageQuery}"`);
    const pexelsImg = await fetchPexelsImage(imageQuery);
    if (pexelsImg) {
      console.log("[wix/cover] import vers Wix Media...");
      const wixImg = await importImageToWix(apiKey, siteId, pexelsImg.url, imageAlt || title);
      if (wixImg) {
        console.log(`[wix/cover] image importée: id=${wixImg.id}`);
        mediaData = {
          wixMedia: {
            image: {
              imageInfo: {
                id: wixImg.id,
                url: wixImg.url,
                height: wixImg.height,
                width: wixImg.width,
                altText: imageAlt || title,
              },
            },
          },
          displayed: true,
        };
      } else {
        console.error("[wix/cover] import Wix Media échoué");
      }
    }
  }

  // Slug généré côté RankPill — garanti lisible, utilisé comme fallback
  const seoSlug = generateSlug(title);

  // Étape 1 : créer le brouillon
  const createRes = await fetch(WIX_DRAFTS_API, {
    method: "POST",
    headers,
    body: JSON.stringify({
      draftPost: {
        title,
        richContent,
        excerpt: metaDescription,
        memberId,
        seoSlug,
        ...(mediaData ? { media: mediaData } : {}),
        seoData: {
          tags: [
            { type: "title", children: title },
            { type: "meta", props: { name: "description", content: metaDescription } },
            ...(imageAlt ? [{ type: "meta", props: { property: "og:image:alt", content: imageAlt } }] : []),
          ],
        },
      },
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    if (createRes.status === 404) {
      throw new Error("Site ID Wix invalide — vérifiez le Site ID dans le dashboard Wix : manage.wix.com/account/api-keys");
    }
    if (createRes.status === 401 || createRes.status === 403) {
      throw new Error("Clé API Wix invalide ou permissions insuffisantes — vérifiez les permissions Blog (lecture + écriture)");
    }
    throw new Error(`Wix création (${createRes.status}): ${body || "réponse vide"}`);
  }

  const createData = await createRes.json() as { draftPost: { id: string; seoSlug?: string } };
  const draftId = createData.draftPost?.id;
  if (!draftId) throw new Error("Wix: ID du brouillon introuvable dans la réponse");

  // Étape 2 : publier le brouillon
  const publishRes = await fetch(`${WIX_DRAFTS_API}/${draftId}/publish`, {
    method: "POST",
    headers,
  });

  if (!publishRes.ok) {
    const body = await publishRes.text();
    throw new Error(`Wix publication (${publishRes.status}): ${body || "réponse vide"}`);
  }

  const publishData = await publishRes.json() as {
    post?: { id: string; slug?: string; url?: { base: string; path: string } };
  };

  // Utiliser l'URL complète retournée par Wix
  if (publishData.post?.url?.base && publishData.post?.url?.path) {
    return `${publishData.post.url.base}${publishData.post.url.path}`;
  }

  // Fallback : slug Wix → notre seoSlug généré → l'ID (dernier recours)
  const slug = publishData.post?.slug ?? seoSlug;
  const base = siteUrl ? siteUrl.replace(/\/$/, "") : "https://www.wix.com";
  return `${base}/post/${slug}`;
}

// ─── Analyse DA Wix ───────────────────────────────────────────────────────────

export async function analyzeWixSite(apiKey: string, siteId: string) {
  try {
    const res = await fetch(WIX_POSTS_API, {
      headers: wixHeaders(apiKey, siteId),
    });
    if (!res.ok) return { existingTitles: [], styleGuide: "" };

    const data = await res.json() as { posts: { title: string }[] };
    const posts = data.posts ?? [];
    const existingTitles = posts.map((p) => p.title);
    return { existingTitles, styleGuide: "" };
  } catch {
    return { existingTitles: [], styleGuide: "" };
  }
}

// ─── Test de connexion Wix ────────────────────────────────────────────────────

export async function testWixConnection(apiKey: string, siteId: string): Promise<{ ok: boolean; reason?: string; memberId?: string }> {
  try {
    const res = await fetch(`${WIX_POSTS_API}?limit=1`, {
      headers: wixHeaders(apiKey, siteId),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "Clé API invalide ou permissions insuffisantes — activez les permissions Blog (lecture + écriture)" };
      if (res.status === 404) return { ok: false, reason: "Site ID incorrect — vérifiez le Site ID sur la page de votre clé API (manage.wix.com/account/api-keys)" };
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `Erreur ${res.status}${body ? ` : ${body.slice(0, 120)}` : ""}` };
    }

    const data = await res.json() as { posts?: { memberId?: string }[] };
    const memberIdFromPost = data.posts?.[0]?.memberId ?? null;
    const memberId = memberIdFromPost ?? await getWixMemberId(apiKey, siteId);

    return { ok: true, ...(memberId ? { memberId } : {}) };
  } catch {
    return { ok: false, reason: "Impossible de joindre l'API Wix" };
  }
}
