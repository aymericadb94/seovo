"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

// Dynamic import — react-force-graph-2d uses canvas and needs browser
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

// ── Types ─────────────────────────────────────────────────────────────────────

type PageProfile = {
  url: string;
  title: string;
  role: "pillar" | "support" | "orphan" | "unknown";
  cluster: string | null;
  outgoing: number;
  incoming: number;
  link_score: number;
  position: number | null;
};

type Suggestion = {
  from_url: string;
  from_title: string;
  to_url: string;
  to_title: string;
  anchor: string;
  placement: string;
  objective: string;
  priority: string;
  justification: string;
  risk_score: number;
};

type ClusterAnalysis = {
  name: string;
  pillar: string;
  pages: string[];
  missing_links: number;
  strength_score: number;
  avg_position: number | null;
  position_trend?: number | null;
  impressions_trend?: number | null;
};

type OrphanPage = { url: string; title: string; reason: string };
type UnderlinkedPage = { url: string; title: string; incoming: number; needed: number };

type ExistingLink = {
  from_url: string;
  from_title: string;
  to_url: string;
  to_title: string;
};

type LinkingData = {
  score: number;
  score_label: string;
  score_comment: string;
  cluster_analysis: ClusterAnalysis[];
  suggestions: Suggestion[];
  existing_links?: ExistingLink[];
  orphan_pages: OrphanPage[];
  underlinked_pages: UnderlinkedPage[];
  page_profiles: PageProfile[];
  opportunities: string[];
};

// Graph types
type GraphNode = {
  id: string;
  label: string;
  role: "pillar" | "support" | "orphan" | "unknown";
  cluster: string | null;
  clusterIdx: number;
  size: number;
  color: string;
  borderColor: string;
  link_score: number;
  position: number | null;
  incoming: number;
  outgoing: number;
  x?: number;
  y?: number;
};

type GraphLink = {
  source: string;
  target: string;
  weight: number;
  type: string;
  color: string;
  curvature: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CLUSTER_COLORS = [
  { main: "#f97316", light: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.5)" },
  { main: "#3b82f6", light: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.5)" },
  { main: "#22c55e", light: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.5)" },
  { main: "#a855f7", light: "rgba(168,85,247,0.15)", border: "rgba(168,85,247,0.5)" },
  { main: "#ec4899", light: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.5)" },
  { main: "#eab308", light: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.5)" },
  { main: "#06b6d4", light: "rgba(6,182,212,0.15)", border: "rgba(6,182,212,0.5)" },
  { main: "#f43f5e", light: "rgba(244,63,94,0.15)", border: "rgba(244,63,94,0.5)" },
];

const ORPHAN_COLOR = { main: "#6b7280", light: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.4)" };

type FilterMode = "all" | "cluster" | "important" | "weak" | "opportunities";

// ── Component ─────────────────────────────────────────────────────────────────

export default function LinkingGraph() {
  const [data, setData] = useState<LinkingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyingNode, setApplyingNode] = useState(false);
  const [appliedLinks, setAppliedLinks] = useState<Set<string>>(new Set()); // track "from|to|anchor"
  const [applyResult, setApplyResult] = useState<{ applied: { from_title: string; to_title: string; anchor: string }[]; skipped: { from_title: string; reason: string }[]; errors: string[] } | null>(null);
  const [nodeApplyResult, setNodeApplyResult] = useState<{ ok: number; skipped: { from_title: string; reason: string }[]; errors: string[] } | null>(null);
  const [linkPopup, setLinkPopup] = useState<{ applied: { from_title: string; to_title: string; anchor: string }[]; skipped: { from_title: string; reason: string }[]; errors: string[] } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  // Store node positions to preserve layout across data refreshes
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Pré-calculer les voisins pour l'effet de focus (existing + suggestions si actives)
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    const addPair = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a)!.add(b);
      map.get(b)!.add(a);
    };
    if (showSuggestions) {
      data.suggestions.forEach(s => addPair(s.from_url, s.to_url));
    }
    (data.existing_links ?? []).forEach(l => addPair(l.from_url, l.to_url));
    return map;
  }, [data, showSuggestions]);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: Math.max(500, Math.min(700, window.innerHeight * 0.65)),
        });
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Configure d3 forces for better spacing ──────────────────────────────
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || !data) return;
    fg.d3Force("charge")?.strength(-250).distanceMax(400);
    fg.d3Force("link")?.distance(80);
    fg.d3Force("center")?.strength(0.05);
  }, [data]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal-linking");
      const json = await res.json();
      if (json.result?.data) {
        setData(json.result.data as LinkingData);
      } else if (json.result) {
        setData(json.result as LinkingData);
      }
    } catch {
      setError("Impossible de charger les données de maillage");
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal-linking", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
      } else if (json.result) {
        setData(json.result as LinkingData);
      }
    } catch {
      setError("Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }

  // ── Apply suggestions to CMS ───────────────────────────────────────────────
  async function applySuggestions() {
    if (!data || selectedSuggestionIds.size === 0) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const toApply = data.suggestions
        .filter((_, i) => selectedSuggestionIds.has(i))
        .map(s => ({
          from_url: s.from_url,
          from_title: s.from_title,
          to_url: s.to_url,
          to_title: s.to_title,
          anchor: s.anchor,
        }));
      const res = await fetch("/api/internal-linking/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions: toApply }),
      });
      const json = await res.json();
      if (json.error) {
        setLinkPopup({ applied: [], skipped: [], errors: [json.error] });
      } else if (json.result) {
        setApplyResult(json.result);
        setLinkPopup({ applied: json.result.applied ?? [], skipped: json.result.skipped ?? [], errors: json.result.errors ?? [] });
        setSelectedSuggestionIds(new Set());
        if ((json.result.applied?.length ?? 0) > 0) {
          setTimeout(() => runAnalysis(), 2000);
        }
      }
    } catch {
      setLinkPopup({ applied: [], skipped: [], errors: ["Erreur lors de l'application"] });
    } finally {
      setApplying(false);
    }
  }

  // Apply specific suggestions (from node detail panel)
  async function applyNodeSuggestions(suggestions: Suggestion[]) {
    if (suggestions.length === 0) return;
    setApplyingNode(true);
    setNodeApplyResult(null);
    try {
      const toApply = suggestions.map(s => ({
        from_url: s.from_url,
        from_title: s.from_title,
        to_url: s.to_url,
        to_title: s.to_title,
        anchor: s.anchor,
      }));
      const res = await fetch("/api/internal-linking/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions: toApply }),
      });
      const json = await res.json();
      if (json.result) {
        const ok = json.result.applied?.length ?? 0;
        setNodeApplyResult({ ok, skipped: json.result.skipped ?? [], errors: json.result.errors ?? [] });
        setLinkPopup({ applied: json.result.applied ?? [], skipped: json.result.skipped ?? [], errors: json.result.errors ?? [] });
        const newApplied = new Set(appliedLinks);
        for (const a of json.result.applied ?? []) {
          newApplied.add(`${a.from_title}|${a.to_title}|${a.anchor}`);
        }
        setAppliedLinks(newApplied);
        if (ok > 0) {
          setTimeout(() => runAnalysis(), 2000);
        }
      } else {
        setLinkPopup({ applied: [], skipped: [], errors: [json.error ?? "Erreur inconnue"] });
      }
    } catch {
      setLinkPopup({ applied: [], skipped: [], errors: ["Erreur réseau"] });
    } finally {
      setApplyingNode(false);
    }
  }

  function toggleSuggestion(idx: number) {
    setSelectedSuggestionIds(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAllSuggestions() {
    if (!data) return;
    const max = Math.min(data.suggestions.length, 20);
    if (selectedSuggestionIds.size === max) {
      setSelectedSuggestionIds(new Set());
    } else {
      setSelectedSuggestionIds(new Set(Array.from({ length: max }, (_, i) => i)));
    }
  }

  // ── Build graph data ──────────────────────────────────────────────────────
  const clusterNames = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.page_profiles.map(p => p.cluster).filter(Boolean))] as string[];
  }, [data]);

  const { nodes, links } = useMemo(() => {
    if (!data) return { nodes: [], links: [] };

    const clusterColorMap = new Map<string, number>();
    clusterNames.forEach((name, i) => clusterColorMap.set(name, i % CLUSTER_COLORS.length));

    // Build nodes
    const allNodes: GraphNode[] = data.page_profiles.map(p => {
      const cIdx = p.cluster ? (clusterColorMap.get(p.cluster) ?? 0) : -1;
      const palette = cIdx >= 0 ? CLUSTER_COLORS[cIdx] : ORPHAN_COLOR;
      const isOrphan = p.role === "orphan" || p.incoming === 0;

      // Size based on importance (larger for readability)
      let size = 7;
      if (p.role === "pillar") size = 14;
      else if (p.link_score > 60) size = 10;
      else if (isOrphan) size = 5;

      // Restore saved position if available (keeps layout stable across refreshes)
      const savedPos = nodePositionsRef.current.get(p.url);

      return {
        id: p.url,
        label: truncate(p.title, 30),
        role: isOrphan ? "orphan" : p.role,
        cluster: p.cluster,
        clusterIdx: cIdx,
        size,
        color: isOrphan ? ORPHAN_COLOR.main : palette.main,
        borderColor: palette.border,
        link_score: p.link_score,
        position: p.position,
        incoming: p.incoming,
        outgoing: p.outgoing,
        ...(savedPos ? { x: savedPos.x, y: savedPos.y, fx: savedPos.x, fy: savedPos.y } : {}),
      };
    });

    // Build links — existing (real) + suggestions (recommended)
    const allLinks: GraphLink[] = [];

    // Existing links from CMS content (real <a> tags)
    const existingLinks = data.existing_links ?? [];
    existingLinks.forEach((l, i) => {
      allLinks.push({
        source: l.from_url,
        target: l.to_url,
        weight: 1.5,
        type: "existing",
        color: "rgba(249,115,22,0.4)",
        curvature: 0.1 + (i % 4) * 0.04,
      });
    });

    // Suggestion links — always in graph data (for layout stability) but rendered differently
    const existingPairs = new Set(existingLinks.map(l => `${l.from_url}|${l.to_url}`));
    data.suggestions.forEach((s, i) => {
      if (existingPairs.has(`${s.from_url}|${s.to_url}`)) return;
      allLinks.push({
        source: s.from_url,
        target: s.to_url,
        weight: s.priority === "haute" ? 1.5 : 1,
        type: "suggestion",
        color: "rgba(255,255,255,0.08)",
        curvature: 0.15 + (i % 3) * 0.05,
      });
    });

    // Filter
    let filteredNodes = allNodes;
    let filteredLinks = allLinks;

    if (filter === "cluster" && selectedCluster) {
      filteredNodes = allNodes.filter(n => n.cluster === selectedCluster);
    } else if (filter === "important") {
      filteredNodes = allNodes.filter(n => n.role === "pillar" || n.link_score >= 50);
    } else if (filter === "weak") {
      filteredNodes = allNodes.filter(n => n.role === "orphan" || n.incoming === 0 || n.link_score < 30);
    } else if (filter === "opportunities") {
      const oppUrls = new Set([
        ...data.orphan_pages.map(o => o.url),
        ...data.underlinked_pages.map(u => u.url),
      ]);
      filteredNodes = allNodes.filter(n => oppUrls.has(n.id));
    }

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    filteredLinks = filteredLinks.filter(l => nodeIds.has(l.source as string) && nodeIds.has(l.target as string));

    return { nodes: filteredNodes, links: filteredLinks };
  }, [data, filter, selectedCluster, clusterNames]);

  // (drawPill removed — using roundRect cards now)

  // (Animation frame counter removed — cards don't pulse)

  // ── Node rendering — compact dots with label on hover ────────────────────
  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D) => {
    const { x = 0, y = 0, role } = node;
    const hovered = hoveredNodeRef.current;
    const isHovered = hovered?.id === node.id;
    const isSelected = selectedNode?.id === node.id;
    const isHighlighted = isHovered || isSelected;

    const activeNode = hovered || selectedNode;
    const isNeighbor = activeNode
      ? neighborMap.get(activeNode.id)?.has(node.id) ?? false
      : false;
    const isDimmed = activeNode && !isHighlighted && !isNeighbor;

    ctx.globalAlpha = isDimmed ? 0.15 : 1;

    const isLinked = node.incoming > 0 || node.outgoing > 0;
    const isPillar = role === "pillar";

    // ── Circle radius based on importance ──
    const baseR = isPillar ? 14 : isLinked ? 10 : 7;
    const r = isHighlighted ? baseR + 3 : baseR;

    // ── Glow ──
    if (!isDimmed && (isLinked || isHighlighted)) {
      const glowR = r + (isHighlighted ? 16 : 8);
      const gradient = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR);
      const alpha = isHighlighted ? 0.35 : 0.12;
      gradient.addColorStop(0, `rgba(249,115,22,${alpha})`);
      gradient.addColorStop(1, "rgba(249,115,22,0)");
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, 2 * Math.PI);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // ── Circle body ──
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);

    if (isLinked || isPillar) {
      ctx.fillStyle = isHighlighted ? "#f97316"
        : isPillar ? "rgba(249,115,22,0.85)"
        : "rgba(249,115,22,0.5)";
    } else {
      ctx.fillStyle = isHighlighted ? "rgba(100,116,139,0.9)" : "rgba(71,85,105,0.5)";
    }
    ctx.fill();

    // Border
    ctx.strokeStyle = isHighlighted ? "#fff"
      : isPillar ? "rgba(249,115,22,0.5)"
      : isLinked ? "rgba(249,115,22,0.2)"
      : "rgba(100,116,139,0.3)";
    ctx.lineWidth = isHighlighted ? 2.5 : isPillar ? 2 : 1;
    ctx.stroke();

    // ── Pillar "P" inside ──
    if (isPillar) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${isHighlighted ? 11 : 9}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("P", x, y + 0.5);
    }

    // ── Link count inside circle (non-pillar linked pages) ──
    if (isLinked && !isPillar && !isHighlighted) {
      const total = node.incoming + node.outgoing;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = "bold 7px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(total), x, y + 0.5);
    }

    // ── Label + stats tooltip on hover/selected/neighbor ──
    if (isHighlighted || (isNeighbor && !!activeNode)) {
      const label = node.label;
      const fontSize = isHighlighted ? 11 : 9;
      ctx.font = `${isHighlighted ? "bold " : ""}${fontSize}px Inter, system-ui, sans-serif`;
      const textW = ctx.measureText(label).width;
      const padX = 8, padY = 4;
      const bgW = textW + padX * 2;
      const bgH = fontSize + padY * 2;
      const labelY = y - r - 8;

      // Background
      ctx.beginPath();
      ctx.roundRect(x - bgW / 2, labelY - bgH, bgW, bgH, 6);
      ctx.fillStyle = isHighlighted ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.75)";
      ctx.fill();
      if (isHighlighted) {
        ctx.strokeStyle = "rgba(249,115,22,0.4)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Text
      ctx.fillStyle = isHighlighted ? "#fff" : "rgba(255,255,255,0.85)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, labelY - bgH / 2);

      // Stats badge below node on highlight
      if (isHighlighted) {
        const stats = `${node.incoming} entrant${node.incoming !== 1 ? "s" : ""} · ${node.outgoing} sortant${node.outgoing !== 1 ? "s" : ""}`;
        ctx.font = "9px Inter, system-ui, sans-serif";
        const sW = ctx.measureText(stats).width + 12;
        const sH = 16;
        const sY = y + r + 6;
        ctx.beginPath();
        ctx.roundRect(x - sW / 2, sY, sW, sH, 4);
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(stats, x, sY + sH / 2);
      }
    }

    ctx.globalAlpha = 1;
  }, [selectedNode, neighborMap]);

  // ── Link rendering — existing (solid orange) vs suggestions (dashed grey) ─
  const showSuggestionsRef = useRef(showSuggestions);
  showSuggestionsRef.current = showSuggestions;

  const paintLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D) => {
    const src = link.source as unknown as GraphNode;
    const tgt = link.target as unknown as GraphNode;
    const sx = src?.x ?? 0, sy = src?.y ?? 0, tx = tgt?.x ?? 0, ty = tgt?.y ?? 0;
    if (sx === 0 && sy === 0 && tx === 0 && ty === 0) return;

    const isExisting = link.type === "existing";

    // Hide suggestion links when panel is closed
    if (!isExisting && !showSuggestionsRef.current) {
      ctx.globalAlpha = 1;
      return;
    }

    const hovered = hoveredNodeRef.current;
    const activeNode = hovered || selectedNode;
    const isRelated = activeNode && (src.id === activeNode.id || tgt.id === activeNode.id);
    const isDimmed = activeNode && !isRelated;

    ctx.globalAlpha = isDimmed ? 0.04 : 1;

    // Curved line with control point
    const dx = tx - sx, dy = ty - sy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) { ctx.globalAlpha = 1; return; }
    const curveOffset = dist * 0.15 * link.curvature;
    const mx = (sx + tx) / 2 - dy / dist * curveOffset;
    const my = (sy + ty) / 2 + dx / dist * curveOffset;

    // Glow for existing active links
    if (isRelated && isExisting) {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, tx, ty);
      ctx.strokeStyle = "rgba(249,115,22,0.3)";
      ctx.lineWidth = link.weight * 4;
      ctx.stroke();
    }

    // Main line
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, tx, ty);

    if (isExisting) {
      ctx.strokeStyle = isRelated ? "rgba(249,115,22,0.9)" : "rgba(249,115,22,0.3)";
      ctx.lineWidth = isRelated ? link.weight * 1.8 : link.weight;
    } else {
      // Suggestions: dashed, blue-ish
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = isRelated ? "rgba(59,130,246,0.6)" : "rgba(59,130,246,0.15)";
      ctx.lineWidth = isRelated ? 1.5 : 0.8;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow at midpoint (only for existing links or related suggestions)
    if (isExisting || isRelated) {
      const t = 0.55;
      const arrowX = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * tx;
      const arrowY = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ty;
      const tangentX = 2 * (1 - t) * (mx - sx) + 2 * t * (tx - mx);
      const tangentY = 2 * (1 - t) * (my - sy) + 2 * t * (ty - my);
      const angle = Math.atan2(tangentY, tangentX);
      const arrowLen = isRelated ? 6 : 4;

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - arrowLen * Math.cos(angle - Math.PI / 6), arrowY - arrowLen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - arrowLen * Math.cos(angle + Math.PI / 6), arrowY - arrowLen * Math.sin(angle + Math.PI / 6));
      ctx.strokeStyle = isExisting
        ? (isRelated ? "rgba(249,115,22,0.7)" : "rgba(249,115,22,0.2)")
        : "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }, [selectedNode]);

  // ── Get suggestions for selected node ─────────────────────────────────────
  const selectedSuggestions = useMemo(() => {
    if (!data || !selectedNode) return { incoming: [] as Suggestion[], outgoing: [] as Suggestion[] };
    return {
      incoming: data.suggestions.filter(s => s.to_url === selectedNode.id),
      outgoing: data.suggestions.filter(s => s.from_url === selectedNode.id),
    };
  }, [data, selectedNode]);

  // ── Insights ──────────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!data) return [];
    const items: { icon: string; label: string; type: "warning" | "info" | "success" }[] = [];

    if (data.orphan_pages.length > 0) {
      items.push({ icon: "⚠", label: `${data.orphan_pages.length} page(s) orpheline(s)`, type: "warning" });
    }
    if (data.underlinked_pages.length > 0) {
      items.push({ icon: "🔗", label: `${data.underlinked_pages.length} page(s) sous-liée(s)`, type: "warning" });
    }

    const weakClusters = data.cluster_analysis.filter(c => c.strength_score < 40);
    if (weakClusters.length > 0) {
      items.push({ icon: "📊", label: `${weakClusters.length} cluster(s) faible(s)`, type: "warning" });
    }

    const overlinked = data.page_profiles.filter(p => p.outgoing > 5);
    if (overlinked.length > 0) {
      items.push({ icon: "🔴", label: `${overlinked.length} page(s) sur-liée(s)`, type: "info" });
    }

    if (data.score >= 70) {
      items.push({ icon: "✓", label: "Maillage en bonne santé", type: "success" });
    }

    return items;
  }, [data]);

  // ── Analysis animation (canvas network) ───────────────────────────────────
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const analysisFrameRef = useRef<number>(0);
  const [analysisPhase, setAnalysisPhase] = useState("");

  useEffect(() => {
    if (!loading) { analysisFrameRef.current = 0; return; }

    // Cycle through analysis phases
    const phases = [
      "Scan des pages CMS...",
      "Extraction des liens existants...",
      "Analyse des clusters sémantiques...",
      "Détection des pages orphelines...",
      "Calcul du score de maillage...",
      "Génération des suggestions...",
      "Finalisation de l'analyse...",
    ];
    let phaseIdx = 0;
    setAnalysisPhase(phases[0]);
    const phaseTimer = setInterval(() => {
      phaseIdx = (phaseIdx + 1) % phases.length;
      setAnalysisPhase(phases[phaseIdx]);
    }, 2800);

    // Canvas animation
    const canvas = analysisCanvasRef.current;
    if (!canvas) { return () => clearInterval(phaseTimer); }
    const ctx = canvas.getContext("2d");
    if (!ctx) { return () => clearInterval(phaseTimer); }

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.parentElement?.offsetWidth ?? 800;
    const H = 420;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    // Generate nodes
    type ANode = { x: number; y: number; vx: number; vy: number; r: number; phase: number; connected: boolean; pulse: number; color: string };
    const nodeCount = 28;
    const nodes: ANode[] = [];
    const colors = ["#f97316", "#ef4444", "#fb923c", "#f59e0b", "#ec4899", "#3b82f6", "#22c55e", "#a855f7"];
    for (let i = 0; i < nodeCount; i++) {
      const connected = Math.random() > 0.35;
      nodes.push({
        x: 60 + Math.random() * (W - 120),
        y: 40 + Math.random() * (H - 80),
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: connected ? 6 + Math.random() * 6 : 3 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        connected,
        pulse: 0,
        color: connected ? colors[i % colors.length] : "#4b5563",
      });
    }

    // Generate edges (will animate in)
    type AEdge = { a: number; b: number; progress: number; delay: number; color: string };
    const edges: AEdge[] = [];
    const connectedIdxs = nodes.map((n, i) => n.connected ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < connectedIdxs.length; i++) {
      for (let j = i + 1; j < connectedIdxs.length; j++) {
        const ni = nodes[connectedIdxs[i]], nj = nodes[connectedIdxs[j]];
        const dist = Math.hypot(ni.x - nj.x, ni.y - nj.y);
        if (dist < 220 && Math.random() > 0.4) {
          edges.push({
            a: connectedIdxs[i], b: connectedIdxs[j],
            progress: 0,
            delay: 0.5 + Math.random() * 3,
            color: ni.color,
          });
        }
      }
    }

    let t = 0;
    function draw() {
      if (!ctx) return;
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      // Move nodes gently
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 30 || n.x > W - 30) n.vx *= -1;
        if (n.y < 30 || n.y > H - 30) n.vy *= -1;
        n.pulse = Math.sin(t * 2 + n.phase) * 0.5 + 0.5;
      }

      // Draw edges with animated progress
      for (const e of edges) {
        if (t < e.delay) continue;
        e.progress = Math.min(1, (t - e.delay) * 0.5);
        const na = nodes[e.a], nb = nodes[e.b];

        // Curved line
        const mx = (na.x + nb.x) / 2 + Math.sin(t * 0.5 + e.delay) * 15;
        const my = (na.y + nb.y) / 2 + Math.cos(t * 0.3 + e.delay) * 10;

        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.quadraticCurveTo(mx, my, na.x + (nb.x - na.x) * e.progress, na.y + (nb.y - na.y) * e.progress);
        ctx.strokeStyle = e.color + Math.round(30 + e.progress * 40).toString(16).padStart(2, "0");
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Traveling particle on complete edges
        if (e.progress >= 1) {
          const pt = (t * 0.4 + e.delay) % 1;
          const px = na.x + (nb.x - na.x) * pt;
          const py = na.y + (nb.y - na.y) * pt;
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fillStyle = e.color;
          ctx.fill();
        }
      }

      // Draw nodes as pills
      for (const n of nodes) {
        const pw = n.r * 2.5;
        const ph = n.r * 1.2;
        const radius = ph / 2;
        const glow = n.connected ? n.pulse * 0.6 + 0.2 : 0;

        // Glow
        if (glow > 0) {
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 12 * glow;
        }

        // Pill shape
        ctx.beginPath();
        ctx.moveTo(n.x - pw / 2 + radius, n.y - ph / 2);
        ctx.lineTo(n.x + pw / 2 - radius, n.y - ph / 2);
        ctx.arc(n.x + pw / 2 - radius, n.y, radius, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(n.x - pw / 2 + radius, n.y + ph / 2);
        ctx.arc(n.x - pw / 2 + radius, n.y, radius, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();

        if (n.connected) {
          const grad = ctx.createLinearGradient(n.x - pw / 2, n.y, n.x + pw / 2, n.y);
          grad.addColorStop(0, n.color);
          grad.addColorStop(1, n.color + "99");
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = "#374151";
        }
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Inner shine
        if (n.connected) {
          ctx.beginPath();
          ctx.moveTo(n.x - pw / 4, n.y - ph / 4);
          ctx.lineTo(n.x + pw / 4, n.y - ph / 4);
          ctx.arc(n.x + pw / 4, n.y - ph / 8, ph / 6, -Math.PI / 2, Math.PI / 2);
          ctx.lineTo(n.x - pw / 4, n.y + ph / 12);
          ctx.arc(n.x - pw / 4, n.y - ph / 8, ph / 6, Math.PI / 2, -Math.PI / 2);
          ctx.closePath();
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fill();
        }
      }

      // Central scan ring
      const ringR = 60 + Math.sin(t * 1.5) * 20;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249,115,22,${0.06 + Math.sin(t * 2) * 0.04})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Expanding scan wave
      const waveR = ((t * 40) % 250);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, waveR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249,115,22,${Math.max(0, 0.15 - waveR / 2000)})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      analysisFrameRef.current = requestAnimationFrame(draw);
    }

    analysisFrameRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(analysisFrameRef.current);
      clearInterval(phaseTimer);
    };
  }, [loading]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="relative rounded-2xl overflow-hidden" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <canvas ref={analysisCanvasRef} className="w-full" style={{ height: 420 }} />
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)", backdropFilter: "blur(12px)" }}>
              <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 animate-pulse">
                <circle cx="5" cy="12" r="2" stroke="#f97316" strokeWidth="1.5" />
                <circle cx="19" cy="6" r="2" stroke="#f97316" strokeWidth="1.5" />
                <circle cx="19" cy="18" r="2" stroke="#f97316" strokeWidth="1.5" />
                <path d="M7 12h8m-3-4l3 4-3 4" stroke="#f97316" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="absolute -inset-3 rounded-3xl animate-ping" style={{ border: "1px solid rgba(249,115,22,0.15)" }} />
          </div>
          <p className="text-white font-black text-sm mb-2 tracking-wide" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>Analyse du maillage en cours</p>
          <p className="text-orange-400/80 text-xs font-medium animate-pulse" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>{analysisPhase}</p>
          <div className="mt-4 w-48 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full animate-[indeterminate_2s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, #f97316, transparent)", width: "40%" }} />
          </div>
        </div>
        <style jsx>{`
          @keyframes indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(350%); }
          }
        `}</style>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.15)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="1.5" className="w-9 h-9">
            <circle cx="5" cy="12" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 12h8m-3-4l3 4-3 4" />
          </svg>
        </div>
        <p className="text-white font-bold mb-2">Visualisez votre maillage interne</p>
        <p className="text-gray-500 text-xs mb-6 max-w-sm mx-auto">
          Analysez les connexions entre vos pages, détectez les pages orphelines et optimisez votre structure SEO.
        </p>
        {error && (
          <p className="text-red-400 text-xs mb-4">{error}</p>
        )}
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="relative overflow-hidden px-8 py-3.5 rounded-xl text-sm font-black text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 8px 32px rgba(249,115,22,0.35)" }}
        >
          <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
          <span className="relative">Analyser mon maillage interne →</span>
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Score maillage"
          value={data.score}
          suffix="/100"
          color={data.score >= 70 ? "#22c55e" : data.score >= 40 ? "#f97316" : "#ef4444"}
          sub={data.score_label}
        />
        <KpiCard
          label="Pages analysées"
          value={data.page_profiles.length}
          color="#3b82f6"
          sub={`${data.cluster_analysis.length} clusters`}
        />
        <KpiCard
          label="Liens suggérés"
          value={data.suggestions.length}
          color="#f97316"
          sub={`${data.suggestions.filter(s => s.priority === "haute").length} prioritaires`}
        />
        <KpiCard
          label="Pages orphelines"
          value={data.orphan_pages.length}
          color={data.orphan_pages.length > 0 ? "#ef4444" : "#22c55e"}
          sub={data.orphan_pages.length === 0 ? "Aucune" : "À corriger"}
        />
      </div>

      {/* ── Insights bar ─────────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {insights.map((insight, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: insight.type === "warning" ? "rgba(239,68,68,0.08)" : insight.type === "success" ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
                border: `1px solid ${insight.type === "warning" ? "rgba(239,68,68,0.2)" : insight.type === "success" ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)"}`,
                color: insight.type === "warning" ? "#ef4444" : insight.type === "success" ? "#22c55e" : "#3b82f6",
              }}
            >
              <span>{insight.icon}</span> {insight.label}
            </span>
          ))}
        </div>
      )}

      {/* ── Relaunch banner (when data seems stale) ────────────────────── */}
      {data && (data.existing_links ?? []).length === 0 && data.page_profiles.every(p => p.incoming === 0) && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)" }}>
          <span className="text-orange-400 text-sm">⚠️</span>
          <span className="text-orange-300 text-xs font-medium flex-1">Les données semblent obsolètes — relancez l{"'"}analyse pour détecter les vrais liens entre vos pages.</span>
          <button
            onClick={() => { runAnalysis(); }}
            disabled={loading}
            className="shrink-0 px-4 py-2 rounded-lg text-xs font-black text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 4px 16px rgba(249,115,22,0.3)" }}
          >
            {loading ? "Analyse en cours..." : "🔄 Relancer l'analyse"}
          </button>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "all", label: "Tout" },
          { key: "cluster", label: "Par cluster" },
          { key: "important", label: "Pages fortes" },
          { key: "weak", label: "Pages faibles" },
          { key: "opportunities", label: "Opportunités" },
        ] as { key: FilterMode; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); if (f.key !== "cluster") setSelectedCluster(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              filter === f.key
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-gray-300"
            }`}
          >
            {f.label}
          </button>
        ))}

        {filter === "cluster" && (
          <div className="flex gap-1.5 ml-2">
            {clusterNames.map((name, i) => (
              <button
                key={name}
                onClick={() => setSelectedCluster(name === selectedCluster ? null : name)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                  selectedCluster === name ? "text-white" : "text-gray-500 hover:text-gray-300"
                }`}
                style={{
                  background: selectedCluster === name ? CLUSTER_COLORS[i % CLUSTER_COLORS.length].main + "33" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedCluster === name ? CLUSTER_COLORS[i % CLUSTER_COLORS.length].main + "55" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                {truncate(name, 20)}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              showSuggestions
                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                : "bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-gray-300"
            }`}
          >
            Suggestions
          </button>
          <button
            onClick={() => { runAnalysis(); }}
            disabled={loading}
            className="px-4 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(239,68,68,0.15))",
              border: "1px solid rgba(249,115,22,0.3)",
              color: "#fb923c",
            }}
          >
            {loading ? "⏳ Analyse..." : "🔄 Relancer l'analyse"}
          </button>
        </div>
      </div>

      {/* ── Graph + Detail panel ─────────────────────────────────────────── */}
      <div className="flex gap-4">
        {/* Graph */}
        <div
          ref={containerRef}
          className="flex-1 relative rounded-2xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Re-analysis overlay */}
          {loading && data && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
              <canvas ref={analysisCanvasRef} className="absolute inset-0 w-full h-full opacity-40" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="relative mb-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)", backdropFilter: "blur(12px)" }}>
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 animate-pulse">
                      <circle cx="5" cy="12" r="2" stroke="#f97316" strokeWidth="1.5" />
                      <circle cx="19" cy="6" r="2" stroke="#f97316" strokeWidth="1.5" />
                      <circle cx="19" cy="18" r="2" stroke="#f97316" strokeWidth="1.5" />
                      <path d="M7 12h8m-3-4l3 4-3 4" stroke="#f97316" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="absolute -inset-2 rounded-2xl animate-ping" style={{ border: "1px solid rgba(249,115,22,0.12)" }} />
                </div>
                <p className="text-white font-black text-sm mb-1.5 tracking-wide">Re-analyse en cours</p>
                <p className="text-orange-400/70 text-xs font-medium animate-pulse">{analysisPhase}</p>
                <div className="mt-3 w-40 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full animate-[indeterminate_2s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, #f97316, transparent)", width: "40%" }} />
                </div>
              </div>
              <style jsx>{`
                @keyframes indeterminate {
                  0% { transform: translateX(-100%); }
                  100% { transform: translateX(350%); }
                }
              `}</style>
            </div>
          )}
          {/* Legend */}
          <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 bg-black/50 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-2.5 rounded-full" style={{ background: "linear-gradient(90deg, #f97316, #ef4444)", boxShadow: "0 0 8px rgba(249,115,22,0.5)" }} />
              <span className="text-[10px] text-gray-400 font-medium">Page maillée</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative w-7 h-3 rounded-full" style={{ background: "linear-gradient(90deg, #f97316, #ef4444)", boxShadow: "0 0 8px rgba(249,115,22,0.5)" }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              </div>
              <span className="text-[10px] text-gray-400 font-medium">Pilier</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-2 rounded-full" style={{ background: "#4b5563" }} />
              <span className="text-[10px] text-gray-400 font-medium">Orpheline</span>
            </div>
            <div className="mt-1 pt-1 border-t border-white/[0.06] flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-0.5" style={{ background: "rgba(249,115,22,0.5)" }} />
                <span className="text-[10px] text-gray-500">Lien existant</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-0" style={{ borderTop: "1px dashed rgba(255,255,255,0.2)" }} />
                <span className="text-[10px] text-gray-500">Suggestion</span>
              </div>
            </div>
          </div>

          {/* Hover tooltip */}
          {hoveredNode && !selectedNode && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{ top: 12, right: 12 }}
            >
              <div className="bg-[#111]/95 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 shadow-2xl max-w-[220px]">
                <p className="text-white font-bold text-xs mb-1.5 leading-tight">{hoveredNode.label}</p>
                <div className="space-y-1">
                  <MiniStat label="Rôle" value={roleLabel(hoveredNode.role)} />
                  {hoveredNode.cluster && <MiniStat label="Cluster" value={truncate(hoveredNode.cluster, 18)} />}
                  {hoveredNode.position && <MiniStat label="Position GSC" value={`#${hoveredNode.position}`} />}
                  <MiniStat label="Liens entrants" value={String(hoveredNode.incoming)} />
                  <MiniStat label="Liens sortants" value={String(hoveredNode.outgoing)} />
                  <MiniStat label="Score lien" value={`${hoveredNode.link_score}/100`} />
                </div>
              </div>
            </div>
          )}

          <ForceGraph2D
            ref={graphRef}
            graphData={{ nodes, links }}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="transparent"
            nodeCanvasObject={(node, ctx) => paintNode(node as unknown as GraphNode, ctx)}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as unknown as GraphNode;
              const isPillar = n.role === "pillar";
              const isLinked = n.incoming > 0 || n.outgoing > 0;
              const r = (isPillar ? 14 : isLinked ? 10 : 7) + 8; // generous padding
              const x = n.x ?? 0, y = n.y ?? 0;
              ctx.beginPath();
              ctx.arc(x, y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkCanvasObject={(link, ctx) => paintLink(link as unknown as GraphLink, ctx)}
            onNodeHover={(node) => {
              const gn = node as GraphNode | null;
              hoveredNodeRef.current = gn;
              // Debounce le tooltip React (state) pour éviter le flickering
              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
              if (gn) {
                hoverTimeoutRef.current = setTimeout(() => setHoveredNode(gn), 80);
              } else {
                hoverTimeoutRef.current = setTimeout(() => setHoveredNode(null), 120);
              }
            }}
            onNodeClick={(node) => {
              setSelectedNode(prev => prev?.id === (node as GraphNode).id ? null : node as GraphNode);
              setNodeApplyResult(null);
            }}
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.3}
            cooldownTicks={150}
            d3AlphaMin={0.005}
            warmupTicks={30}
            onEngineStop={() => {
              const fg = graphRef.current;
              if (!fg) return;
              // Wait a tick to ensure positions are finalized
              setTimeout(() => {
                const gd = fg.graphData();
                if (!gd?.nodes?.length) return;
                // Only freeze if nodes have spread (not all at origin)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hasSpread = gd.nodes.some((n: any) => Math.abs(n.x ?? 0) > 5 || Math.abs(n.y ?? 0) > 5);
                if (!hasSpread) return;
                fg.zoomToFit(400, 40);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                gd.nodes.forEach((n: any) => {
                  n.fx = n.x;
                  n.fy = n.y;
                  if (n.id && n.x != null && n.y != null) {
                    nodePositionsRef.current.set(n.id, { x: n.x, y: n.y });
                  }
                });
              }, 100);
            }}
            minZoom={0.5}
            maxZoom={3}
            enableZoomInteraction={true}
            enablePanInteraction={true}
            enableNodeDrag={false}
          />
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-72 flex-shrink-0 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 overflow-y-auto" style={{ maxHeight: dimensions.height }}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                selectedNode.role === "pillar" ? "bg-orange-500/15 text-orange-400" :
                selectedNode.role === "orphan" ? "bg-red-500/15 text-red-400" :
                "bg-blue-500/15 text-blue-400"
              }`}>
                {roleLabel(selectedNode.role)}
              </span>
              <button onClick={() => setSelectedNode(null)} className="text-gray-600 hover:text-gray-300 text-xs">✕</button>
            </div>

            <p className="text-white font-bold text-sm mb-1 leading-tight">{selectedNode.label}</p>
            {selectedNode.cluster && (
              <p className="text-gray-500 text-xs mb-3">Cluster : {selectedNode.cluster}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <StatBox label="Score" value={`${selectedNode.link_score}`} color={selectedNode.link_score >= 60 ? "#22c55e" : selectedNode.link_score >= 30 ? "#f97316" : "#ef4444"} />
              <StatBox label="Position" value={selectedNode.position ? `#${selectedNode.position}` : "—"} color="#3b82f6" />
              <StatBox label="Entrants" value={String(selectedNode.incoming)} color="#a855f7" />
              <StatBox label="Sortants" value={String(selectedNode.outgoing)} color="#06b6d4" />
            </div>

            {/* Apply result feedback */}
            {nodeApplyResult && (
              <div className={`rounded-lg p-2 mb-3 text-[10px] space-y-1 ${nodeApplyResult.ok > 0 ? "bg-green-500/10 border border-green-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                {nodeApplyResult.ok > 0 && (
                  <p className="text-green-400 font-bold">{nodeApplyResult.ok} lien(s) appliqué(s)</p>
                )}
                {nodeApplyResult.skipped.map((s, i) => (
                  <p key={i} className="text-yellow-400/80">{s.from_title} : {s.reason}</p>
                ))}
                {nodeApplyResult.errors.map((e, i) => (
                  <p key={i} className="text-red-400">{e}</p>
                ))}
              </div>
            )}

            {/* All suggestions for this node */}
            {(selectedSuggestions.incoming.length > 0 || selectedSuggestions.outgoing.length > 0) && (
              <button
                onClick={() => applyNodeSuggestions([...selectedSuggestions.incoming, ...selectedSuggestions.outgoing])}
                disabled={applyingNode}
                className="w-full mb-3 px-3 py-2 rounded-xl text-[10px] font-bold transition-all disabled:opacity-40 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-400 hover:to-amber-400"
              >
                {applyingNode ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Application...
                  </span>
                ) : (
                  `Appliquer tous les liens (${selectedSuggestions.incoming.length + selectedSuggestions.outgoing.length})`
                )}
              </button>
            )}

            {/* Incoming suggestions */}
            {selectedSuggestions.incoming.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Liens entrants suggérés</p>
                {selectedSuggestions.incoming.map((s, i) => {
                  const key = `${s.from_title}|${s.to_title}|${s.anchor}`;
                  const done = appliedLinks.has(key);
                  return (
                    <div key={i} className={`flex items-center gap-2 py-1.5 border-b border-white/[0.03] last:border-0 ${done ? "opacity-40" : ""}`}>
                      <span className="text-[10px] text-green-400">←</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 text-[10px] truncate">{s.from_title}</p>
                        <p className="text-orange-400/70 text-[10px] truncate">ancre : {s.anchor}</p>
                      </div>
                      {done ? (
                        <span className="text-green-400 text-[10px]">✓</span>
                      ) : (
                        <button
                          onClick={() => applyNodeSuggestions([s])}
                          disabled={applyingNode}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-30 flex-shrink-0"
                        >
                          Appliquer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Outgoing suggestions */}
            {selectedSuggestions.outgoing.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Liens sortants suggérés</p>
                {selectedSuggestions.outgoing.map((s, i) => {
                  const key = `${s.from_title}|${s.to_title}|${s.anchor}`;
                  const done = appliedLinks.has(key);
                  return (
                    <div key={i} className={`flex items-center gap-2 py-1.5 border-b border-white/[0.03] last:border-0 ${done ? "opacity-40" : ""}`}>
                      <span className="text-[10px] text-blue-400">→</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-300 text-[10px] truncate">{s.to_title}</p>
                        <p className="text-orange-400/70 text-[10px] truncate">ancre : {s.anchor}</p>
                      </div>
                      {done ? (
                        <span className="text-green-400 text-[10px]">✓</span>
                      ) : (
                        <button
                          onClick={() => applyNodeSuggestions([s])}
                          disabled={applyingNode}
                          className="px-2 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-30 flex-shrink-0"
                        >
                          Appliquer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedSuggestions.incoming.length === 0 && selectedSuggestions.outgoing.length === 0 && (
              <p className="text-gray-600 text-xs">Aucune suggestion de lien pour cette page.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Suggestions table ────────────────────────────────────────────── */}
      {showSuggestions && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white font-bold text-sm">Suggestions de maillage</p>
              <p className="text-gray-500 text-xs">{data.suggestions.length} lien(s) recommandé(s) — sélectionnez puis appliquez</p>
            </div>
            <div className="flex items-center gap-3">
              {selectedSuggestionIds.size > 0 && (
                <span className="text-xs text-blue-400">{selectedSuggestionIds.size} sélectionné(s)</span>
              )}
              <button
                onClick={applySuggestions}
                disabled={applying || selectedSuggestionIds.size === 0}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-400 hover:to-amber-400 shadow-lg shadow-orange-500/20"
              >
                {applying ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Application en cours...
                  </span>
                ) : (
                  `Appliquer ${selectedSuggestionIds.size > 0 ? `(${selectedSuggestionIds.size})` : "les liens"}`
                )}
              </button>
            </div>
          </div>

          {/* Apply result feedback */}
          {applyResult && (
            <div className="mb-4 rounded-xl border p-3 text-xs space-y-1" style={{
              borderColor: applyResult.errors.length > 0 ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)",
              background: applyResult.errors.length > 0 ? "rgba(239,68,68,0.05)" : "rgba(34,197,94,0.05)",
            }}>
              {applyResult.applied.length > 0 && (
                <p className="text-green-400 font-bold">
                  {applyResult.applied.length} lien(s) appliqué(s) avec succès
                </p>
              )}
              {applyResult.applied.map((a, i) => (
                <p key={i} className="text-green-400/70 pl-3">
                  {a.from_title} → {a.to_title} <span className="text-green-400/50">({a.anchor})</span>
                </p>
              ))}
              {applyResult.skipped.length > 0 && (
                <p className="text-yellow-400/70">{applyResult.skipped.length} ignoré(s) : {applyResult.skipped.map(s => s.reason).join(", ")}</p>
              )}
              {applyResult.errors.map((e, i) => (
                <p key={i} className="text-red-400">{e}</p>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={selectedSuggestionIds.size === Math.min(data.suggestions.length, 20) && data.suggestions.length > 0}
                      onChange={toggleAllSuggestions}
                      className="rounded border-white/20 bg-white/5 text-orange-500 focus:ring-orange-500/30 cursor-pointer"
                    />
                  </th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Source</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Cible</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Ancre</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Priorité</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2">Risque</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestions.slice(0, 20).map((s, i) => (
                  <tr
                    key={i}
                    className={`border-b border-white/[0.03] cursor-pointer transition-colors ${selectedSuggestionIds.has(i) ? "bg-orange-500/[0.06]" : "hover:bg-white/[0.02]"}`}
                    onClick={() => toggleSuggestion(i)}
                  >
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedSuggestionIds.has(i)}
                        onChange={() => toggleSuggestion(i)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-white/20 bg-white/5 text-orange-500 focus:ring-orange-500/30 cursor-pointer"
                      />
                    </td>
                    <td className="py-2 pr-3 text-gray-300">{truncate(s.from_title, 25)}</td>
                    <td className="py-2 pr-3 text-gray-300">{truncate(s.to_title, 25)}</td>
                    <td className="py-2 pr-3">
                      <span className="text-orange-400/80 bg-orange-500/10 px-1.5 py-0.5 rounded">{s.anchor}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`font-bold ${s.priority === "haute" ? "text-red-400" : s.priority === "moyenne" ? "text-orange-400" : "text-gray-500"}`}>
                        {s.priority}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className={`font-bold ${s.risk_score <= 20 ? "text-green-400" : s.risk_score <= 50 ? "text-orange-400" : "text-red-400"}`}>
                        {s.risk_score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Cluster strength cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.cluster_analysis.map((cluster, i) => (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 cursor-pointer hover:bg-white/[0.05] transition-all"
            onClick={() => { setFilter("cluster"); setSelectedCluster(cluster.name); }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: CLUSTER_COLORS[i % CLUSTER_COLORS.length].main }}
              />
              <p className="text-white font-bold text-xs truncate">{cluster.name}</p>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-gray-500 text-[10px] uppercase tracking-wider">Force</p>
                <p className="text-white font-black text-lg">{cluster.strength_score}<span className="text-gray-600 text-xs">/100</span></p>
              </div>
              <div className="text-right">
                <p className="text-gray-600 text-[10px]">{cluster.pages.length} pages</p>
                <p className="text-gray-600 text-[10px]">{cluster.missing_links} liens manquants</p>
                {cluster.avg_position && (
                  <p className="text-gray-600 text-[10px]">
                    pos. moy. #{cluster.avg_position}
                    {cluster.position_trend != null && cluster.position_trend !== 0 && (
                      <span style={{ color: cluster.position_trend < 0 ? "#4ade80" : "#ef4444", marginLeft: 4 }}>
                        {cluster.position_trend < 0 ? "↑" : "↓"}{Math.abs(cluster.position_trend)}
                      </span>
                    )}
                  </p>
                )}
                {cluster.impressions_trend != null && cluster.impressions_trend !== 0 && (
                  <p className="text-[10px]" style={{ color: cluster.impressions_trend > 0 ? "#4ade80" : "#ef4444" }}>
                    {cluster.impressions_trend > 0 ? "+" : ""}{cluster.impressions_trend}% impressions
                  </p>
                )}
              </div>
            </div>
            {/* Strength bar */}
            <div className="mt-2 h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${cluster.strength_score}%`,
                  background: CLUSTER_COLORS[i % CLUSTER_COLORS.length].main,
                  transition: "width 0.8s ease-out",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* ── Opportunities ────────────────────────────────────────────────── */}
      {data.opportunities && data.opportunities.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
          <p className="text-gray-500 text-[10px] font-black uppercase tracking-wider mb-3">Opportunités stratégiques</p>
          <div className="space-y-2">
            {data.opportunities.map((opp, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="text-orange-400 text-xs mt-0.5">→</span>
                <p className="text-gray-300 text-xs leading-relaxed">{opp}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Score comment ────────────────────────────────────────────────── */}
      <p className="text-gray-600 text-xs text-center">{data.score_comment}</p>

      {/* ── Link applied popup ─────────────────────────────────────────── */}
      {linkPopup && (
        <LinkAppliedPopup
          applied={linkPopup.applied}
          skipped={linkPopup.skipped}
          errors={linkPopup.errors}
          onClose={() => setLinkPopup(null)}
        />
      )}
    </div>
  );
}

// ── Link Applied Popup with animation ────────────────────────────────────────

function LinkAppliedPopup({
  applied,
  skipped,
  errors,
  onClose,
}: {
  applied: { from_title: string; to_title: string; anchor: string }[];
  skipped: { from_title: string; reason: string }[];
  errors: string[];
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasSuccess = applied.length > 0;

  // Connection animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || applied.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = 320;
    const H = Math.min(160, 60 + applied.length * 40);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    // Build node pairs
    type Dot = { x: number; y: number; label: string; color: string };
    type Connection = { from: Dot; to: Dot; progress: number; delay: number; particles: { t: number; speed: number }[] };

    const connections: Connection[] = applied.slice(0, 5).map((a, i) => {
      const yPos = 30 + i * 32;
      return {
        from: { x: 45, y: yPos, label: truncate(a.from_title, 14), color: "#f97316" },
        to: { x: W - 45, y: yPos, label: truncate(a.to_title, 14), color: "#22c55e" },
        progress: 0,
        delay: i * 0.3,
        particles: [
          { t: 0, speed: 0.008 + Math.random() * 0.004 },
          { t: 0.3, speed: 0.006 + Math.random() * 0.004 },
        ],
      };
    });

    let t = 0;
    let rafId: number;

    function draw() {
      if (!ctx) return;
      t += 0.016;
      ctx.clearRect(0, 0, W, H);

      for (const c of connections) {
        const elapsed = Math.max(0, t - c.delay);
        c.progress = Math.min(1, elapsed * 1.2);

        const { from, to } = c;
        const midX = (from.x + to.x) / 2;
        const midY = from.y - 12 + Math.sin(t * 2 + c.delay) * 3;

        // Connection line (animated draw)
        if (c.progress > 0) {
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);

          // Draw partial bezier
          const steps = Math.floor(c.progress * 30);
          for (let s = 1; s <= steps; s++) {
            const p = s / 30;
            const x = (1 - p) * (1 - p) * from.x + 2 * (1 - p) * p * midX + p * p * to.x;
            const y = (1 - p) * (1 - p) * from.y + 2 * (1 - p) * p * midY + p * p * to.y;
            ctx.lineTo(x, y);
          }

          const grad = ctx.createLinearGradient(from.x, 0, to.x, 0);
          grad.addColorStop(0, "rgba(249,115,22,0.6)");
          grad.addColorStop(1, "rgba(34,197,94,0.6)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Traveling particles (after line is drawn)
        if (c.progress >= 1) {
          for (const particle of c.particles) {
            particle.t = (particle.t + particle.speed) % 1;
            const p = particle.t;
            const px = (1 - p) * (1 - p) * from.x + 2 * (1 - p) * p * midX + p * p * to.x;
            const py = (1 - p) * (1 - p) * from.y + 2 * (1 - p) * p * midY + p * p * to.y;

            const glow = ctx.createRadialGradient(px, py, 0, px, py, 6);
            glow.addColorStop(0, `rgba(249,115,22,${0.8 + Math.sin(t * 8) * 0.2})`);
            glow.addColorStop(1, "rgba(249,115,22,0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Source node
        const fromScale = c.progress > 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.arc(from.x, from.y, 8 * fromScale, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(249,115,22,0.15)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(from.x, from.y, 5 * fromScale, 0, Math.PI * 2);
        ctx.fillStyle = from.color;
        ctx.fill();

        // Target node
        const toScale = c.progress >= 1 ? 1 : 0.3 + c.progress * 0.7;
        ctx.beginPath();
        ctx.arc(to.x, to.y, 8 * toScale, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(34,197,94,0.15)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(to.x, to.y, 5 * toScale, 0, Math.PI * 2);
        ctx.fillStyle = to.color;
        ctx.fill();

        // Checkmark on complete
        if (c.progress >= 1) {
          const checkAlpha = Math.min(1, (elapsed - 0.85) * 3);
          if (checkAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = checkAlpha;
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(to.x - 3, to.y);
            ctx.lineTo(to.x - 1, to.y + 2.5);
            ctx.lineTo(to.x + 3, to.y - 2.5);
            ctx.stroke();
            ctx.restore();
          }
        }

        // Labels
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "bold 7px system-ui";
        ctx.textAlign = "right";
        ctx.fillText(from.label, from.x - 12, from.y + 3);
        ctx.textAlign = "left";
        ctx.fillText(to.label, to.x + 12, to.y + 3);
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [applied]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      style={{ animation: "fadeIn 0.2s ease-out" }}
    >
      <div
        className="relative bg-[#141418] border border-white/[0.1] rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4"
        onClick={e => e.stopPropagation()}
        style={{ animation: "popIn 0.3s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* Close button */}
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-600 hover:text-gray-300 text-sm">
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${hasSuccess ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
            {hasSuccess ? "✓" : "!"}
          </div>
          <div>
            <p className="text-white font-bold text-sm">
              {hasSuccess ? `${applied.length} lien${applied.length > 1 ? "s" : ""} appliqué${applied.length > 1 ? "s" : ""}` : "Aucun lien appliqué"}
            </p>
            <p className="text-gray-500 text-[10px]">
              {hasSuccess ? "Maillage interne mis à jour" : "Vérifiez les détails ci-dessous"}
            </p>
          </div>
        </div>

        {/* Canvas animation */}
        {applied.length > 0 && (
          <div className="mb-4 flex justify-center">
            <canvas ref={canvasRef} />
          </div>
        )}

        {/* Applied links detail */}
        {applied.length > 0 && (
          <div className="space-y-2 mb-3">
            {applied.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]" style={{ animation: `slideIn 0.3s ease-out ${0.1 + i * 0.08}s both` }}>
                <span className="text-green-400 text-xs">✓</span>
                <span className="text-gray-300 truncate flex-1">{truncate(a.from_title, 22)}</span>
                <span className="text-orange-400">→</span>
                <span className="text-gray-300 truncate flex-1">{truncate(a.to_title, 22)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Skipped */}
        {skipped.length > 0 && (
          <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
            <p className="text-yellow-400/70 text-[10px] font-bold">{skipped.length} ignoré(s)</p>
            {skipped.map((s, i) => (
              <p key={i} className="text-yellow-400/50 text-[10px] truncate">{s.from_title} — {s.reason}</p>
            ))}
          </div>
        )}

        {/* Errors */}
        {errors.length > 0 && (
          <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
            {errors.map((e, i) => (
              <p key={i} className="text-red-400 text-[10px]">{e}</p>
            ))}
          </div>
        )}

        {/* Close CTA */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-2 rounded-xl text-xs font-bold bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 transition-all"
        >
          Fermer
        </button>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, suffix, color, sub }: { label: string; value: number; suffix?: string; color: string; sub: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3.5">
      <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-black" style={{ color }}>
        {value}{suffix && <span className="text-sm text-gray-600">{suffix}</span>}
      </p>
      <p className="text-gray-600 text-[10px] mt-0.5">{sub}</p>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white/[0.02] rounded-lg p-2 text-center">
      <p className="text-[10px] text-gray-600 mb-0.5">{label}</p>
      <p className="text-sm font-black" style={{ color }}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 text-[10px]">{label}</span>
      <span className="text-white text-[10px] font-bold">{value}</span>
    </div>
  );
}

function LinkRow({ label, anchor, priority, direction }: { label: string; anchor: string; priority: string; direction: "in" | "out" }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/[0.03] last:border-0">
      <span className={`text-[10px] ${direction === "in" ? "text-green-400" : "text-blue-400"}`}>
        {direction === "in" ? "←" : "→"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-gray-300 text-[10px] truncate">{label}</p>
        <p className="text-orange-400/70 text-[10px] truncate">ancre : {anchor}</p>
      </div>
      <span className={`text-[10px] font-bold ${priority === "haute" ? "text-red-400" : priority === "moyenne" ? "text-orange-400" : "text-gray-600"}`}>
        {priority === "haute" ? "!" : priority === "moyenne" ? "~" : "·"}
      </span>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = { pillar: "Pilier", support: "Support", orphan: "Orpheline", unknown: "Non classée" };
  return labels[role] ?? role;
}
