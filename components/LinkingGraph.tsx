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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // Pré-calculer les voisins pour l'effet de focus (existing + suggestions)
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!data) return map;
    const addPair = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a)!.add(b);
      map.get(b)!.add(a);
    };
    data.suggestions.forEach(s => addPair(s.from_url, s.to_url));
    (data.existing_links ?? []).forEach(l => addPair(l.from_url, l.to_url));
    return map;
  }, [data]);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    function handleResize() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: Math.max(450, Math.min(600, window.innerHeight * 0.55)),
        });
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

      // Size based on importance
      let size = 5;
      if (p.role === "pillar") size = 12;
      else if (p.link_score > 60) size = 8;
      else if (isOrphan) size = 4;

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

    // Suggestion links (dashed, dimmer)
    const existingPairs = new Set(existingLinks.map(l => `${l.from_url}|${l.to_url}`));
    data.suggestions.forEach((s, i) => {
      // Skip suggestions that duplicate existing links
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

  // ── Pill drawing helper ───────────────────────────────────────────────────
  const drawPill = useCallback((
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    w: number, h: number,
    fillStyle: string | CanvasGradient,
    strokeStyle?: string,
    lineWidth?: number
  ) => {
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + r, y - h / 2);
    ctx.lineTo(x + w / 2 - r, y - h / 2);
    ctx.arc(x + w / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x - w / 2 + r, y + h / 2);
    ctx.arc(x - w / 2 + r, y, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth ?? 1;
      ctx.stroke();
    }
  }, []);

  // Animation frame counter for pulse
  const frameRef = useRef(0);
  useEffect(() => {
    let running = true;
    function tick() {
      frameRef.current++;
      if (running) requestAnimationFrame(tick);
    }
    tick();
    return () => { running = false; };
  }, []);

  // ── Node rendering — Rankpill pills ──────────────────────────────────────
  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D) => {
    const { x = 0, y = 0, size, role } = node;
    const hovered = hoveredNodeRef.current;
    const isHovered = hovered?.id === node.id;
    const isSelected = selectedNode?.id === node.id;
    const isHighlighted = isHovered || isSelected;

    const activeNode = hovered || selectedNode;
    const isNeighbor = activeNode
      ? neighborMap.get(activeNode.id)?.has(node.id) ?? false
      : false;
    const isDimmed = activeNode && !isHighlighted && !isNeighbor;
    const opacity = isDimmed ? 0.12 : 1;

    ctx.globalAlpha = opacity;

    // Is this page linked (has any connections)?
    const isLinked = node.incoming > 0 || node.outgoing > 0;
    const isPillar = role === "pillar";

    // Pill dimensions — based on importance
    const pillH = isPillar ? 14 : isLinked ? 10 : 8;
    const pillW = isPillar ? size * 3.8 : isLinked ? size * 3 : size * 2.5;

    // Animation pulse for linked pages
    const t = frameRef.current * 0.03;
    const pulse = isLinked ? 0.85 + 0.15 * Math.sin(t + node.id.length * 0.7) : 1;

    // Colors
    const orangeMain = "#f97316";
    const orangeGlow = "rgba(249,115,22,0.6)";
    const greyMain = "#4b5563";
    const greyBorder = "rgba(107,114,128,0.4)";

    // ── Glow for linked / highlighted pills ──
    if (isLinked && !isDimmed) {
      const glowR = pillW * 0.5 + 8;
      const gradient = ctx.createRadialGradient(x, y, pillH * 0.3, x, y, glowR);
      if (isHighlighted) {
        gradient.addColorStop(0, "rgba(249,115,22,0.35)");
        gradient.addColorStop(1, "rgba(249,115,22,0)");
      } else {
        gradient.addColorStop(0, `rgba(249,115,22,${0.12 * pulse})`);
        gradient.addColorStop(1, "rgba(249,115,22,0)");
      }
      ctx.beginPath();
      ctx.arc(x, y, glowR, 0, 2 * Math.PI);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // ── Pill body ──
    if (isLinked) {
      // Orange gradient pill
      const grad = ctx.createLinearGradient(x - pillW / 2, y, x + pillW / 2, y);
      grad.addColorStop(0, `rgba(249,115,22,${0.7 * pulse})`);
      grad.addColorStop(0.5, `rgba(249,115,22,${0.95 * pulse})`);
      grad.addColorStop(1, `rgba(239,68,68,${0.7 * pulse})`);
      drawPill(ctx, x, y, pillW, pillH, grad,
        isHighlighted ? "#fff" : orangeGlow,
        isHighlighted ? 2 : 1);
    } else {
      // Grey pill — static, no pulse
      drawPill(ctx, x, y, pillW, pillH,
        isHighlighted ? greyMain : `${greyMain}99`,
        isHighlighted ? "rgba(255,255,255,0.5)" : greyBorder,
        isHighlighted ? 1.5 : 0.8);
    }

    // ── Inner shine (top highlight for 3D effect) ──
    if (isLinked) {
      const shineGrad = ctx.createLinearGradient(x, y - pillH / 2, x, y);
      shineGrad.addColorStop(0, "rgba(255,255,255,0.25)");
      shineGrad.addColorStop(1, "rgba(255,255,255,0)");
      drawPill(ctx, x, y - pillH * 0.08, pillW * 0.85, pillH * 0.5, shineGrad);
    }

    // ── Pillar marker (white dot in center) ──
    if (isPillar) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, 2 * Math.PI);
      ctx.fillStyle = "#fff";
      ctx.fill();
    }

    // ── Label ──
    if (isHighlighted || (isNeighbor && activeNode) || isPillar) {
      ctx.font = `${isHighlighted ? "bold " : ""}${isHighlighted ? 11 : 9}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Text shadow for readability
      if (isHighlighted) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillText(node.label, x + 0.5, y + pillH / 2 + 4.5);
      }

      ctx.fillStyle = isHighlighted ? "#fff"
        : isNeighbor ? "rgba(255,255,255,0.8)"
        : isLinked ? "rgba(249,115,22,0.6)" : "rgba(255,255,255,0.45)";
      ctx.fillText(node.label, x, y + pillH / 2 + 4);
    }

    ctx.globalAlpha = 1;
  }, [selectedNode, neighborMap, drawPill]);

  // ── Link rendering — existing (solid orange) vs suggestions (dashed grey) ─
  const paintLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D) => {
    const src = link.source as unknown as GraphNode;
    const tgt = link.target as unknown as GraphNode;
    const sx = src?.x ?? 0, sy = src?.y ?? 0, tx = tgt?.x ?? 0, ty = tgt?.y ?? 0;
    if (sx === 0 && sy === 0 && tx === 0 && ty === 0) return;

    const hovered = hoveredNodeRef.current;
    const activeNode = hovered || selectedNode;
    const isRelated = activeNode && (src.id === activeNode.id || tgt.id === activeNode.id);
    const isDimmed = activeNode && !isRelated;
    const isExisting = link.type === "existing";

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
      // Suggestions: dashed, grey
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isRelated ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.06)";
      ctx.lineWidth = isRelated ? 1.2 : 0.6;
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

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 rounded-full animate-spin mb-4" style={{ border: "3px solid rgba(249,115,22,0.1)", borderTopColor: "#f97316" }} />
        <p className="text-gray-400 text-sm">Chargement du maillage...</p>
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
              const pillH = (isPillar ? 14 : isLinked ? 10 : 8) + 6;
              const pillW = (isPillar ? n.size * 3.8 : isLinked ? n.size * 3 : n.size * 2.5) + 6;
              const r = pillH / 2;
              const x = n.x ?? 0, y = n.y ?? 0;
              ctx.beginPath();
              ctx.moveTo(x - pillW / 2 + r, y - pillH / 2);
              ctx.lineTo(x + pillW / 2 - r, y - pillH / 2);
              ctx.arc(x + pillW / 2 - r, y, r, -Math.PI / 2, Math.PI / 2);
              ctx.lineTo(x - pillW / 2 + r, y + pillH / 2);
              ctx.arc(x - pillW / 2 + r, y, r, Math.PI / 2, -Math.PI / 2);
              ctx.closePath();
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
            onNodeClick={(node) => setSelectedNode(prev => prev?.id === (node as GraphNode).id ? null : node as GraphNode)}
            d3AlphaDecay={0.04}
            d3VelocityDecay={0.35}
            cooldownTicks={80}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 40)}
            enableZoomInteraction={true}
            enablePanInteraction={true}
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

            {/* Incoming suggestions */}
            {selectedSuggestions.incoming.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Liens entrants suggérés</p>
                {selectedSuggestions.incoming.map((s, i) => (
                  <LinkRow key={i} label={s.from_title} anchor={s.anchor} priority={s.priority} direction="in" />
                ))}
              </div>
            )}

            {/* Outgoing suggestions */}
            {selectedSuggestions.outgoing.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Liens sortants suggérés</p>
                {selectedSuggestions.outgoing.map((s, i) => (
                  <LinkRow key={i} label={s.to_title} anchor={s.anchor} priority={s.priority} direction="out" />
                ))}
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
              <p className="text-gray-500 text-xs">{data.suggestions.length} lien(s) recommandé(s)</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Source</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Cible</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Ancre</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2 pr-3">Priorité</th>
                  <th className="text-left text-gray-500 font-bold uppercase tracking-wider py-2">Risque</th>
                </tr>
              </thead>
              <tbody>
                {data.suggestions.slice(0, 20).map((s, i) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
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
                  <p className="text-gray-600 text-[10px]">pos. moy. #{cluster.avg_position}</p>
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
