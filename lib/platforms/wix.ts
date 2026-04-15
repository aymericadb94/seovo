/**
 * ══════════════════════════════════════════════════════════════════════════════
 * WIX PLATFORM MODULE — Code isolé, ne jamais modifier pour Shopify
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Ce fichier contient TOUTE la logique spécifique à Wix :
 * - Types Ricos / DraftJS
 * - Convertisseurs HTML ↔ Ricos / DraftJS
 * - Publication (draft → publish)
 * - Lecture (list posts, list pages, list raw posts)
 * - Mise à jour (update post content, update post metadata)
 * - Suppression
 * - Nettoyage de liens cassés
 * - Test de connexion & analyse de site
 *
 * RÈGLE : Toute modification pour une autre plateforme (Shopify, WordPress…)
 * doit se faire dans un fichier séparé. Ce module est GELÉ pour Wix.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CmsPost, CmsPageType, CmsCredentials, UpdateResult } from "@/lib/cms-update";
import { generateImage } from "@/lib/image-gen";

// ══════════════════════════════════════════════════════════════════════════════
// TYPES RICOS (format natif Wix)
// ══════════════════════════════════════════════════════════════════════════════

type Decoration = { type: "BOLD" } | { type: "ITALIC" } | { type: "LINK"; linkData: { link: { url: string; target?: string } } };

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

type ImageNode = {
  type: "IMAGE";
  id: string;
  nodes: [];
  imageData: {
    containerData: { width: { size: string }; alignment: string };
    image: { src: { url: string }; width: number; height: number; altText?: string };
  };
};

type RicosNode = ParagraphNode | HeadingNode | ListNode | TableNode | ImageNode;

// ── Types DraftJS ─────────────────────────────────────────────────────────────

export type WixDraftBlock = {
  key: string;
  type: string;
  text: string;
  entityRanges?: { offset: number; length: number; key: number }[];
  inlineStyleRanges?: { offset: number; length: number; style: string }[];
  data?: Record<string, unknown>;
};

export type WixDraftEntity = {
  type: string;
  data?: { url?: string; href?: string; target?: string };
};

export type WixContentBlock = {
  blocks: WixDraftBlock[];
  entityMap?: Record<string, WixDraftEntity>;
};

// ── Types richContent ─────────────────────────────────────────────────────────

export type WixRichNode = {
  type: string;
  nodes?: WixRichNode[];
  textData?: {
    text: string;
    decorations?: { type: string; linkData?: { link?: { url?: string } } }[];
  };
  headingData?: { level: number };
  paragraphData?: unknown;
  linkData?: { link?: { url?: string } };
};

// ── Type pour les posts bruts ─────────────────────────────────────────────────

export type WixRawPost = {
  id: string;
  title: string;
  url: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  richContentNodes: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftJSContent: any | null;
  contentFormat: "richContent" | "draftJS";
};

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════

const WIX_POSTS_API = "https://www.wixapis.com/blog/v3/posts";
const WIX_DRAFTS_API = "https://www.wixapis.com/blog/v3/draft-posts";

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

export function wixHeaders(apiKey: string, siteId: string) {
  return { "Content-Type": "application/json", Authorization: apiKey, "wix-site-id": siteId };
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVERTISSEUR HTML → RICOS
// ══════════════════════════════════════════════════════════════════════════════

let _idCounter = 0;
function genId() {
  return `n${++_idCounter}`;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, "\u00a0").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseInline(html: string): TextNode[] {
  const clean = html.replace(/<br\s*\/?>/gi, " ");
  const segments = clean.split(/(<(?:strong|b|em|i|a)\b[^>]*>[\s\S]*?<\/(?:strong|b|em|i|a)>)/i);
  const result: TextNode[] = [];

  for (const seg of segments) {
    if (!seg) continue;
    const boldMatch = seg.match(/^<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>$/i);
    const italicMatch = seg.match(/^<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>$/i);
    const linkMatch = seg.match(/^<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>$/i);

    if (linkMatch) {
      const href = decodeEntities(linkMatch[1]);
      const linkText = decodeEntities(linkMatch[2].replace(/<[^>]+>/g, ""));
      if (!linkText.trim()) continue;
      result.push({
        type: "TEXT", id: "", nodes: [],
        textData: {
          text: linkText,
          decorations: [{ type: "LINK", linkData: { link: { url: href, target: "BLANK" } } }],
        },
      });
      continue;
    }

    const inner = boldMatch?.[1] ?? italicMatch?.[1] ?? seg;
    const text = decodeEntities(inner.replace(/<[^>]+>/g, ""));
    if (!text.trim()) continue;
    result.push({
      type: "TEXT", id: "", nodes: [],
      textData: {
        text,
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

function makeImage(src: string, alt?: string): ImageNode {
  return {
    type: "IMAGE",
    id: genId(),
    nodes: [],
    imageData: {
      containerData: { width: { size: "CONTENT" }, alignment: "CENTER" },
      image: { src: { url: src }, width: 1200, height: 630, altText: alt ?? "" },
    },
  };
}

export function htmlToRicos(html: string): object {
  _idCounter = 0;
  const nodes: RicosNode[] = [];

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

  const images: { index: number; length: number; node: ImageNode }[] = [];
  const figureRegex = /<figure[^>]*>[\s\S]*?<img\s+[^>]*src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*\/>?[\s\S]*?<\/figure>/gi;
  let figMatch;
  while ((figMatch = figureRegex.exec(html)) !== null) {
    images.push({ index: figMatch.index, length: figMatch[0].length, node: makeImage(figMatch[1], figMatch[2]) });
  }
  const standaloneImgRegex = /<img\s+[^>]*src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*\/?>/gi;
  let imgMatch;
  while ((imgMatch = standaloneImgRegex.exec(html)) !== null) {
    const alreadyCaptured = images.some(img => imgMatch!.index >= img.index && imgMatch!.index < img.index + img.length);
    if (!alreadyCaptured) {
      images.push({ index: imgMatch.index, length: imgMatch[0].length, node: makeImage(imgMatch[1], imgMatch[2]) });
    }
  }

  let processed = html;
  const allReplacements = [
    ...tables.map((t, i) => ({ index: t.index, length: t.length, placeholder: `<TABLE_PLACEHOLDER_${i}>` })),
    ...images.map((img, i) => ({ index: img.index, length: img.length, placeholder: `<IMG_PLACEHOLDER_${i}>` })),
  ].sort((a, b) => b.index - a.index);

  for (const r of allReplacements) {
    processed = processed.slice(0, r.index) + r.placeholder + processed.slice(r.index + r.length);
  }

  const blockRegex = /<(h[1-6]|p|ul|ol|blockquote|div)([^>]*)>([\s\S]*?)<\/\1>|<TABLE_PLACEHOLDER_(\d+)>|<IMG_PLACEHOLDER_(\d+)>/gi;
  let match;

  while ((match = blockRegex.exec(processed)) !== null) {
    if (match[4] !== undefined) {
      nodes.push(tables[parseInt(match[4])].node);
      continue;
    }
    if (match[5] !== undefined) {
      nodes.push(images[parseInt(match[5])].node);
      continue;
    }
    const tag = match[1].toLowerCase();
    const inner = match[3].trim();
    const innerImgMatch = inner.match(/<IMG_PLACEHOLDER_(\d+)>/);
    if (innerImgMatch) {
      nodes.push(images[parseInt(innerImgMatch[1])].node);
      const textPart = inner.replace(/<IMG_PLACEHOLDER_\d+>/, "").trim();
      if (textPart) nodes.push(makeParagraph(textPart));
      continue;
    }
    if (tag.startsWith("h")) {
      const level = parseInt(tag[1]);
      nodes.push(makeHeading(inner, level));
    }
    else if (tag === "p") nodes.push(makeParagraph(inner));
    else if (tag === "ul") nodes.push(makeList(inner, false));
    else if (tag === "ol") nodes.push(makeList(inner, true));
    else if (tag === "blockquote") nodes.push(makeParagraph(inner));
    else if (tag === "div" && inner) nodes.push(makeParagraph(inner));
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

// ══════════════════════════════════════════════════════════════════════════════
// CONVERTISSEUR DraftJS → HTML
// ══════════════════════════════════════════════════════════════════════════════

export function wixDraftBlocksToHtml(blocks: WixDraftBlock[], entityMap: Record<string, WixDraftEntity>): string {
  let html = "";

  for (const block of blocks) {
    let text = block.text;
    if (block.entityRanges?.length && entityMap) {
      const sortedRanges = [...block.entityRanges].sort((a, b) => b.offset - a.offset);
      for (const range of sortedRanges) {
        const entity = entityMap[String(range.key)];
        if (entity?.type === "LINK") {
          const url = entity.data?.url || entity.data?.href || "";
          if (url) {
            const anchor = text.slice(range.offset, range.offset + range.length);
            text = text.slice(0, range.offset) + `<a href="${url}">${anchor}</a>` + text.slice(range.offset + range.length);
          }
        }
      }
    }

    switch (block.type) {
      case "header-one":
        html += `<h1>${text}</h1>`;
        break;
      case "header-two":
        html += `<h2>${text}</h2>`;
        break;
      case "header-three":
        html += `<h3>${text}</h3>`;
        break;
      case "header-four":
        html += `<h4>${text}</h4>`;
        break;
      case "unordered-list-item":
        html += `<li>${text}</li>`;
        break;
      case "ordered-list-item":
        html += `<li>${text}</li>`;
        break;
      case "blockquote":
        html += `<blockquote>${text}</blockquote>`;
        break;
      default:
        if (text.trim()) html += `<p>${text}</p>`;
        break;
    }
  }

  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVERTISSEUR richContent → HTML
// ══════════════════════════════════════════════════════════════════════════════

export function wixRichContentToHtml(nodes: WixRichNode[]): string {
  let html = "";
  for (const node of nodes) {
    if (node.type === "HEADING") {
      const level = node.headingData?.level ?? 2;
      const inner = wixInlineNodesToHtml(node.nodes ?? []);
      html += `<h${level}>${inner}</h${level}>`;
    } else if (node.type === "PARAGRAPH") {
      const inner = wixInlineNodesToHtml(node.nodes ?? []);
      if (inner.trim()) html += `<p>${inner}</p>`;
    } else if (node.type === "BULLETED_LIST" || node.type === "ORDERED_LIST") {
      const tag = node.type === "ORDERED_LIST" ? "ol" : "ul";
      html += `<${tag}>`;
      for (const item of (node.nodes ?? [])) {
        const inner = wixRichContentToHtml(item.nodes ?? []);
        html += `<li>${inner}</li>`;
      }
      html += `</${tag}>`;
    } else if (node.nodes) {
      html += wixRichContentToHtml(node.nodes);
    }
  }
  return html;
}

export function wixInlineNodesToHtml(nodes: WixRichNode[]): string {
  let result = "";
  for (const n of nodes) {
    if (n.type === "TEXT") {
      const text = n.textData?.text ?? "";
      const linkDecor = n.textData?.decorations?.find(d => d.type === "LINK");
      if (linkDecor?.linkData?.link?.url) {
        result += `<a href="${linkDecor.linkData.link.url}">${text}</a>`;
      } else {
        result += text;
      }
    } else if (n.type === "LINK" || n.linkData?.link?.url) {
      const href = n.linkData?.link?.url ?? "";
      const inner = wixInlineNodesToHtml(n.nodes ?? []);
      result += href ? `<a href="${href}">${inner || href}</a>` : inner;
    } else if (n.nodes) {
      result += wixInlineNodesToHtml(n.nodes);
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════════════════════
// CONVERTISSEUR HTML → DRAFT.JS
// ══════════════════════════════════════════════════════════════════════════════

let _blockKeyCounter = 0;
function generateBlockKey(): string {
  _blockKeyCounter++;
  return `bk${Date.now().toString(36)}${_blockKeyCounter.toString(36)}`;
}

function extractTextAndLinks(
  innerHtml: string,
  startKey: number
): {
  text: string;
  entityRanges: { offset: number; length: number; key: number }[];
  entities: { key: number; entity: WixDraftEntity }[];
} {
  const entityRanges: { offset: number; length: number; key: number }[] = [];
  const entities: { key: number; entity: WixDraftEntity }[] = [];
  let currentKey = startKey;

  let text = "";
  const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let lastIndex = 0;
  let linkMatch;

  linkRegex.lastIndex = 0;

  while ((linkMatch = linkRegex.exec(innerHtml)) !== null) {
    const before = innerHtml.slice(lastIndex, linkMatch.index);
    const cleanBefore = before.replace(/<[^>]+>/g, "");
    text += cleanBefore;

    const linkText = linkMatch[2].replace(/<[^>]+>/g, "");
    const offset = text.length;
    text += linkText;

    entityRanges.push({ offset, length: linkText.length, key: currentKey });
    entities.push({
      key: currentKey,
      entity: { type: "LINK", data: { url: linkMatch[1], target: "_blank" } },
    });
    currentKey++;
    lastIndex = linkMatch.index + linkMatch[0].length;
  }

  if (lastIndex < innerHtml.length) {
    const after = innerHtml.slice(lastIndex);
    text += after.replace(/<[^>]+>/g, "");
  }

  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

  return { text, entityRanges, entities };
}

export function htmlToDraftContent(html: string): WixContentBlock {
  const blocks: WixDraftBlock[] = [];
  const entityMap: Record<string, WixDraftEntity> = {};
  let entityKey = 0;

  const blockRegex = /<(p|h[1-3]|li|blockquote|div)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let listType: "unordered" | "ordered" | null = null;

  let pos = 0;
  while ((match = blockRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const innerHtml = match[2];

    if (tag === "li") {
      const beforeLi = html.slice(pos, match.index);
      const lastOl = beforeLi.lastIndexOf("<ol");
      const lastUl = beforeLi.lastIndexOf("<ul");
      const lastOlEnd = beforeLi.lastIndexOf("</ol");
      const lastUlEnd = beforeLi.lastIndexOf("</ul");
      if (lastOl > lastUl && lastOl > lastOlEnd) listType = "ordered";
      else if (lastUl > lastOl && lastUl > lastUlEnd) listType = "unordered";
    }

    const { text, entityRanges, entities } = extractTextAndLinks(innerHtml, entityKey);
    entityKey += entities.length;

    for (const e of entities) {
      entityMap[String(e.key)] = e.entity;
    }

    let blockType = "unstyled";
    switch (tag) {
      case "h1": blockType = "header-one"; break;
      case "h2": blockType = "header-two"; break;
      case "h3": blockType = "header-three"; break;
      case "li": blockType = listType === "ordered" ? "ordered-list-item" : "unordered-list-item"; break;
      case "blockquote": blockType = "blockquote"; break;
    }

    if (text.trim()) {
      blocks.push({
        key: generateBlockKey(),
        type: blockType,
        text,
        entityRanges,
        data: {},
      });
    }
  }

  if (blocks.length === 0) {
    const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped) {
      blocks.push({
        key: generateBlockKey(),
        type: "unstyled",
        text: stripped,
        entityRanges: [],
        data: {},
      });
    }
  }

  return { blocks, entityMap };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE COVER — Import vers Wix Media
// ══════════════════════════════════════════════════════════════════════════════

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
        url?: string;
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

// ══════════════════════════════════════════════════════════════════════════════
// RÉSOLUTION MEMBER ID
// ══════════════════════════════════════════════════════════════════════════════

async function getWixMemberId(apiKey: string, siteId: string): Promise<string | null> {
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

// ══════════════════════════════════════════════════════════════════════════════
// PUBLICATION WIX (draft → publish)
// ══════════════════════════════════════════════════════════════════════════════

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

  const memberId = storedMemberId || await getWixMemberId(apiKey, siteId);
  if (!memberId) {
    throw new Error("Impossible de récupérer l'identifiant du propriétaire du site Wix. Vérifiez que votre clé API a les permissions 'Membres' en lecture, ou publiez au moins un article manuellement sur votre blog Wix.");
  }

  let mediaData: Record<string, unknown> | undefined;
  if (imageQuery) {
    console.log(`[wix/cover] génération DALL-E: "${imageQuery}"`);
    const genImg = await generateImage(imageQuery);
    if (genImg) {
      console.log("[wix/cover] import vers Wix Media...");
      const wixImg = await importImageToWix(apiKey, siteId, genImg.url, imageAlt || title);
      if (wixImg) {
        console.log(`[wix/cover] image importée: id=${wixImg.id}, url=${wixImg.url}`);
        mediaData = {
          wixMedia: {
            image: {
              id: wixImg.id,
              url: wixImg.url,
              height: wixImg.height,
              width: wixImg.width,
            },
          },
          displayed: true,
        };
      } else {
        console.error("[wix/cover] import Wix Media échoué");
      }
    }
  }

  const seoSlug = generateSlug(title);

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

  if (publishData.post?.url?.base && publishData.post?.url?.path) {
    return `${publishData.post.url.base}${publishData.post.url.path}`;
  }

  const postId = publishData.post?.id;
  if (postId) {
    try {
      const refetchRes = await fetch(`${WIX_POSTS_API}/${postId}?fieldsets=URL`, { headers });
      if (refetchRes.ok) {
        const refetchData = await refetchRes.json() as {
          post?: { slug?: string; url?: { base: string; path: string } };
        };
        if (refetchData.post?.url?.base && refetchData.post?.url?.path) {
          return `${refetchData.post.url.base}${refetchData.post.url.path}`;
        }
        if (refetchData.post?.slug) {
          const base = siteUrl ? siteUrl.replace(/\/$/, "") : "";
          return `${base}/post/${refetchData.post.slug}`;
        }
      }
    } catch { /* non-fatal — use fallback below */ }
  }

  const slug = publishData.post?.slug ?? seoSlug;
  const base = siteUrl ? siteUrl.replace(/\/$/, "") : "https://www.wix.com";
  console.warn(`[wix] Fallback URL used: ${base}/post/${slug} — Wix API did not return full URL`);
  return `${base}/post/${slug}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYSE & TEST CONNEXION
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// LECTURE — List posts & pages
// ══════════════════════════════════════════════════════════════════════════════

/** Extract the first <img src="..."> from HTML content as fallback for missing featured images */
function extractFirstImage(html: string): string | null {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!match?.[1]) return null;
  const src = match[1];
  if (src.includes("1x1") || src.includes("pixel") || src.includes("spacer") || src.includes("emoji")) return null;
  return src;
}

export async function wixListPosts(
  apiKey: string,
  siteId: string,
  limit: number = 50,
  siteUrl?: string,
): Promise<(CmsPost & { wix_id: string })[]> {
  try {
    const base = siteUrl?.replace(/\/$/, "") ?? "";
    const hdrs = wixHeaders(apiKey, siteId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allPosts: any[] = [];
    const perPage = Math.min(limit, 100);
    let cursor: string | null = null;

    while (allPosts.length < limit) {
      let url = `https://www.wixapis.com/blog/v3/posts?paging.limit=${perPage}&fieldsets=CONTENT_TEXT&fieldsets=CONTENT&fieldsets=URL`;
      if (cursor) url += `&paging.offset=${allPosts.length}`;
      const res = await fetch(url, { headers: hdrs });
      if (!res.ok) break;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as { posts?: any[]; metaData?: { cursor?: string; hasNext?: boolean } };
      const posts = data.posts ?? [];
      if (posts.length === 0) break;
      allPosts.push(...posts);
      if (!data.metaData?.hasNext || posts.length < perPage) break;
      cursor = data.metaData?.cursor ?? null;
    }

    return allPosts.slice(0, limit).map((p: Record<string, unknown>) => {
      const title = (p.title as string) ?? "";
      const slug = (p.slug as string) ?? "";
      const excerpt = (p.excerpt as string) ?? "";
      const urlObj = p.url as { base?: string; path?: string } | undefined;

      let postUrl = "";
      if (urlObj?.base && urlObj?.path) {
        postUrl = `${urlObj.base}${urlObj.path}`;
      } else if (slug) {
        postUrl = `${base}/post/${slug}`;
      }

      let html = "";
      try {
        let raw = p.content;
        if (typeof raw === "string") {
          try { raw = JSON.parse(raw); } catch { /* if it contains HTML, use as-is */ }
        }
        if (typeof raw === "string") {
          html = raw;
        } else if (raw && typeof raw === "object") {
          const obj = raw as Record<string, unknown>;
          if (Array.isArray(obj)) {
            html = wixDraftBlocksToHtml(obj as WixDraftBlock[], {});
          } else if (Array.isArray(obj.blocks)) {
            html = wixDraftBlocksToHtml(
              obj.blocks as WixDraftBlock[],
              (obj.entityMap ?? {}) as Record<string, WixDraftEntity>
            );
          }
        }
      } catch { /* non-fatal */ }

      const rc = p.richContent as { nodes?: WixRichNode[] } | undefined;
      if (!html && rc?.nodes?.length) {
        html = wixRichContentToHtml(rc.nodes);
      }
      if (!html && excerpt) {
        html = `<p>${excerpt}</p>`;
      }

      const media = p.media as { wixMedia?: { image?: { url?: string } }; image?: { url?: string } } | undefined;
      const coverMedia = p.coverMedia as { image?: { url?: string } } | undefined;
      const featuredImage = media?.wixMedia?.image?.url ?? coverMedia?.image?.url ?? null;

      const firstPublished = (p.firstPublishedDate ?? p.publishedDate ?? p.lastPublishedDate) as string | undefined;

      return {
        id: (p.id as string) ?? "",
        wix_id: (p.id as string) ?? "",
        title,
        content: html,
        url: postUrl,
        excerpt,
        featured_image: featuredImage,
        published_at: firstPublished ? new Date(firstPublished).toISOString() : null,
      };
    });
  } catch {
    return [];
  }
}

export async function wixListStaticPages(
  apiKey: string,
  siteId: string,
  siteUrl?: string,
): Promise<CmsPost[]> {
  try {
    const base = siteUrl?.replace(/\/$/, "") ?? "";
    const hdrs = wixHeaders(apiKey, siteId);
    const res = await fetch(
      "https://www.wixapis.com/site-properties/v4/properties",
      { headers: hdrs }
    );
    if (!res.ok) {
      const sitemapRes = await fetch(`${base}/sitemap.xml`);
      if (!sitemapRes.ok) return [];
      const sitemapText = await sitemapRes.text();
      const urlMatches = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)];
      const blogPattern = /\/post\//;
      const pages: CmsPost[] = [];
      for (const match of urlMatches) {
        const url = match[1];
        if (blogPattern.test(url)) continue;
        const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
        const title = slug
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase()) || "Page";
        pages.push({
          id: `page-${slug}`,
          title,
          content: "",
          url,
          page_type: "page" as CmsPageType,
        });
      }
      return pages;
    }
    return [];
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MISE À JOUR — Update post
// ══════════════════════════════════════════════════════════════════════════════

export async function wixUpdatePost(
  apiKey: string,
  siteId: string,
  postId: string,
  updates: { title?: string; content?: string; richContent?: unknown }
): Promise<UpdateResult> {
  try {
    const body: Record<string, unknown> = {};
    if (updates.title) body.title = updates.title;
    if (updates.content) body.content = updates.content;
    if (updates.richContent) body.richContent = updates.richContent;

    const res = await fetch(
      `https://www.wixapis.com/blog/v3/posts/${postId}`,
      {
        method: "PATCH",
        headers: wixHeaders(apiKey, siteId),
        body: JSON.stringify({ post: body }),
      }
    );
    if (!res.ok) {
      return { success: false, post_id: postId, url: "", error: `Wix PATCH failed: ${await res.text()}` };
    }
    const data = await res.json() as { post: { id: string; url?: { base: string; path: string } } };
    const url = data.post.url ? `${data.post.url.base}${data.post.url.path}` : "";
    return { success: true, post_id: data.post.id, url };
  } catch (err) {
    return { success: false, post_id: postId, url: "", error: err instanceof Error ? err.message : "Unknown" };
  }
}

// ── Update post content (complex: fetch existing → append → publish) ─────────

export async function wixUpdatePostContent(
  apiKey: string, siteId: string, postId: string, newHtml: string
): Promise<UpdateResult> {
  const hdrs = wixHeaders(apiKey, siteId);
  let draftId: string | null = null;

  async function republishDraft(id: string): Promise<void> {
    try {
      console.log(`[wix/update] Republishing draft ${id} to restore original state`);
      await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${id}/publish`, { method: "POST", headers: hdrs });
    } catch (e) {
      console.error(`[wix/update] Failed to republish draft ${id}:`, e);
    }
  }

  try {
    const allLinksInHtml: { url: string; text: string }[] = [];
    const allLinkRegex = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let allMatch;
    while ((allMatch = allLinkRegex.exec(newHtml)) !== null) {
      allLinksInHtml.push({ url: allMatch[1], text: allMatch[2] });
    }
    if (allLinksInHtml.length === 0) {
      return { success: false, post_id: postId, url: "", error: "Aucun lien trouvé dans le HTML modifié" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let draftData: any = null;
    let contentFormat: "richContent" | "draftJS" = "richContent";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let existingDraftJSContent: any = null;

    let existingFullNodes: WixRichNode[] = [];
    let originalNodeCount = 0;
    let originalBlockCount = 0;

    for (const fs of ["CONTENT_TEXT", "CONTENT", "GENERATED_CONTENT"]) {
      if (existingFullNodes.length > 0) break;
      try {
        const getFullRes = await fetch(
          `https://www.wixapis.com/blog/v3/posts/${postId}?fieldsets=${fs}`,
          { headers: hdrs }
        );
        if (getFullRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fullData = await getFullRes.json() as any;
          const nodes = fullData.post?.richContent?.nodes ?? [];
          if (nodes.length > existingFullNodes.length) {
            existingFullNodes = nodes;
          }
          if (nodes.length === 0 && fullData.post?.content?.blocks?.length > 0) {
            contentFormat = "draftJS";
            existingDraftJSContent = fullData.post.content;
            originalBlockCount = fullData.post.content.blocks.length;
          }
        }
      } catch { /* try next fieldset */ }
    }
    originalNodeCount = existingFullNodes.length;

    if (existingFullNodes.length === 0 && !existingDraftJSContent) {
      return { success: false, post_id: postId, url: "", error: "Wix: impossible de récupérer le contenu existant — abandon par sécurité (aucun fieldset n'a retourné de contenu)" };
    }

    const contentSize = existingFullNodes.length || originalBlockCount;
    if (contentSize < 3) {
      return { success: false, post_id: postId, url: "", error: `Wix: contenu récupéré trop court (${contentSize} éléments) — abandon par sécurité pour éviter l'écrasement` };
    }

    console.log(`[wix/update] Post ${postId}: ${originalNodeCount} richContent nodes, ${originalBlockCount} draftJS blocks, format=${contentFormat}`);

    const revertRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/revert/${postId}`,
      { method: "POST", headers: hdrs }
    );
    if (revertRes.ok) {
      draftData = await revertRes.json();
      draftId = draftData?.draftPost?.id ?? null;
      if (existingFullNodes.length === 0) {
        const revertNodes = draftData?.draftPost?.richContent?.nodes ?? [];
        if (revertNodes.length >= 3) {
          existingFullNodes = revertNodes;
          originalNodeCount = revertNodes.length;
        }
      }
      if (existingFullNodes.length === 0 && !existingDraftJSContent && draftData?.draftPost?.content?.blocks?.length >= 3) {
        contentFormat = "draftJS";
        existingDraftJSContent = draftData.draftPost.content;
        originalBlockCount = draftData.draftPost.content.blocks.length;
      }
    }

    if (!draftId) {
      const listRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts?paging.limit=100&fieldsets=CONTENT_TEXT`,
        { headers: hdrs }
      );
      if (listRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listData = await listRes.json() as { draftPosts?: any[] };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = listData.draftPosts?.find((d: any) => d.postId === postId || d.id === postId);
        if (match) {
          draftId = match.id;
          draftData = { draftPost: match };
          if (existingFullNodes.length === 0) {
            const matchNodes = match.richContent?.nodes ?? [];
            if (matchNodes.length >= 3) {
              existingFullNodes = matchNodes;
              originalNodeCount = matchNodes.length;
            }
          }
        }
      }
    }

    if (existingFullNodes.length === 0 && !existingDraftJSContent && draftId) {
      const getDraftRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${draftId}?fieldsets=CONTENT_TEXT`,
        { headers: hdrs }
      );
      if (getDraftRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draftFullData = await getDraftRes.json() as any;
        const draftNodes = draftFullData.draftPost?.richContent?.nodes ?? [];
        if (draftNodes.length >= 3) {
          existingFullNodes = draftNodes;
          originalNodeCount = draftNodes.length;
        }
        if (existingFullNodes.length === 0 && draftFullData.draftPost?.content?.blocks?.length >= 3) {
          contentFormat = "draftJS";
          existingDraftJSContent = draftFullData.draftPost.content;
          originalBlockCount = draftFullData.draftPost.content.blocks.length;
        }
      }
    }

    if (existingFullNodes.length === 0 && !existingDraftJSContent) {
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: "Wix: impossible de récupérer le contenu existant — abandon par sécurité" };
    }

    // ── DraftJS format path ──
    if (contentFormat === "draftJS" && existingDraftJSContent && draftId) {
      const blocks = existingDraftJSContent.blocks as { text: string; entityRanges?: { key: number }[] }[];
      const entityMap = existingDraftJSContent.entityMap as Record<string, { type: string; data: { url?: string } }>;

      const existingLinkUrls = new Set<string>();
      for (const [, entity] of Object.entries(entityMap)) {
        if (entity.type === "LINK" && entity.data?.url) {
          existingLinkUrls.add(entity.data.url);
        }
      }

      const linksToAdd = allLinksInHtml.filter(l => !existingLinkUrls.has(l.url));
      if (linksToAdd.length === 0) {
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: "Liens déjà présents dans l'article" };
      }

      let nextEntityKey = Math.max(0, ...Object.keys(entityMap).map(Number).filter(n => !isNaN(n))) + 1;
      const newBlocks = [];
      const newEntities: Record<string, { type: string; mutability: string; data: { url: string; target: string } }> = {};

      for (const link of linksToAdd) {
        const text = `À lire aussi : ${link.text}`;
        const offset = 15;
        newBlocks.push({
          key: Math.random().toString(36).slice(2, 7),
          text,
          type: "unstyled",
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [{ key: nextEntityKey, offset, length: link.text.length }],
          data: {},
        });
        newEntities[String(nextEntityKey)] = {
          type: "LINK",
          mutability: "MUTABLE",
          data: { url: link.url, target: "_blank" },
        };
        nextEntityKey++;
      }

      const updatedBlocks = [...blocks, ...newBlocks];
      if (updatedBlocks.length < blocks.length) {
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: `Wix: safety check failed — updated blocks (${updatedBlocks.length}) < original (${blocks.length})` };
      }

      const updatedContent = {
        ...existingDraftJSContent,
        blocks: updatedBlocks,
        entityMap: { ...entityMap, ...newEntities },
      };

      const updateDraftRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
        {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({ draftPost: { content: updatedContent }, fieldMask: ["content"] }),
        }
      );
      if (!updateDraftRes.ok) {
        const errText = (await updateDraftRes.text()).slice(0, 300);
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: `Wix update draft failed (${updateDraftRes.status}): ${errText}` };
      }

      const verifyRes = await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${draftId}?fieldsets=CONTENT_TEXT`, { headers: hdrs });
      if (verifyRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const verifyData = await verifyRes.json() as any;
        const verifyBlocks = verifyData.draftPost?.content?.blocks?.length ?? 0;
        if (verifyBlocks < blocks.length) {
          console.error(`[wix/update] ABORT: draft has ${verifyBlocks} blocks but original had ${blocks.length} — would lose content`);
          await republishDraft(draftId);
          return { success: false, post_id: postId, url: "", error: `Wix: abandon — le brouillon (${verifyBlocks} blocs) a moins de contenu que l'original (${blocks.length} blocs)` };
        }
      }

      const publishRes = await fetch(
        `https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`,
        { method: "POST", headers: hdrs }
      );
      if (!publishRes.ok) {
        const errText = (await publishRes.text()).slice(0, 300);
        return { success: false, post_id: postId, url: "", error: `Wix publish draft failed (${publishRes.status}): ${errText}` };
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pubData = await publishRes.json() as any;
      const url = pubData.post?.url ? `${pubData.post.url.base}${pubData.post.url.path}` : "";
      return { success: true, post_id: pubData.post?.id ?? postId, url };
    }

    // ── richContent format path (standard) ───────────────────────────────

    if (!draftId) {
      const existingLinkUrls = new Set<string>();
      function scanNodes(nodes: WixRichNode[]) {
        for (const n of nodes) {
          if (n.textData?.decorations) {
            for (const d of n.textData.decorations) {
              if (d.linkData?.link?.url) existingLinkUrls.add(d.linkData.link.url);
            }
          }
          if (n.nodes) scanNodes(n.nodes as WixRichNode[]);
        }
      }
      scanNodes(existingFullNodes);

      const linksToAdd = allLinksInHtml.filter(l => !existingLinkUrls.has(l.url));
      if (linksToAdd.length === 0) {
        return { success: false, post_id: postId, url: "", error: "Liens déjà présents dans l'article" };
      }

      const newNodes: WixRichNode[] = linksToAdd.map(link => ({
        type: "PARAGRAPH",
        paragraphData: {},
        nodes: [
          { type: "TEXT", textData: { text: "À lire aussi : ", decorations: [] } },
          { type: "TEXT", textData: { text: link.text, decorations: [{ type: "LINK", linkData: { link: { url: link.url } } }] } },
        ],
      }));

      if (existingFullNodes.length < 3) {
        return { success: false, post_id: postId, url: "", error: `Wix: contenu existant trop court (${existingFullNodes.length} nodes) — abandon pour éviter l'écrasement` };
      }

      const mergedNodes = [...existingFullNodes, ...newNodes];
      console.log(`[wix/update] Direct PATCH: ${existingFullNodes.length} existing + ${newNodes.length} new = ${mergedNodes.length} total`);

      const directRes = await fetch(
        `https://www.wixapis.com/blog/v3/posts/${postId}`,
        {
          method: "PATCH",
          headers: hdrs,
          body: JSON.stringify({ post: { richContent: { nodes: mergedNodes } }, fieldMask: ["richContent"] }),
        }
      );
      if (directRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await directRes.json() as any;
        const url = data.post?.url ? `${data.post.url.base}${data.post.url.path}` : "";
        return { success: true, post_id: data.post?.id ?? postId, url };
      }

      return { success: false, post_id: postId, url: "", error: `Wix: impossible de créer un brouillon (revert=${revertRes.status}, direct PATCH=${directRes.status})` };
    }

    const existingLinks = new Set<string>();
    const existingRc = draftData?.draftPost?.richContent as { nodes?: WixRichNode[] } | undefined;
    function collectLinks(nodes: WixRichNode[]) {
      for (const n of nodes) {
        if (n.textData?.decorations) {
          for (const d of n.textData.decorations) {
            if (d.linkData?.link?.url) existingLinks.add(d.linkData.link.url);
          }
        }
        if (n.linkData?.link?.url) existingLinks.add(n.linkData.link.url);
        if (n.nodes) collectLinks(n.nodes);
      }
    }
    if (existingRc?.nodes) collectLinks(existingRc.nodes);

    const linksToAdd = allLinksInHtml.filter(l => !existingLinks.has(l.url));
    if (linksToAdd.length === 0) {
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: "Liens déjà présents dans l'article" };
    }

    const newNodes: WixRichNode[] = linksToAdd.map(link => ({
      type: "PARAGRAPH",
      paragraphData: {},
      nodes: [
        { type: "TEXT", textData: { text: "À lire aussi : ", decorations: [] } },
        { type: "TEXT", textData: { text: link.text, decorations: [{ type: "LINK", linkData: { link: { url: link.url } } }] } },
      ],
    }));

    const baseNodes = (existingRc?.nodes?.length ?? 0) > 0 ? existingRc!.nodes! : existingFullNodes;

    if (baseNodes.length < 3) {
      console.error(`[wix/update] ABORT: baseNodes only has ${baseNodes.length} nodes — would lose content`);
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: `Wix: contenu de base trop court (${baseNodes.length} nodes) — abandon pour éviter l'écrasement` };
    }

    const updatedNodes = [...baseNodes, ...newNodes];
    console.log(`[wix/update] Post ${postId}: ${baseNodes.length} base nodes + ${newNodes.length} new = ${updatedNodes.length} total`);

    const updateDraftRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
      {
        method: "PATCH",
        headers: hdrs,
        body: JSON.stringify({ draftPost: { richContent: { nodes: updatedNodes } }, fieldMask: ["richContent"] }),
      }
    );
    if (!updateDraftRes.ok) {
      const errText = (await updateDraftRes.text()).slice(0, 300);
      if (draftId) await republishDraft(draftId);
      return { success: false, post_id: postId, url: "", error: `Wix update draft failed (${updateDraftRes.status}): ${errText}` };
    }

    const verifyDraftRes = await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${draftId}?fieldsets=CONTENT_TEXT`, { headers: hdrs });
    if (verifyDraftRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verifyData = await verifyDraftRes.json() as any;
      const verifyNodeCount = verifyData.draftPost?.richContent?.nodes?.length ?? 0;
      if (verifyNodeCount < baseNodes.length) {
        console.error(`[wix/update] ABORT PUBLISH: draft has ${verifyNodeCount} nodes but original had ${baseNodes.length} — content loss detected`);
        await republishDraft(draftId);
        return { success: false, post_id: postId, url: "", error: `Wix: abandon — le brouillon (${verifyNodeCount} nodes) a moins de contenu que l'original (${baseNodes.length} nodes)` };
      }
    }

    const publishRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`,
      { method: "POST", headers: hdrs }
    );
    if (!publishRes.ok) {
      const errText = (await publishRes.text()).slice(0, 300);
      return { success: false, post_id: postId, url: "", error: `Wix publish draft failed (${publishRes.status}): ${errText}` };
    }
    const pubData = await publishRes.json() as { post?: { id: string; url?: { base: string; path: string } } };
    const url = pubData.post?.url ? `${pubData.post.url.base}${pubData.post.url.path}` : "";
    return { success: true, post_id: pubData.post?.id ?? postId, url };
  } catch (err) {
    if (draftId) await republishDraft(draftId);
    return { success: false, post_id: postId, url: "", error: `Wix update error: ${err instanceof Error ? err.message : "Unknown"}` };
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPPRESSION
// ══════════════════════════════════════════════════════════════════════════════

export async function wixDeletePost(
  apiKey: string,
  siteId: string,
  postId: string
): Promise<{ success: boolean; error?: string }> {
  const hdrs = wixHeaders(apiKey, siteId);
  const res = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/${postId}?permanent=true`,
    { method: "DELETE", headers: hdrs }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[Wix DELETE] postId=${postId} status=${res.status} body=${body}`);
    return { success: false, error: `Wix DELETE failed: ${res.status} — ${body}` };
  }
  return { success: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// RAW POSTS — Fetch with native content intact
// ══════════════════════════════════════════════════════════════════════════════

export async function wixListRawPosts(
  apiKey: string, siteId: string, limit: number = 200, siteUrl?: string
): Promise<WixRawPost[]> {
  const hdrs = wixHeaders(apiKey, siteId);
  const base = siteUrl?.replace(/\/$/, "") ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPosts: any[] = [];
  const perPage = Math.min(limit, 100);

  while (allPosts.length < limit) {
    let url = `https://www.wixapis.com/blog/v3/posts?paging.limit=${perPage}&fieldsets=CONTENT_TEXT&fieldsets=CONTENT&fieldsets=URL`;
    if (allPosts.length > 0) url += `&paging.offset=${allPosts.length}`;
    const res = await fetch(url, { headers: hdrs });
    if (!res.ok) break;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as { posts?: any[]; metaData?: { hasNext?: boolean } };
    const posts = data.posts ?? [];
    if (posts.length === 0) break;
    allPosts.push(...posts);
    if (!data.metaData?.hasNext || posts.length < perPage) break;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return allPosts.slice(0, limit).map((p: any) => {
    const title = p.title ?? "";
    const slug = p.slug ?? "";
    const urlObj = p.url as { base?: string; path?: string } | undefined;
    let postUrl = "";
    if (urlObj?.base && urlObj?.path) postUrl = `${urlObj.base}${urlObj.path}`;
    else if (slug) postUrl = `${base}/post/${slug}`;

    const richNodes = p.richContent?.nodes ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let draftJS: any = null;
    let format: "richContent" | "draftJS" = "richContent";

    if (richNodes.length === 0) {
      let raw = p.content;
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw); } catch { /* not JSON */ }
      }
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = raw as any;
        if (Array.isArray(obj.blocks) && obj.blocks.length > 0) {
          format = "draftJS";
          draftJS = obj;
        }
      }
    }

    return {
      id: p.id ?? "",
      title,
      url: postUrl,
      richContentNodes: richNodes,
      draftJSContent: draftJS,
      contentFormat: format,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// NETTOYAGE LIENS CASSÉS — Native richContent / DraftJS
// ══════════════════════════════════════════════════════════════════════════════

async function wixPatchContent(
  hdrs: Record<string, string>,
  postId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patchPayload: Record<string, any>,
  fieldMaskField: string
): Promise<{ success: boolean; error?: string }> {
  const directRes = await fetch(
    `https://www.wixapis.com/blog/v3/posts/${postId}`,
    {
      method: "PATCH",
      headers: hdrs,
      body: JSON.stringify({ post: patchPayload, fieldMask: [fieldMaskField] }),
    }
  );
  if (directRes.ok) {
    return { success: true };
  }

  let draftId: string | null = null;
  const revertRes = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/revert/${postId}`,
    { method: "POST", headers: hdrs }
  );
  if (revertRes.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const revertData = await revertRes.json() as any;
    draftId = revertData?.draftPost?.id ?? null;
  }

  if (!draftId) {
    const listRes = await fetch(
      `https://www.wixapis.com/blog/v3/draft-posts?paging.limit=100`,
      { headers: hdrs }
    );
    if (listRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listData = await listRes.json() as { draftPosts?: any[] };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = listData.draftPosts?.find((d: any) => d.postId === postId || d.id === postId);
      if (match) {
        draftId = match.id;
      }
    }
  }

  if (!draftId) {
    return { success: false, error: `Impossible de modifier le post Wix (direct PATCH=${directRes.status}, revert=${revertRes.status})` };
  }

  const draftPatchPayload: Record<string, unknown> = { draftPost: patchPayload, fieldMask: [fieldMaskField] };
  const patchRes = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/${draftId}`,
    { method: "PATCH", headers: hdrs, body: JSON.stringify(draftPatchPayload) }
  );
  if (!patchRes.ok) {
    await fetch(`https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`, { method: "POST", headers: hdrs }).catch(() => {});
    return { success: false, error: `Draft PATCH failed: ${patchRes.status}` };
  }

  const pubRes = await fetch(
    `https://www.wixapis.com/blog/v3/draft-posts/${draftId}/publish`,
    { method: "POST", headers: hdrs }
  );
  if (!pubRes.ok) {
    return { success: false, error: `Draft publish failed: ${pubRes.status}` };
  }

  return { success: true };
}

export async function wixRemoveBrokenLinks(
  apiKey: string,
  siteId: string,
  rawPost: WixRawPost,
  isBrokenUrl: (href: string) => boolean,
  extra?: { supabase?: SupabaseClient; userId?: string },
  deps?: { getCmsPost: typeof _getCmsPostFallback; saveSnapshot: typeof _saveSnapshotFallback }
): Promise<{ removed: number; brokenUrls: string[]; error?: string }> {
  const hdrs = wixHeaders(apiKey, siteId);
  const postId = rawPost.id;

  try {
    const richContentNodes = rawPost.richContentNodes;
    const draftJSContent = rawPost.draftJSContent;
    const contentFormat = rawPost.contentFormat;

    if (richContentNodes.length === 0 && !draftJSContent) {
      return { removed: -1, brokenUrls: [], error: "Pas de contenu dans le post" };
    }

    // ── Snapshot (safety) ──
    if (extra?.supabase && extra?.userId && deps?.getCmsPost && deps?.saveSnapshot) {
      try {
        const currentPost = await deps.getCmsPost(
          { cms: "wix", site_url: "", wix_api_key: apiKey, wix_site_id: siteId } as CmsCredentials,
          postId
        );
        if (currentPost) {
          await deps.saveSnapshot(extra.supabase, extra.userId, currentPost, "cleanup_broken_links");
        }
      } catch { /* non-fatal */ }
    }

    const brokenUrls: string[] = [];
    let removed = 0;

    // ── richContent path ──
    if (contentFormat === "richContent" && richContentNodes.length > 0) {
      function cleanNodes(nodes: WixRichNode[]): WixRichNode[] {
        const result: WixRichNode[] = [];
        for (const node of nodes) {
          if (node.type === "PARAGRAPH" && node.nodes) {
            const textParts = node.nodes.filter((n: WixRichNode) => n.type === "TEXT");
            const fullText = textParts.map((n: WixRichNode) => n.textData?.text ?? "").join("");
            if (fullText.toLowerCase().includes("à lire aussi")) {
              const linkNodes = textParts.filter((n: WixRichNode) =>
                n.textData?.decorations?.some((d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK")
              );
              const allBroken = linkNodes.length > 0 && linkNodes.every((n: WixRichNode) => {
                const linkDecor = n.textData?.decorations?.find((d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK");
                const url = linkDecor?.linkData?.link?.url ?? "";
                return url && isBrokenUrl(url);
              });
              if (allBroken) {
                for (const n of linkNodes) {
                  const url = n.textData?.decorations?.find((d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK")?.linkData?.link?.url ?? "";
                  brokenUrls.push(url);
                  removed++;
                }
                continue;
              }
            }
          }

          if (node.nodes) {
            const cleanedChildren: WixRichNode[] = [];
            for (const child of node.nodes) {
              if (child.type === "TEXT" && child.textData?.decorations) {
                const linkDecor = child.textData.decorations.find(
                  (d: { type: string; linkData?: { link?: { url?: string } } }) => d.type === "LINK"
                );
                if (linkDecor?.linkData?.link?.url && isBrokenUrl(linkDecor.linkData.link.url)) {
                  brokenUrls.push(linkDecor.linkData.link.url);
                  removed++;
                  cleanedChildren.push({
                    ...child,
                    textData: {
                      ...child.textData,
                      decorations: child.textData.decorations.filter(
                        (d: { type: string }) => d.type !== "LINK"
                      ),
                    },
                  });
                  continue;
                }
              }
              if (child.nodes) {
                cleanedChildren.push({ ...child, nodes: cleanNodes(child.nodes) });
              } else {
                cleanedChildren.push(child);
              }
            }
            result.push({ ...node, nodes: cleanedChildren });
          } else {
            result.push(node);
          }
        }
        return result;
      }

      const cleanedNodes = cleanNodes(richContentNodes as WixRichNode[]);
      if (removed === 0) return { removed: 0, brokenUrls: [] };

      const patchResult = await wixPatchContent(hdrs, postId, { richContent: { nodes: cleanedNodes } }, "richContent");
      if (!patchResult.success) {
        return { removed: -1, brokenUrls, error: patchResult.error ?? "PATCH failed" };
      }
      return { removed, brokenUrls };
    }

    // ── DraftJS path ──
    if (contentFormat === "draftJS" && draftJSContent) {
      const blocks = [...(draftJSContent.blocks as WixDraftBlock[])];
      const entityMap = { ...(draftJSContent.entityMap ?? {}) } as Record<string, WixDraftEntity>;

      const brokenEntityKeys = new Set<number>();
      for (const [key, entity] of Object.entries(entityMap)) {
        if (entity.type === "LINK") {
          const url = entity.data?.url ?? entity.data?.href ?? "";
          if (url && isBrokenUrl(url)) {
            brokenEntityKeys.add(Number(key));
            brokenUrls.push(url);
            removed++;
          }
        }
      }

      if (removed === 0) return { removed: 0, brokenUrls: [] };

      const cleanedBlocks = blocks.filter(block => {
        if (block.text.toLowerCase().includes("à lire aussi")) {
          const hasOnlyBrokenLinks = (block.entityRanges ?? []).every(r => brokenEntityKeys.has(r.key));
          if (hasOnlyBrokenLinks && (block.entityRanges ?? []).length > 0) return false;
        }
        return true;
      });

      for (const block of cleanedBlocks) {
        if (block.entityRanges) {
          block.entityRanges = block.entityRanges.filter(r => !brokenEntityKeys.has(r.key));
        }
      }

      const cleanedEntityMap = { ...entityMap };
      for (const key of brokenEntityKeys) {
        delete cleanedEntityMap[String(key)];
      }

      const patchResult = await wixPatchContent(
        hdrs, postId,
        { content: { blocks: cleanedBlocks, entityMap: cleanedEntityMap } },
        "content"
      );
      if (!patchResult.success) {
        return { removed: -1, brokenUrls, error: patchResult.error ?? "PATCH failed" };
      }
      return { removed, brokenUrls };
    }

    return { removed: 0, brokenUrls: [] };
  } catch (err) {
    return { removed: -1, brokenUrls: [], error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Fallback stubs for dependency injection (used by wixRemoveBrokenLinks) ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _getCmsPostFallback(_creds: CmsCredentials, _postId: string | number): Promise<CmsPost | null> {
  return null;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _saveSnapshotFallback(_supabase: SupabaseClient, _userId: string, _post: CmsPost, _actionType: string): Promise<string | null> {
  return null;
}
