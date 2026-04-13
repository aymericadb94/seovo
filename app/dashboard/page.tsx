"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SeoAnalysisModal from "@/components/SeoAnalysisModal";
import AuditModal, { type AuditData } from "@/components/AuditModal";
import RoadmapModal, { type RoadmapData } from "@/components/RoadmapModal";
import Footer from "@/components/Footer";
import LinkingGraph from "@/components/LinkingGraph";
import PublicationSuccessPopup from "@/components/PublicationSuccessPopup";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import ScoreRing from "@/components/dashboard/ScoreRing";
import CountdownTimer from "@/components/dashboard/CountdownTimer";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import useCounter from "@/components/dashboard/useCounter";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardData = {
  site: {
    business_name: string;
    industry: string;
    cms: string;
    site_url: string;
    frequency: number;
    seo_analysis_done: boolean;
    gsc_connected: boolean;
    gsc_site_url: string | null;
    seo_context: { strengths?: string; differentiators?: string } | null;
  } | null;
  kpis: {
    totalArticles: number;
    articlesThisMonth: number;
    articlesThisWeek: number;
    coveredKeywords: number;
    totalKeywords: number;
    seoScore: number;
    scoreBreakdown: {
      visibility: { score: number; max: number };
      traffic: { score: number; max: number };
      coverage: { score: number; max: number };
      structure: { score: number; max: number };
      hasGsc: boolean;
      maxScore: number;
      trend: { clicksDelta: number; impressionsDelta: number } | null;
    };
    nextPublicationAt: string | null;
    pubsToday: number;
    streak: number;
    bestStreak: number;
  };
  pubsChart: { date: string; articles: number }[];
  keywordStats: { keyword: string; count: number; lastPublished: string | null }[];
  uncoveredKeywords: { keyword: string; impressions: number | null; clicks: number | null; position: number | null }[];
  calendarData: { date: string; count: number }[];
  recentPublications: {
    id: string;
    title: string;
    keyword: string;
    url: string;
    published_at: string;
    page_type: "article" | "page";
  }[];
  plannedKeywords: string[];
  plannedItems: { keyword: string; source: "roadmap" | "keyword"; role?: string; reason?: string }[];
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicationPopup, setPublicationPopup] = useState<{ title: string; url: string; keyword?: string } | null>(null);
  const [showOptimizeConfirm, setShowOptimizeConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "performance" | "linking" | "publications" | "keywords" | "calendar">("overview");
  const [showSeoModal, setShowSeoModal] = useState<boolean | null>(null);
  const [indexationResults, setIndexationResults] = useState<Record<string, { indexed: boolean | null; verdict: string; coverage: string }>>({});
  const [indexationLoading, setIndexationLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [pubFilter, setPubFilter] = useState<"all" | "articles" | "pages" | "indexed" | "not_indexed">("all");
  const [cmsPages, setCmsPages] = useState<{ id: string; title: string; url: string; keyword: string; published_at: string; page_type: "article" | "page"; cover_image?: string | null; cms_id?: string | number; blog_id?: number }[]>([]);
  const [cmsPagesLoading, setCmsPagesLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [calRange, setCalRange] = useState<7 | 30>(30);
  const [calHover, setCalHover] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  // ── Tutorial (0=score, 1=cocon, 2=potentiel, 3=roadmap, 4=libre) ─────────────
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [scoreBubbleStep, setScoreBubbleStep] = useState(0);
  const tutorialInitRef = useRef(false);

  // ── Audit ──────────────────────────────────────────────────────────────────
  type AuditRecord = { id: string; month: string; created_at: string; data: AuditData };
  const [latestAudit, setLatestAudit] = useState<AuditRecord | null>(null);
  const [auditAvailable, setAuditAvailable] = useState(false);
  const [showAuditReport, setShowAuditReport] = useState(false);

  async function loadAudit() {
    try {
      const res = await fetch("/api/audit");
      const json = await res.json();
      if (!json.error) {
        setLatestAudit(json.audit);
        setAuditAvailable(json.isAvailable);
      }
    } catch { /* ignore */ }
  }

  async function generateAudit() {
    await fetch("/api/audit", { method: "POST" });
    await loadAudit();
  }

  // ── Roadmap ────────────────────────────────────────────────────────────────
  type RoadmapRecord = { id: string; created_at: string; data: RoadmapData };
  const [roadmapRecord, setRoadmapRecord] = useState<RoadmapRecord | null>(null);
  const [showRoadmapModal, setShowRoadmapModal] = useState(false);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapProgress, setRoadmapProgress] = useState(0);
  const roadmapProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cocon sémantique ───────────────────────────────────────────────────────
  type CocoonCluster = {
    name: string;
    objective: string;
    priority: "haute" | "moyenne" | "faible";
    traffic_potential: number;
    pillar: { title: string; keyword: string; status: "existing" | "to_create"; url: string };
    support_pages: { title: string; keyword: string; status: "existing" | "to_create"; url: string }[];
    internal_links: { from: string; to: string; anchor: string; direction: string }[];
  };
  type CocoonData = {
    score: number;
    score_label: string;
    diagnosis: string;
    clusters: CocoonCluster[];
    orphan_pages: { title: string; url: string; recommendation: string }[];
    missing_pages: { title: string; keyword: string; cluster: string; priority: string; reason: string }[];
    optimization_actions: { action: string; impact: string; effort: string; cluster: string }[];
    traffic_potential: { current_estimated: number; potential_6_months: number; growth_percentage: number };
  };
  // ── GSC Performance ────────────────────────────────────────────────────────
  type GscPage = { url: string; clicks: number; impressions: number; ctr: number; position: number };
  type GscDailyPoint = { date: string; clicks: number; impressions: number };
  type GscQuery = { query: string; clicks: number; impressions: number; ctr: number; position: number };
  type GscPerf = { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number; pages: GscPage[]; dailyChart: GscDailyPoint[]; queries: GscQuery[] };
  const [gscPerf, setGscPerf] = useState<GscPerf | null>(null);

  const [cocoonData, setCocoonData] = useState<CocoonData | null>(null);
  const [cocoonLoading, setCocoonLoading] = useState(false);
  const [cocoonExpanded, setCocoonExpanded] = useState<string | null>(null);
  const [cocoonDetailsOpen, setCocoonDetailsOpen] = useState(false);
  const [cocoonProgress, setCocoonProgress] = useState(0);
  const cocoonProgressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);

  async function loadCocoon() {
    try {
      const res = await fetch("/api/semantic-cocoon");
      const json = await res.json();
      const d = json.result?.data as CocoonData | undefined;
      // Ne charger que si les données contiennent des clusters valides
      if (d && Array.isArray(d.clusters) && d.clusters.length > 0) setCocoonData(d);
    } catch { /* ignore */ }
  }

  async function loadGscPerf() {
    try {
      const res = await fetch("/api/gsc/data");
      if (!res.ok) return;
      const json = await res.json();
      if (json.totalClicks !== undefined) setGscPerf(json as GscPerf);
    } catch { /* GSC non connecté — silencieux */ }
  }

  const [cocoonError, setCocoonError] = useState<string | null>(null);

  async function generateCocoon() {
    setCocoonLoading(true);
    setCocoonError(null);
    setCocoonProgress(0);
    // Progression asymptotique : monte vite au début, ralentit progressivement,
    // tend vers 99% sans jamais l'atteindre — pas de plafond fixe
    const startTime = Date.now();
    cocoonProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Formule : 99 * (1 - e^(-t/40s)) — atteint ~70% à 50s, ~86% à 80s, ~95% à 120s, ~98% à 160s
      const pct = Math.min(99, Math.round(99 * (1 - Math.exp(-elapsed / 40000))));
      setCocoonProgress(pct);
    }, 500);
    try {
      const res = await fetch("/api/semantic-cocoon", { method: "POST" });
      if (cocoonProgressRef.current) clearInterval(cocoonProgressRef.current);
      if (!res.ok) {
        let msg = `Erreur serveur (${res.status})`;
        try { const j = await res.json(); if (j.error) msg = j.error; } catch { /* non-JSON response */ }
        setCocoonError(msg); setCocoonProgress(0); return;
      }
      const json = await res.json();
      if (json.error) { setCocoonError(json.error); setCocoonProgress(0); return; }
      if (json.result) {
        setCocoonProgress(100);
        // POST renvoie le JSON AI directement (pas wrappé dans .data)
        const cocoonResult = (json.result.clusters ? json.result : json.result.data ?? json.result) as CocoonData;
        if (!Array.isArray(cocoonResult.clusters) || cocoonResult.clusters.length === 0) {
          setCocoonError("L'analyse n'a pas généré de données exploitables — réessayez");
          setCocoonProgress(0);
          return;
        }
        setCocoonData(cocoonResult);
        setTutorialStep(prev => {
          if (prev === 1) { localStorage.setItem("rankpill_onboarding", "2"); return 2; }
          return prev;
        });
      }
    } catch (err) {
      if (cocoonProgressRef.current) clearInterval(cocoonProgressRef.current);
      setCocoonError(err instanceof Error ? err.message : "Erreur réseau");
      setCocoonProgress(0);
    } finally { setCocoonLoading(false); }
  }

  // ── Projections ────────────────────────────────────────────────────────────
  type ProjectionItem = {
    keyword: string; action: string; current_position: number | null;
    target_position: number; current_clicks: number; potential_clicks: number;
    estimated_gain: number; confidence_score: number; timeframe: string;
    rationale: string; difficulty: "easy" | "medium" | "hard";
    sources?: string[];
  };
  type ProjectionsResult = {
    estimated_results: ProjectionItem[];
    total_estimated_gain: { low: number; high: number };
    total_current_clicks: number;
    has_gsc_data: boolean;
    has_cocoon_data?: boolean;
    has_roadmap_data?: boolean;
    has_cms_data?: boolean;
    computed_at: string;
  };
  const [projections, setProjections] = useState<ProjectionsResult | null>(null);
  const [projectionsLoading, setProjectionsLoading] = useState(false);

  // ── Tutorial helpers ───────────────────────────────────────────────────────
  function advanceTutorial(step: number) {
    setTutorialStep(step);
    localStorage.setItem("rankpill_onboarding", String(step));
    if (step === 4) setShowCompletionPopup(true);
  }

  // ── Data loaders ───────────────────────────────────────────────────────────
  async function loadProjections() {
    try {
      const res = await fetch("/api/seo-projections");
      const json = await res.json();
      if (!json.error && json.projections) setProjections(json.projections);
    } catch { /* ignore */ }
  }

  async function generateProjections() {
    setProjectionsLoading(true);
    try {
      const res = await fetch("/api/seo-projections", { method: "POST" });
      const json = await res.json();
      if (!json.error) {
        setProjections(json.projections);
        setTutorialStep(prev => {
          if (prev === 3) {
            localStorage.setItem("rankpill_onboarding", "4");
            setShowCompletionPopup(true);
            return 4;
          }
          return prev;
        });
      }
    } catch { /* ignore */ }
    setProjectionsLoading(false);
  }

  async function loadRoadmap() {
    try {
      const res = await fetch("/api/roadmap");
      const json = await res.json();
      if (!json.error) setRoadmapRecord(json.roadmap);
    } catch { /* ignore */ }
  }

  async function generateRoadmap() {
    setRoadmapLoading(true);
    setRoadmapProgress(0);
    const startTime = Date.now();
    roadmapProgressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(99, Math.round(99 * (1 - Math.exp(-elapsed / 30000))));
      setRoadmapProgress(pct);
    }, 500);
    try {
      const res = await fetch("/api/roadmap", { method: "POST" });
      if (roadmapProgressRef.current) clearInterval(roadmapProgressRef.current);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRoadmapProgress(100);
      setRoadmapRecord(json.roadmap);
      setTutorialStep(prev => {
        if (prev === 2) { localStorage.setItem("rankpill_onboarding", "3"); return 3; }
        return prev;
      });
    } catch {
      if (roadmapProgressRef.current) clearInterval(roadmapProgressRef.current);
      setRoadmapProgress(0);
    } finally {
      setRoadmapLoading(false);
    }
  }

  async function loadData() {
    const res = await fetch("/api/dashboard/stats");
    const json = await res.json();
    if (!json.error) {
      setData(json);
      setShowSeoModal(json.site ? !json.site.seo_analysis_done : false);
    } else {
      setShowSeoModal(false);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    loadAudit();
    loadRoadmap();
    loadProjections();
    loadCocoon();
    loadGscPerf();
    loadCmsPages();
    loadIndexationCache();
    window.addEventListener("focus", loadData);
    return () => window.removeEventListener("focus", loadData);
  }, []);

  // ── Notification persistante : vérifier les publications non vues ──
  useEffect(() => {
    if (loading || !data?.site) return;
    async function checkUnseenPublications() {
      try {
        const lastSeen = localStorage.getItem("rankpill_last_pub_seen") ?? "1970-01-01T00:00:00Z";
        const supabase = createClient();
        const { data: recentPubs } = await supabase
          .from("publications")
          .select("title, keyword, wordpress_url, published_at")
          .gt("published_at", lastSeen)
          .order("published_at", { ascending: false })
          .limit(1);
        if (recentPubs && recentPubs.length > 0) {
          const pub = recentPubs[0];
          if (pub.wordpress_url && pub.title) {
            setPublicationPopup({
              title: pub.title,
              url: pub.wordpress_url,
              keyword: pub.keyword ?? undefined,
            });
            localStorage.setItem("rankpill_last_pub_seen", new Date().toISOString());
          }
        }
      } catch { /* silencieux */ }
    }
    checkUnseenPublications();
  }, [loading, data?.site]); // eslint-disable-line react-hooks/exhaustive-deps

  // Détecte la fermeture du modal d'analyse → réinitialise le tutoriel
  const seoModalWasOpenRef = useRef(false);
  useEffect(() => {
    if (showSeoModal === true) {
      seoModalWasOpenRef.current = true;
    } else if (showSeoModal === false && seoModalWasOpenRef.current) {
      seoModalWasOpenRef.current = false;
      localStorage.removeItem("rankpill_onboarding");
      tutorialInitRef.current = false;
      setTutorialStep(0);
      setScoreBubbleStep(0);
      // Auto-generate semantic cocoon after SEO analysis completes
      if (!cocoonData && !cocoonLoading) {
        generateCocoon();
      }
    }
  }, [showSeoModal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialise le tutoriel une seule fois après que l'analyse soit faite
  useEffect(() => {
    if (!data?.site?.seo_analysis_done) return;
    if (tutorialInitRef.current) return;
    tutorialInitRef.current = true;
    // Si tutorialStep a déjà été défini (ex: par le modal close → 0), ne pas écraser
    if (tutorialStep !== null) return;
    const saved = localStorage.getItem("rankpill_onboarding");
    const step = saved !== null ? Math.min(parseInt(saved, 10), 4) : 4;
    setTutorialStep(step);
    setScoreBubbleStep(0);
  }, [data?.site?.seo_analysis_done, tutorialStep]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function loadIndexationCache() {
    try {
      const res = await fetch("/api/gsc/inspect");
      const json = await res.json();
      if (json.results) setIndexationResults(json.results);
    } catch { /* ignore */ }
  }

  async function loadCmsPages() {
    setCmsPagesLoading(true);
    try {
      const res = await fetch("/api/publications/list");
      const json = await res.json();
      if (json.pages) {
        setCmsPages(json.pages);
        if (json.synced > 0) setSyncResult(`${json.synced} page(s) auto-synchronisée(s)`);
      }
    } catch { /* ignore */ }
    finally { setCmsPagesLoading(false); }
  }

  async function deletePublication(pub: typeof cmsPages[number]) {
    const uiId = String(pub.id);
    const cmsId = String(pub.cms_id ?? pub.id);
    setDeletingPostId(uiId);
    try {
      const res = await fetch("/api/publications/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: cmsId, url: pub.url, blog_id: pub.blog_id }),
      });
      const json = await res.json();
      if (json.success) {
        setCmsPages(prev => prev.filter(p => String(p.id) !== uiId));
      } else {
        alert(`Erreur de suppression : ${json.error || "Erreur inconnue"}`);
      }
    } catch { alert("Erreur réseau lors de la suppression"); }
    finally {
      setDeletingPostId(null);
      setConfirmDeleteId(null);
    }
  }

  async function syncPublications() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/publications/sync", { method: "POST" });
      const json = await res.json();
      if (json.synced > 0) {
        const parts: string[] = [];
        if (json.articles_count > 0) parts.push(`${json.articles_count} article(s)`);
        if (json.pages_count > 0) parts.push(`${json.pages_count} page(s)`);
        setSyncResult(`${parts.join(" + ")} synchronisé(s)`);
        loadData();
        loadCmsPages();
      } else {
        setSyncResult(json.message || "Déjà synchronisé");
      }
    } catch {
      setSyncResult("Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  }

  async function cleanupBrokenLinks() {
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const res = await fetch("/api/publications/cleanup-links", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setCleanupResult(`Erreur : ${json.error}`);
      } else if (json.cleaned === 0) {
        setCleanupResult(`${json.scanned} pages scannées, ${json.links_found ?? 0} liens vérifiés — aucun lien cassé`);
      } else {
        setCleanupResult(`${json.cleaned} lien(s) cassé(s) supprimé(s) sur ${json.details.length} page(s)`);
      }
    } catch {
      setCleanupResult("Erreur réseau");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function checkIndexation() {
    const allPages = cmsPages.length > 0 ? cmsPages : (data?.recentPublications ?? []);
    if (!allPages.length) return;
    setIndexationLoading(true);
    const urls = allPages.filter(p => p.url).map(p => p.url);
    try {
      const res = await fetch("/api/gsc/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const json = await res.json();
      if (json.results) {
        const map: Record<string, { indexed: boolean | null; verdict: string; coverage: string }> = {};
        for (const r of json.results) map[r.url] = r;
        setIndexationResults(map);
      }
    } catch { /* silently fail */ }
    setIndexationLoading(false);
  }

  const kpis = data?.kpis;

  // KPIs basés sur CMS (source de vérité) quand disponible
  const cmsTotal = cmsPages.length > 0 ? cmsPages.length : (kpis?.totalArticles ?? 0);
  const cmsThisMonth = (() => {
    if (cmsPages.length === 0) return kpis?.articlesThisMonth ?? 0;
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return cmsPages.filter(p => new Date(p.published_at) >= startOfMonth).length;
  })();
  const cmsThisWeek = (() => {
    if (cmsPages.length === 0) return kpis?.articlesThisWeek ?? 0;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    return cmsPages.filter(p => new Date(p.published_at) >= startOfWeek).length;
  })();

  const animScore = useCounter(kpis?.seoScore ?? 0);
  const animMonth = useCounter(cmsThisMonth);
  const animKw = useCounter(kpis?.coveredKeywords ?? 0);
  const maxKeywordCount = Math.max(...(data?.keywordStats.map(k => k.count) ?? [1]), 1);

  return (
    <main className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      {showSeoModal === true && (
        <SeoAnalysisModal
          onComplete={() => { setShowSeoModal(false); loadData(); }}
          prefilledStrengths={data?.site?.seo_context?.strengths ?? ""}
          prefilledDifferentiators={data?.site?.seo_context?.differentiators ?? ""}
        />
      )}

      {showAuditReport && (
        <AuditModal
          auditRecord={latestAudit}
          isAvailable={auditAvailable}
          onClose={() => setShowAuditReport(false)}
          onGenerate={async () => { await generateAudit(); }}
        />
      )}

      {showRoadmapModal && (
        <RoadmapModal
          roadmapRecord={roadmapRecord}
          publications={(data?.recentPublications ?? []).map(p => ({ keyword: p.keyword, url: p.url, published_at: p.published_at }))}
          cmsTitles={cmsPages.map(p => p.title)}
          onClose={() => setShowRoadmapModal(false)}
          onGenerate={generateRoadmap}
        />
      )}

      {/* Popup fin de tutoriel — confettis pilules */}
      {showCompletionPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          {/* Confettis pilules */}
          <style>{`
            @keyframes pillFall {
              0% { transform: translateY(-100vh) rotate(var(--rot)) scale(0.8); opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { transform: translateY(100vh) rotate(calc(var(--rot) + 360deg)) scale(0.6); opacity: 0; }
            }
          `}</style>
          {Array.from({ length: 35 }).map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 2;
            const dur = 3 + Math.random() * 2;
            const rot = Math.random() * 360;
            const size = 8 + Math.random() * 12;
            const colors = ["#f97316", "#ef4444", "#fb923c", "#fbbf24", "#ff6b35"];
            const color = colors[i % colors.length];
            return (
              <div
                key={i}
                className="fixed pointer-events-none"
                style={{
                  left: `${left}%`,
                  top: 0,
                  width: size,
                  height: size * 2,
                  borderRadius: size,
                  background: `linear-gradient(180deg, ${color} 0%, ${color}90 45%, rgba(0,0,0,0.3) 50%, ${color}70 55%, ${color}40 100%)`,
                  boxShadow: `0 0 ${size}px ${color}60`,
                  ["--rot" as string]: `${rot}deg`,
                  animation: `pillFall ${dur}s ease-in ${delay}s both`,
                }}
              />
            );
          })}

          <div
            className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
            style={{ animation: "modalPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s both" }}
          >
            <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #1a0800 0%, #0d0d0d 50%, #1a0500 100%)" }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at top, rgba(249,115,22,0.15), transparent 60%)" }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom, rgba(239,68,68,0.08), transparent 60%)" }} />

            <div className="relative p-8 text-center">
              {/* Pilule animée */}
              <div className="inline-flex items-center justify-center mb-6 relative">
                <div
                  className="relative overflow-hidden"
                  style={{
                    width: 48, height: 92, borderRadius: 24,
                    background: "linear-gradient(160deg, #1a0a00, #0d0d0d 40%, #1a0500)",
                    border: "1.5px solid rgba(249,115,22,0.5)",
                    boxShadow: "0 0 40px rgba(249,115,22,0.3), 0 0 80px rgba(249,115,22,0.1)",
                    animation: "float 2s ease-in-out infinite",
                  }}
                >
                  <div className="absolute top-2 left-2 right-2" style={{ height: 36, borderRadius: "18px 18px 3px 3px", background: "linear-gradient(170deg, #ff8c00, #f97316, #ea580c)", boxShadow: "0 4px 16px rgba(249,115,22,0.5)" }} />
                  <div className="absolute bottom-2 left-2 right-2" style={{ height: 36, borderRadius: "3px 3px 18px 18px", background: "linear-gradient(170deg, #1c0a00, #0d0500)", border: "1px solid rgba(249,115,22,0.15)" }} />
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.6), transparent)" }} />
                </div>
                <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: "rgba(249,115,22,0.3)", animationDuration: "2s" }} />
              </div>

              <h2 className="text-2xl font-black text-white mb-2">
                Félicitations !
              </h2>
              <p className="text-lg font-bold mb-4">
                <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
                  Dashboard configuré
                </span>
              </p>
              <p className="text-gray-400 text-sm leading-relaxed mb-6">
                Votre tableau de bord est maintenant opérationnel.<br />
                Continuez d&apos;explorer tous les outils, et publiez votre première page dès maintenant !
              </p>

              <button
                onClick={() => setShowCompletionPopup(false)}
                className="relative w-full overflow-hidden py-4 rounded-xl font-black text-white text-sm uppercase tracking-wide transition-all group"
                style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 8px 32px rgba(249,115,22,0.35)" }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
                <span className="relative">Explorer mon dashboard →</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup succès publication */}
      <PublicationSuccessPopup
        publication={publicationPopup}
        onClose={() => setPublicationPopup(null)}
      />

      {/* Popup confirmation optimisation automatique */}
      {showOptimizeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ animation: "modalPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, #021a09 0%, #0a120e 40%, #0e0e0e 100%)" }} />
            <div className="absolute inset-0 rounded-2xl p-px" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.5), rgba(34,168,83,0.3), rgba(34,197,94,0.1))" }}>
              <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, #021a09 0%, #0a120e 40%, #0e0e0e 100%)" }} />
            </div>
            <div className="absolute top-0 left-0 w-64 h-64 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(34,197,94,0.12) 0%, transparent 65%)" }} />
            <div className="relative p-7">
              <div className="flex items-start gap-4 mb-5">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,168,83,0.15))", border: "1px solid rgba(34,197,94,0.3)" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-green-400">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none"/>
                    </svg>
                  </div>
                  <div className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ background: "rgba(34,197,94,0.4)", animationDuration: "2s" }} />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg leading-tight">Générer une page<br/>automatiquement ?</h3>
                  <p className="text-gray-500 text-xs mt-1">Optimisation basée sur vos données GSC</p>
                </div>
              </div>
              <p className="text-white/70 text-sm leading-relaxed mb-2">
                RankPill va générer et publier automatiquement une page optimisée pour <span className="font-bold text-green-400">améliorer votre positionnement</span> sur cette opportunité.
              </p>
              <p className="text-white/35 text-xs leading-relaxed mb-7">L&apos;article sera créé à partir de votre stratégie SEO et publié directement sur votre site via votre CMS connecté.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowOptimizeConfirm(false)} className="flex-1 px-4 py-3 rounded-xl text-white/50 hover:text-white/80 transition-all text-sm font-medium active:scale-[0.97]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Annuler
                </button>
                <button
                  onClick={() => { setShowOptimizeConfirm(false); router.push("/generate"); }}
                  className="flex-1 px-4 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.97] relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 24px rgba(34,197,94,0.35)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] hover:translate-x-[200%] transition-transform duration-700" />
                  <span className="relative z-10">Continuer →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Orbes de fond animées */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="animate-orb absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-[120px]" />
        <div className="animate-orb delay-400 absolute bottom-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[100px]" style={{animationDirection:"reverse"}} />
        <div className="animate-orb delay-200 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-400/3 blur-[80px]" />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-md border-b border-white/[0.06] animate-fade-in">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black tracking-tight logo-glow cursor-default">
              Rank<span className="text-shimmer">Pill</span>
            </span>
            {data?.site && (
              <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse flex-shrink-0" />
                  {data.site.business_name}
                </span>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse flex-shrink-0" />
                  {cmsTotal} articles publiés
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/generate" className="group relative overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-xs shadow-lg shadow-orange-500/25 hover:shadow-orange-500/45 transition-all duration-300 hover:scale-[1.03]">
              <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 relative">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <span className="relative">Créer</span>
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1a1a1a] border border-white/10 text-gray-400 text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 font-normal">
                Choisir le mot-clé et prévisualiser avant publication
              </span>
            </Link>
            <Link href="/settings" className="group w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 hover:border-orange-500/40 bg-white/[0.03] hover:bg-orange-500/10 transition-all duration-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500 group-hover:text-orange-400 transition-colors duration-300 group-hover:rotate-90 transition-transform duration-500">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </Link>
            <Link href="/admin" className="text-gray-600 hover:text-orange-400 text-xs px-2 py-2 transition-colors" title="Admin">◈</Link>
            <LanguageSwitcher />
            <button onClick={handleLogout} className="text-gray-500 hover:text-white text-xs px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors">Déconnexion</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-t border-white/[0.04]">
          <div className="max-w-screen-xl mx-auto px-6 flex items-center gap-1 py-0">
            {(["overview", "performance", "linking", "publications", "keywords", "calendar"] as const).map((tab) => {
              const isLocked = (tutorialStep ?? 0) < 4 && tab !== "overview";
              const labels: Record<string, string> = { overview: "Vue d'ensemble", performance: "Performance", linking: "Maillage", publications: "Publications", keywords: "Mots-clés", calendar: "Calendrier" };
              return (
                <button
                  key={tab}
                  onClick={() => !isLocked && setActiveTab(tab)}
                  className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                    activeTab === tab
                      ? "border-orange-500 text-white"
                      : isLocked
                      ? "border-transparent text-gray-700 cursor-not-allowed select-none"
                      : "border-transparent text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {isLocked ? "🔒 " : ""}{labels[tab]}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="max-w-screen-xl mx-auto px-6 py-8">

        {/* Bandeau GSC non connecté */}
        {!loading && data?.site && !data.site.gsc_connected && (tutorialStep ?? 0) >= 4 && (
          <div className="mb-6 flex items-center justify-between gap-4 bg-[#0d0d0d] border border-white/[0.08] rounded-2xl px-5 py-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="text-white text-sm font-bold">Connectez Google Search Console</p>
                <p className="text-gray-500 text-xs">Voyez vos vrais clics, impressions et positions Google en temps réel</p>
              </div>
            </div>
            <a href="/api/auth/google" className="flex-shrink-0 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-xs px-4 py-2.5 rounded-xl uppercase tracking-wide shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transition-shadow whitespace-nowrap">
              Connecter →
            </a>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-6 animate-fade-in-up">
            {/* Pilule animée */}
            <div className="relative">
              <div
                className="relative overflow-hidden"
                style={{
                  width: 36, height: 68, borderRadius: 18,
                  background: "linear-gradient(160deg, #1a0a00, #0d0d0d 40%, #1a0500)",
                  border: "1.5px solid rgba(249,115,22,0.4)",
                  boxShadow: "0 0 30px rgba(249,115,22,0.2), 0 0 60px rgba(249,115,22,0.08)",
                  animation: "float 2s ease-in-out infinite",
                }}
              >
                <div className="absolute top-1.5 left-1.5 right-1.5" style={{ height: 26, borderRadius: "14px 14px 3px 3px", background: "linear-gradient(170deg, #ff8c00, #f97316, #ea580c)", boxShadow: "0 4px 12px rgba(249,115,22,0.4)" }} />
                <div className="absolute bottom-1.5 left-1.5 right-1.5" style={{ height: 26, borderRadius: "3px 3px 14px 14px", background: "linear-gradient(170deg, #1c0a00, #0d0500)", border: "1px solid rgba(249,115,22,0.12)" }} />
                <div className="absolute left-1.5 right-1.5 top-1/2 -translate-y-1/2 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)" }} />
              </div>
              <div className="absolute inset-0 rounded-full animate-ping opacity-15" style={{ background: "rgba(249,115,22,0.3)", animationDuration: "2s" }} />
            </div>
            {/* Barre de progression */}
            <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: "rgba(249,115,22,0.1)" }}>
              <div
                className="h-full rounded-full relative overflow-hidden"
                style={{
                  background: "linear-gradient(90deg, #f97316, #ef4444, #f97316)",
                  animation: "loadingBar 1.8s ease-in-out infinite",
                }}
              />
            </div>
            <p className="text-gray-500 text-xs font-medium tracking-wide uppercase">Chargement du dashboard</p>
            <style>{`
              @keyframes loadingBar {
                0% { width: 0%; margin-left: 0%; }
                50% { width: 60%; margin-left: 20%; }
                100% { width: 0%; margin-left: 100%; }
              }
            `}</style>
          </div>
        )}

        {!loading && data && (
          <>
            {/* ════════════════════════════════════════════════════════════
                TAB 1 — VUE D'ENSEMBLE avec système de tutoriel
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "overview" && tutorialStep !== null && (
              <div className="space-y-5 relative">

                {/* ── OVERLAY SOMBRE (étapes 0 uniquement) ──────────────── */}
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-700"
                  style={{ background: "rgba(0,0,0,0.78)", zIndex: 7, opacity: tutorialStep === 0 ? 1 : 0 }}
                />

                {/* ── HERO SCORE SEO ──────────────────────────────────── */}
                <div
                  className="relative"
                  style={{ zIndex: tutorialStep === 0 ? 10 : "auto" }}
                >
                  <div
                    className="relative z-[1] bg-white/[0.03] rounded-2xl p-6 md:p-8 overflow-hidden animate-fade-in-up"
                    style={tutorialStep === 0
                      ? { border: "1px solid rgba(249,115,22,0.3)", animation: "fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) both, borderGlowOrange 2.5s ease-in-out 0.5s infinite" }
                      : { border: "1px solid rgba(255,255,255,0.07)" }
                    }
                  >
                    <div className="absolute top-0 left-0 w-[500px] h-[250px] pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(249,115,22,0.07), transparent 65%)" }} />
                    <div className="absolute bottom-0 right-0 w-[300px] h-[200px] pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom right, rgba(239,68,68,0.04), transparent 65%)" }} />

                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 relative">
                      <div>
                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.15em]">Score SEO global</p>
                        <p className="text-white font-black text-xl mt-0.5">{data?.site?.business_name}</p>
                      </div>
                      {(kpis?.streak ?? 0) >= 2 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}>
                          <span className="text-sm">{(kpis?.streak ?? 0) >= 7 ? "🔥" : "⚡"}</span>
                          <span className="text-orange-400 text-xs font-black">{kpis?.streak} jours</span>
                        </div>
                      )}
                    </div>

                    {/* Score ring + 4 piliers */}
                    <div className="grid grid-cols-12 gap-4 md:gap-6 items-center">
                      <div className="col-span-12 sm:col-span-4 lg:col-span-3 flex justify-center">
                        <ScoreRing score={animScore} locked={tutorialStep < 4} breakdown={kpis?.scoreBreakdown ?? null} />
                      </div>
                      <div className="col-span-12 sm:col-span-8 lg:col-span-9 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(() => {
                          const bd = kpis?.scoreBreakdown;
                          const locked4 = tutorialStep < 4;
                          const pillars = [
                            { key: "visibility", label: "Visibilité", icon: "👁", score: bd?.visibility.score ?? 0, max: bd?.visibility.max ?? 30, color: "#60a5fa", sub: "Position Google", dimmed: !bd?.hasGsc },
                            { key: "traffic", label: "Trafic", icon: "📈", score: bd?.traffic.score ?? 0, max: bd?.traffic.max ?? 25, color: "#4ade80", sub: "Clics organiques", dimmed: !bd?.hasGsc },
                            { key: "coverage", label: "Couverture", icon: "🎯", score: bd?.coverage.score ?? 0, max: bd?.coverage.max ?? 25, color: "#f97316", sub: "Contenu publié", dimmed: false },
                            { key: "structure", label: "Structure", icon: "🏗", score: bd?.structure.score ?? 0, max: bd?.structure.max ?? 20, color: "#a78bfa", sub: "Architecture SEO", dimmed: false },
                          ];
                          return pillars.map((p, i) => {
                            const pct = p.max > 0 ? Math.round((p.score / p.max) * 100) : 0;
                            return (
                              <div
                                key={p.key}
                                className="flex flex-col gap-2 p-4 rounded-xl animate-fade-in-up"
                                style={{
                                  background: locked4 ? "rgba(255,255,255,0.02)" : `linear-gradient(135deg, ${p.color}08, transparent)`,
                                  border: `1px solid ${locked4 ? "rgba(255,255,255,0.04)" : `${p.color}18`}`,
                                  animationDelay: `${i * 80 + 300}ms`,
                                  opacity: locked4 ? 0.4 : p.dimmed ? 0.45 : 1,
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">{p.icon}</span>
                                  <span className="text-xs font-black" style={{ color: locked4 ? "#374151" : p.color }}>
                                    {locked4 ? "—" : `${p.score}/${p.max}`}
                                  </span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${p.color}12` }}>
                                  <div
                                    className="h-full rounded-full transition-all duration-1000"
                                    style={{ width: locked4 ? "0%" : `${pct}%`, background: p.color, boxShadow: `0 0 6px ${p.color}40` }}
                                  />
                                </div>
                                <span className="text-white font-bold text-xs leading-none">{p.label}</span>
                                <span className="text-gray-600 text-[10px] leading-tight">{locked4 ? "—" : p.dimmed ? "Connectez GSC" : p.sub}</span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Bandeau GSC inline */}
                    {gscPerf && (
                      <div className="mt-5 rounded-xl overflow-hidden animate-fade-in-up delay-300" style={{ background: "rgba(66,133,244,0.04)", border: "1px solid rgba(66,133,244,0.12)" }}>
                        <div className="flex items-stretch divide-x divide-blue-500/10">
                          {[
                            { value: gscPerf.totalImpressions.toLocaleString("fr-FR"), label: "Impressions", color: "#4285F4" },
                            { value: gscPerf.totalClicks.toLocaleString("fr-FR"), label: "Clics", color: "#34A853" },
                            { value: `${(gscPerf.avgCtr * 100).toFixed(1)}%`, label: "CTR", color: "#FBBC05" },
                            { value: gscPerf.avgPosition.toFixed(1), label: "Position", color: "#EA4335" },
                          ].map((m) => (
                            <div key={m.label} className="flex-1 py-3 px-4 text-center">
                              <p className="font-black text-lg leading-none" style={{ color: m.color }}>{m.value}</p>
                              <p className="text-gray-500 text-[9px] font-bold uppercase tracking-wide mt-1">{m.label}</p>
                            </div>
                          ))}
                          <button
                            onClick={() => setActiveTab("performance")}
                            className="flex items-center gap-1.5 px-4 text-xs font-bold text-blue-400/70 hover:text-blue-400 transition-colors flex-shrink-0"
                          >
                            Détails
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                          </button>
                        </div>
                        <div className="px-4 py-1.5 text-center" style={{ background: "rgba(66,133,244,0.03)", borderTop: "1px solid rgba(66,133,244,0.06)" }}>
                          <p className="text-gray-600 text-[9px] font-medium">Google Search Console — 30 derniers jours</p>
                        </div>
                      </div>
                    )}

                    {/* Countdown */}
                    {kpis?.nextPublicationAt && (
                      <div className="mt-6 pt-5 border-t border-white/[0.06]">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3">Prochaine publication automatique</p>
                        <CountdownTimer targetIso={kpis.nextPublicationAt} />
                      </div>
                    )}

                    {/* ── BULLE TUTORIEL SCORE (étape 0) ── */}
                    {tutorialStep === 0 && (
                      <div className="mt-6 pt-5 border-t border-orange-500/20 animate-[modalPop_0.4s_cubic-bezier(0.34,1.56,0.64,1)_0.4s_both]">
                        <div className="rounded-xl p-5" style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.28)" }}>

                          {/* En-tête + indicateur de progression */}
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-orange-400 text-xs font-black uppercase tracking-wider">
                              {["📊 Comment est calculé votre score ?", "📈 Comment progresser", "🎯 Votre objectif"][scoreBubbleStep]}
                            </p>
                            <div className="flex gap-1.5 items-center">
                              {[0, 1, 2].map(i => (
                                <div
                                  key={i}
                                  className="rounded-full transition-all duration-300"
                                  style={{ height: 6, width: i === scoreBubbleStep ? 20 : 6, background: i === scoreBubbleStep ? "#f97316" : "rgba(255,255,255,0.12)" }}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Étape 0/2 — Comment c'est calculé */}
                          {scoreBubbleStep === 0 && (
                            <>
                              <p className="text-white/70 text-xs leading-relaxed mb-3">
                                Votre score mesure la santé SEO réelle de votre site sur <span className="text-white font-bold">4 piliers</span> :
                              </p>
                              <div className="space-y-2 mb-4">
                                {[
                                  { icon: "👁", label: "Visibilité Google", val: "Mots-clés dans le top 10", color: "#60a5fa" },
                                  { icon: "📈", label: "Trafic organique", val: "Clics et CTR réels", color: "#4ade80" },
                                  { icon: "🎯", label: "Couverture contenu", val: "Pages du cocon publiées", color: "#f97316" },
                                  { icon: "🏗", label: "Structure SEO", val: "Clusters et maillage", color: "#a78bfa" },
                                ].map(({ icon, label, val, color: c }) => (
                                  <div key={label} className="flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
                                    <span className="text-sm flex-shrink-0">{icon}</span>
                                    <span className="text-gray-400 flex-1">{label}</span>
                                    <span className="font-bold flex-shrink-0 text-[10px]" style={{ color: c }}>{val}</span>
                                  </div>
                                ))}
                              </div>
                              <button
                                onClick={() => setScoreBubbleStep(1)}
                                className="w-full py-2.5 rounded-lg text-xs font-bold text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-all"
                              >
                                Suivant →
                              </button>
                            </>
                          )}

                          {/* Étape 1/2 — Comment progresser */}
                          {scoreBubbleStep === 1 && (
                            <>
                              <p className="text-white/70 text-xs leading-relaxed mb-5">
                                Votre score progresse en <span className="text-white font-bold">publiant les articles de votre roadmap</span>. Chaque article publié améliore votre couverture et structure. Connectez <span className="text-white font-bold">Google Search Console</span> pour débloquer les piliers Visibilité et Trafic (55 pts supplémentaires).
                              </p>
                              <button
                                onClick={() => setScoreBubbleStep(2)}
                                className="w-full py-2.5 rounded-lg text-xs font-bold text-white/70 hover:text-white border border-white/10 hover:border-white/20 transition-all"
                              >
                                Suivant →
                              </button>
                            </>
                          )}

                          {/* Étape 2/2 — Objectif + CTA */}
                          {scoreBubbleStep === 2 && (
                            <>
                              <p className="text-white/70 text-xs leading-relaxed mb-3">
                                Atteignez le score <span className="text-white font-bold">80+</span> pour un SEO solide et compétitif. Votre score actuel :
                              </p>
                              <div className="flex items-center gap-3 mb-1">
                                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-1000"
                                    style={{ width: `${animScore}%` }}
                                  />
                                </div>
                                <span className="text-orange-400 font-black text-sm flex-shrink-0">{animScore}/{kpis?.scoreBreakdown?.maxScore ?? 100}</span>
                              </div>
                              <div className="flex items-center justify-between mb-5">
                                <span className="text-gray-600 text-xs">Score actuel</span>
                                <span className="text-green-400/70 text-xs">Objectif : 80+</span>
                              </div>
                              <button
                                onClick={() => advanceTutorial(1)}
                                className="relative w-full overflow-hidden py-3 rounded-xl text-sm font-black text-white transition-all hover:opacity-90 active:scale-[0.98]"
                                style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 6px 28px rgba(249,115,22,0.4)" }}
                              >
                                <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
                                <span className="relative">Structurer mon SEO →</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── COCON SÉMANTIQUE (étape 1 du tutorial) ────────── */}
                {tutorialStep >= 1 && (
                  <div
                    className="relative animate-fade-in-up"
                    style={{ zIndex: tutorialStep === 1 ? 10 : "auto" }}
                  >
                  <div
                    className="relative rounded-2xl p-6 md:p-8 overflow-hidden"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      ...(tutorialStep === 1
                        ? { border: "1px solid rgba(249,115,22,0.3)", animation: "borderGlowOrange 2.5s ease-in-out infinite" }
                        : { border: "1px solid rgba(249,115,22,0.1)" }),
                    }}
                  >
                    {/* Glows de fond */}
                    <div className="absolute top-0 left-0 w-[500px] h-[250px] pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(249,115,22,0.06), transparent 65%)" }} />
                    <div className="absolute bottom-0 right-0 w-[350px] h-[200px] pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom right, rgba(239,68,68,0.04), transparent 65%)" }} />

                    {/* Header */}
                    <div className="relative flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(249,115,22,0.15)", color: "#fb923c" }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "#fb923c" }}>Architecture SEO</p>
                          <p className="text-white font-black text-xl">Cocon Sémantique</p>
                        </div>
                      </div>
                      {cocoonData && (
                        <div
                          className="px-3 py-1.5 rounded-full text-xs font-black"
                          style={{
                            background: cocoonData.score >= 70 ? "rgba(34,197,94,0.1)" : cocoonData.score >= 40 ? "rgba(249,115,22,0.1)" : "rgba(239,68,68,0.1)",
                            border: `1px solid ${cocoonData.score >= 70 ? "rgba(34,197,94,0.25)" : cocoonData.score >= 40 ? "rgba(249,115,22,0.25)" : "rgba(239,68,68,0.25)"}`,
                            color: cocoonData.score >= 70 ? "#22c55e" : cocoonData.score >= 40 ? "#f97316" : "#ef4444",
                          }}
                        >
                          {cocoonData.score}/100 — {cocoonData.score_label}
                        </div>
                      )}
                    </div>

                    {/* ── Bulle tutoriel cocon (étape 1) ── */}
                    {tutorialStep === 1 && (
                      <div className="relative mb-5 p-4 rounded-xl animate-[modalPop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.2s_both]" style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.32)" }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-orange-400 text-xs font-black uppercase tracking-wider">🕸️ Cocon Sémantique</span>
                          <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wide">Étape 2 / 4</span>
                        </div>
                        <p className="text-white/70 text-xs leading-relaxed mb-3">
                          Nous structurons votre SEO en <span className="text-white font-bold">cocon sémantique intelligent</span>. Les clusters, pages piliers et le maillage interne sont générés automatiquement à partir de vos données.
                        </p>
                        {cocoonData ? (
                          <button
                            onClick={() => advanceTutorial(2)}
                            className="w-full py-2.5 rounded-lg text-xs font-black text-white transition-all hover:opacity-90"
                            style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 4px 20px rgba(249,115,22,0.3)" }}
                          >
                            Continuer → Analyser mon potentiel SEO
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 text-orange-400/70 text-xs">
                            <span className="text-base animate-bounce">↓</span>
                            <span>Cliquez sur le bouton ci-dessous pour générer votre cocon</span>
                          </div>
                        )}
                      </div>
                    )}

                    {cocoonError && (
                      <div className="relative mb-4 p-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        Erreur : {cocoonError}
                      </div>
                    )}

                    {!cocoonData && !cocoonLoading && (
                      <div className="relative text-center py-12">
                        {/* Icône réseau animée */}
                        <div className="relative inline-block mb-6">
                          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.15)" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-9 h-9 animate-[float_3s_ease-in-out_infinite]">
                              <circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                            </svg>
                          </div>
                          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f97316, #ef4444)" }}>
                            <span className="text-[8px] text-white font-black">+</span>
                          </div>
                        </div>
                        <p className="text-white font-bold mb-2 text-sm">Structurez votre SEO</p>
                        <p className="text-gray-500 text-xs mb-6 max-w-sm mx-auto leading-relaxed">
                          Créez un cocon sémantique intelligent qui connecte toutes vos pages et maximise votre visibilité Google.
                        </p>
                        <button
                          onClick={generateCocoon}
                          className="relative overflow-hidden px-8 py-3.5 rounded-xl text-sm font-black text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                          style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 8px 32px rgba(249,115,22,0.35)" }}
                        >
                          <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
                          <span className="relative">Générer mon cocon sémantique →</span>
                        </button>
                      </div>
                    )}

                    {cocoonLoading && (
                      <div className="relative text-center py-16">
                        {/* Spinner animé multi-layer */}
                        <div className="relative inline-block mb-6">
                          <div className="w-16 h-16 rounded-full animate-spin" style={{ border: "3px solid rgba(249,115,22,0.1)", borderTopColor: "#f97316" }} />
                          <div className="absolute inset-2 rounded-full animate-spin" style={{ border: "2px solid rgba(239,68,68,0.08)", borderBottomColor: "#ef4444", animationDirection: "reverse", animationDuration: "1.5s" }} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="1.5" className="w-5 h-5 animate-pulse"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4"/></svg>
                          </div>
                        </div>
                        <p className="text-orange-300 text-sm font-bold mb-1">Construction du cocon en cours...</p>
                        <p className="text-gray-600 text-xs">Clusterisation des mots-clés, structure du cocon, maillage interne</p>
                        {/* Barre de progression temps réel */}
                        <div className="mt-5 mx-auto w-48 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(249,115,22,0.1)" }}>
                          <div className="h-full rounded-full relative overflow-hidden" style={{ width: `${cocoonProgress}%`, background: "linear-gradient(90deg, #f97316, #ef4444)", transition: "width 0.5s ease-out" }}>
                            <div className="absolute inset-0 animate-[shimmer_2s_linear_infinite]" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
                          </div>
                        </div>
                        <p className="text-gray-600 text-xs mt-2">{cocoonProgress}%</p>
                      </div>
                    )}

                    {cocoonData && !cocoonLoading && (
                      <>
                        {/* Diagnostic */}
                        <p className="relative text-gray-400 text-sm mb-6 leading-relaxed">{cocoonData.diagnosis}</p>

                        {/* Stats rapides avec animations */}
                        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                          {[
                            { value: (cocoonData.clusters ?? []).length, label: "Clusters", color: "#fb923c", delay: "0ms" },
                            { value: (cocoonData.clusters ?? []).reduce((s, c) => s + 1 + (c.support_pages ?? []).length, 0), label: "Pages totales", color: "#f97316", delay: "100ms" },
                            { value: (cocoonData.clusters ?? []).reduce((s, c) => s + (c.support_pages ?? []).filter(p => p.status === "to_create").length + (c.pillar?.status === "to_create" ? 1 : 0), 0), label: "A créer", color: "#ef4444", delay: "200ms" },
                            { value: (cocoonData.traffic_potential?.growth_percentage ?? 0) > 999 ? `x${Math.round((cocoonData.traffic_potential?.potential_6_months ?? 0) / Math.max(cocoonData.traffic_potential?.current_estimated ?? 1, 1))}` : `+${cocoonData.traffic_potential?.growth_percentage ?? 0}%`, label: "Potentiel", color: "#22c55e", delay: "300ms" },
                          ].map((stat) => (
                            <div
                              key={stat.label}
                              className="group relative rounded-xl p-4 text-center overflow-hidden transition-transform hover:scale-[1.03] animate-fade-in-up"
                              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${stat.color}18`, animationDelay: stat.delay }}
                            >
                              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(ellipse at center, ${stat.color}10, transparent 70%)` }} />
                              <p className="text-2xl font-black relative" style={{ color: stat.color }}>{stat.value}</p>
                              <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wide mt-1 relative">{stat.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Toggle détails */}
                        <button
                          onClick={() => setCocoonDetailsOpen(v => !v)}
                          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all hover:bg-white/[0.03] mb-4"
                          style={{ border: "1px solid rgba(249,115,22,0.12)", color: "#fb923c" }}
                        >
                          <svg className={`w-3.5 h-3.5 transition-transform ${cocoonDetailsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                          {cocoonDetailsOpen ? "Masquer les détails" : `Voir les ${(cocoonData.clusters ?? []).length} clusters et actions recommandées`}
                        </button>

                        {cocoonDetailsOpen && (
                        <>
                        {/* Clusters */}
                        <div className="relative space-y-3 animate-fade-in-up">
                          {(cocoonData.clusters ?? []).map((cluster, ci) => {
                            const isOpen = cocoonExpanded === cluster.name;
                            const existing = [cluster.pillar, ...(cluster.support_pages ?? [])].filter(p => p?.status === "existing").length;
                            const total = 1 + (cluster.support_pages ?? []).length;
                            const pct = Math.round((existing / total) * 100);
                            const priorityColors: Record<string, string> = {
                              haute: "text-red-400 bg-red-500/10 border-red-500/20",
                              moyenne: "text-orange-400 bg-orange-500/10 border-orange-500/20",
                              faible: "text-gray-400 bg-white/[0.04] border-white/[0.08]",
                            };
                            return (
                              <div
                                key={cluster.name}
                                className="rounded-xl overflow-hidden transition-all animate-fade-in-up"
                                style={{ border: isOpen ? "1px solid rgba(249,115,22,0.2)" : "1px solid rgba(255,255,255,0.06)", animationDelay: `${ci * 80}ms` }}
                              >
                                <button
                                  onClick={() => setCocoonExpanded(isOpen ? null : cluster.name)}
                                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
                                >
                                  <svg className={`w-4 h-4 text-orange-400/60 transition-transform flex-shrink-0 ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-white font-bold text-sm truncate">{cluster.name}</span>
                                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full border ${priorityColors[cluster.priority] ?? priorityColors.faible}`}>
                                        {cluster.priority}
                                      </span>
                                    </div>
                                    <p className="text-gray-500 text-xs truncate">{cluster.objective}</p>
                                  </div>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 80 ? "#22c55e" : pct >= 40 ? "#f97316" : "#ef4444" }} />
                                    </div>
                                    <span className="text-gray-500 text-xs font-mono w-10 text-right">{existing}/{total}</span>
                                  </div>
                                  <span className="text-orange-400/70 text-xs font-bold flex-shrink-0">+{cluster.traffic_potential}</span>
                                </button>

                                {isOpen && (
                                  <div className="border-t border-orange-500/10 p-4 animate-fade-in" style={{ background: "rgba(249,115,22,0.02)" }}>
                                    {/* Page pilier */}
                                    <div className="mb-4">
                                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-400 mb-2">Page pilier</p>
                                      <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)" }}>
                                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cluster.pillar.status === "existing" ? "bg-green-400" : "bg-orange-400 animate-pulse"}`} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white text-sm font-semibold truncate">{cluster.pillar.title}</p>
                                          <p className="text-gray-500 text-xs">{cluster.pillar.keyword}</p>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${cluster.pillar.status === "existing" ? "text-green-400 bg-green-500/10" : "text-orange-400 bg-orange-500/10"}`}>
                                          {cluster.pillar.status === "existing" ? "Existant" : "A créer"}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Pages support */}
                                    <div className="mb-4">
                                      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 mb-2">Pages support ({(cluster.support_pages ?? []).length})</p>
                                      <div className="space-y-1.5">
                                        {(cluster.support_pages ?? []).map((page, idx) => (
                                          <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-orange-500/15 transition-colors">
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${page.status === "existing" ? "bg-green-400" : "bg-orange-400"}`} />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-gray-300 text-sm truncate">{page.title}</p>
                                              <p className="text-gray-600 text-xs">{page.keyword}</p>
                                            </div>
                                            <span className={`text-[10px] font-bold uppercase ${page.status === "existing" ? "text-green-400" : "text-orange-400"}`}>
                                              {page.status === "existing" ? "Existant" : "A créer"}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Liens internes */}
                                    {(cluster.internal_links ?? []).length > 0 && (
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 mb-2">Maillage ({(cluster.internal_links ?? []).length} liens)</p>
                                        <div className="space-y-1">
                                          {(cluster.internal_links ?? []).map((link, idx) => (
                                            <div key={idx} className="flex items-center gap-2 text-xs text-gray-500">
                                              <span className="text-gray-400 truncate max-w-[35%]">{link.from}</span>
                                              <svg className="w-3 h-3 text-orange-400/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                              <span className="text-gray-400 truncate max-w-[35%]">{link.to}</span>
                                              <span className="text-orange-400/40 ml-auto flex-shrink-0 italic">{link.anchor}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Actions d'optimisation */}
                        {(cocoonData.optimization_actions ?? []).length > 0 && (
                          <div className="relative mt-6 pt-5 border-t border-orange-500/10">
                            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 mb-3">Actions recommandées</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {(cocoonData.optimization_actions ?? []).slice(0, 6).map((action, idx) => {
                                const impactColors: Record<string, { bg: string; text: string; border: string }> = {
                                  fort: { bg: "rgba(34,197,94,0.06)", text: "text-green-400", border: "rgba(34,197,94,0.12)" },
                                  moyen: { bg: "rgba(249,115,22,0.06)", text: "text-orange-400", border: "rgba(249,115,22,0.12)" },
                                  faible: { bg: "rgba(255,255,255,0.02)", text: "text-gray-500", border: "rgba(255,255,255,0.06)" },
                                };
                                const c = impactColors[action.impact] ?? impactColors.faible;
                                return (
                                  <div key={idx} className="flex items-start gap-2 p-3 rounded-lg" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                                    <span className={`text-[10px] font-black uppercase mt-0.5 ${c.text}`}>{action.impact}</span>
                                    <p className="text-gray-400 text-xs leading-relaxed">{action.action}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        </>
                        )}

                        {/* Regénérer */}
                        <div className="relative mt-5 flex justify-end">
                          <button onClick={generateCocoon} className="text-xs text-gray-500 hover:text-orange-400 transition-colors font-medium">
                            ↻ Régénérer le cocon
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  </div>
                )}

                {/* ── GRILLE : ROADMAP (gauche, étape 2) + POTENTIEL (droite, étape 3) ── */}
                {tutorialStep >= 2 && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fade-in-up">

                    {/* ── ROADMAP SEO — GAUCHE (5 cols) ── */}
                    <div
                      className="lg:col-span-5 relative animate-fade-in-up"
                      style={{ zIndex: tutorialStep === 2 ? 10 : "auto" }}
                    >
                      <div
                        className="relative z-[1] rounded-2xl overflow-hidden flex flex-col"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          minHeight: 420,
                          ...(tutorialStep === 2
                            ? { border: "1px solid rgba(167,139,250,0.2)", animation: "borderGlowViolet 2.5s ease-in-out infinite" }
                            : { border: "1px solid rgba(167,139,250,0.15)" }),
                        }}
                      >
                        <div className="absolute top-0 left-0 w-72 h-52 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(167,139,250,0.1), transparent 65%)" }} />
                        <div className="absolute bottom-0 right-0 w-48 h-36 pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom right, rgba(96,165,250,0.05), transparent 65%)" }} />

                        <div className="relative p-6 flex flex-col flex-1">
                          {/* Header roadmap */}
                          <div className="flex items-start justify-between mb-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                                </svg>
                              </div>
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "#a78bfa" }}>Roadmap SEO</p>
                                <p className="text-white font-black text-xl">Plan éditorial — 20 articles</p>
                              </div>
                            </div>
                            <div className="relative group flex-shrink-0">
                              <button className="w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:text-violet-400 transition-colors text-xs font-black" style={{ background: "rgba(255,255,255,0.04)" }}>?</button>
                              <div className="absolute right-0 top-9 w-64 bg-[#111] border border-violet-500/20 rounded-xl p-3 text-xs text-gray-400 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-xl">
                                Générez votre plan éditorial SEO sur 20 articles, priorisés selon votre cocon sémantique. RankPill publie automatiquement chaque article selon la roadmap.
                              </div>
                            </div>
                          </div>

                          {/* ── Bulle tutoriel roadmap (étape 2) ── */}
                          {tutorialStep === 2 && (
                            <div className="mb-5 p-4 rounded-xl animate-[modalPop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.2s_both]" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.32)" }}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-violet-400 text-xs font-black uppercase tracking-wider">🗺️ Roadmap SEO</span>
                                <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wide">Étape 3 / 4</span>
                              </div>
                              <p className="text-white/70 text-xs leading-relaxed mb-3">
                                Générez votre plan éditorial sur <span className="text-white font-bold">20 articles</span>, structurés selon votre cocon sémantique. RankPill les publiera automatiquement.
                              </p>
                              {roadmapRecord ? (
                                <button
                                  onClick={() => advanceTutorial(3)}
                                  className="w-full py-2.5 rounded-lg text-xs font-black text-white transition-all hover:opacity-90"
                                  style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)", boxShadow: "0 4px 20px rgba(124,58,237,0.3)" }}
                                >
                                  Continuer → Calculer mon potentiel SEO
                                </button>
                              ) : (
                                <div className="flex items-center gap-2 text-violet-400/70 text-xs">
                                  <span className="text-base animate-bounce">↓</span>
                                  <span>Cliquez sur le bouton ci-dessous pour générer votre roadmap</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Contenu roadmap */}
                          {roadmapLoading ? (
                            <div className="relative text-center py-12 flex-1 flex flex-col items-center justify-center">
                              {/* Spinner animé multi-layer violet */}
                              <div className="relative inline-block mb-6">
                                <div className="w-16 h-16 rounded-full animate-spin" style={{ border: "3px solid rgba(167,139,250,0.1)", borderTopColor: "#a78bfa" }} />
                                <div className="absolute inset-2 rounded-full animate-spin" style={{ border: "2px solid rgba(124,58,237,0.08)", borderBottomColor: "#7c3aed", animationDirection: "reverse", animationDuration: "1.5s" }} />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" className="w-5 h-5 animate-pulse">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                                  </svg>
                                </div>
                              </div>
                              <p className="text-violet-300 text-sm font-bold mb-1">Calcul de la roadmap en cours...</p>
                              <p className="text-gray-600 text-xs mb-1">Analyse des mots-clés, priorisation, structuration du plan éditorial</p>
                              {/* Étapes de progression */}
                              <div className="flex items-center gap-3 mt-3 mb-4">
                                {[
                                  { label: "Analyse", threshold: 15 },
                                  { label: "Priorisation", threshold: 45 },
                                  { label: "Structuration", threshold: 75 },
                                ].map((step, i) => (
                                  <div key={i} className="flex items-center gap-1.5">
                                    <div
                                      className="w-1.5 h-1.5 rounded-full transition-all duration-500"
                                      style={{
                                        background: roadmapProgress >= step.threshold ? "#a78bfa" : "rgba(167,139,250,0.15)",
                                        boxShadow: roadmapProgress >= step.threshold ? "0 0 6px rgba(167,139,250,0.5)" : "none",
                                      }}
                                    />
                                    <span
                                      className="text-[10px] font-semibold transition-colors duration-500"
                                      style={{ color: roadmapProgress >= step.threshold ? "#c4b5fd" : "#4b5563" }}
                                    >
                                      {step.label}
                                    </span>
                                    {i < 2 && <span className="text-gray-800 text-[10px] mx-0.5">→</span>}
                                  </div>
                                ))}
                              </div>
                              {/* Barre de progression temps réel */}
                              <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(167,139,250,0.1)" }}>
                                <div
                                  className="h-full rounded-full relative overflow-hidden"
                                  style={{ width: `${roadmapProgress}%`, background: "linear-gradient(90deg, #7c3aed, #a78bfa)", transition: "width 0.5s ease-out" }}
                                >
                                  <div className="absolute inset-0 animate-[shimmer_2s_linear_infinite]" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)", backgroundSize: "200% 100%" }} />
                                </div>
                              </div>
                              <p className="text-gray-600 text-xs mt-2 tabular-nums">{roadmapProgress}%</p>
                            </div>
                          ) : roadmapRecord ? (
                            (() => {
                              const cmsTitlesLower = cmsPages.map(p => p.title.toLowerCase().trim());
                              const publishedKw = new Set((data?.recentPublications ?? []).map(p => p.keyword?.toLowerCase()).filter(Boolean));
                              const allArticles = (roadmapRecord.data.articles ?? []) as { title: string; keyword: string; priority: number }[];

                              function isPublished(a: { title: string; keyword: string }): boolean {
                                const kwLower = a.keyword?.toLowerCase()?.trim();
                                const titleLower = a.title?.toLowerCase()?.trim();
                                if (kwLower && publishedKw.has(kwLower)) return true;
                                if (titleLower && cmsTitlesLower.some(ct =>
                                  ct.includes(titleLower) || titleLower.includes(ct) ||
                                  (() => {
                                    const words = titleLower.split(/\s+/).filter(w => w.length > 3);
                                    if (words.length === 0) return false;
                                    const matched = words.filter(w => ct.includes(w)).length;
                                    return matched / words.length >= 0.6;
                                  })()
                                )) return true;
                                return false;
                              }

                              const remaining = allArticles.filter(a => !isPublished(a)).sort((a, b) => a.priority - b.priority);
                              const total = allArticles.length;
                              const done = total - remaining.length;
                              const pct = Math.round((done / Math.max(total, 1)) * 100);
                              return (
                                <div className="flex flex-col gap-4 flex-1">
                                  <div>
                                    <div className="flex items-center justify-between mb-1.5 text-xs">
                                      <span className="text-gray-400 font-bold">{done} / {total} publiés</span>
                                      <span className="font-black" style={{ color: "#a78bfa" }}>{pct}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(167,139,250,0.1)" }}>
                                      <div className="h-full rounded-full relative overflow-hidden transition-all duration-1000" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #7c3aed, #a78bfa, #60a5fa)" }}>
                                        <div className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }} />
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-72">
                                    {remaining.slice(0, 20).map((a, i) => (
                                      <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all group/item" style={{ borderLeft: i === 0 ? "2px solid rgba(167,139,250,0.7)" : i < 3 ? "2px solid rgba(167,139,250,0.25)" : "2px solid rgba(167,139,250,0.06)" }}>
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: i === 0 ? "linear-gradient(135deg,#7c3aed,#a78bfa)" : "rgba(255,255,255,0.04)", color: i === 0 ? "white" : "#6b7280" }}>{i + 1}</span>
                                        <span className="flex-1 text-xs truncate" style={{ color: i === 0 ? "rgba(255,255,255,0.92)" : i < 3 ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.22)", fontWeight: i === 0 ? 600 : 400 }}>{a.title}</span>
                                        <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full truncate max-w-[80px] opacity-0 group-hover/item:opacity-100 transition-opacity" style={{ background: "rgba(167,139,250,0.1)", color: "#c4b5fd" }}>{a.keyword}</span>
                                      </div>
                                    ))}
                                    {remaining.length === 0 && <p className="text-green-400 text-xs text-center py-4 font-bold">Tous les articles sont publiés !</p>}
                                    {remaining.length > 20 && <p className="text-center text-gray-600 text-xs py-2">+{remaining.length - 20} articles</p>}
                                  </div>
                                  <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
                                    <button onClick={() => setShowRoadmapModal(true)} className="flex-1 text-xs font-bold py-2.5 rounded-xl transition-all hover:opacity-80" style={{ background: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.2)" }}>
                                      Voir la roadmap complète →
                                    </button>
                                    <button onClick={generateRoadmap} disabled={roadmapLoading} className="px-4 text-xs text-gray-600 hover:text-violet-400 transition-colors disabled:opacity-40 rounded-xl border border-white/[0.06] hover:border-violet-500/20">
                                      {roadmapLoading ? <span className="w-3.5 h-3.5 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin inline-block" /> : "↺"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="flex flex-col gap-5 flex-1 justify-between">
                              <div className="flex flex-col gap-4">
                                <p className="text-gray-400 text-sm leading-relaxed">
                                  Générez votre plan éditorial sur <span className="text-white font-bold">20 articles SEO</span>, structurés selon votre cocon sémantique et priorisés par potentiel de trafic.
                                </p>
                                <div className="grid grid-cols-3 gap-3">
                                  {[
                                    { label: "Articles planifiés", value: "20", color: "#a78bfa" },
                                    { label: "Mots-clés ciblés", value: String(kpis?.totalKeywords ?? 0), color: "#818cf8" },
                                    { label: "Phases SEO", value: "3", color: "#60a5fa" },
                                  ].map(s => (
                                    <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.1)" }}>
                                      <p className="font-black text-2xl leading-none mb-1" style={{ color: s.color }}>{s.value}</p>
                                      <p className="text-gray-500 text-[10px] leading-tight mt-1">{s.label}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="space-y-2 p-4 rounded-xl" style={{ background: "rgba(167,139,250,0.04)", border: "1px solid rgba(167,139,250,0.08)" }}>
                                  {["Articles structurés selon votre cocon sémantique", "Priorisés par potentiel de trafic", "Publication automatique selon la roadmap"].map((f, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                                      <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#a78bfa" }} />
                                      {f}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <button
                                onClick={generateRoadmap}
                                className="relative w-full overflow-hidden py-4 rounded-xl font-black text-white text-sm uppercase tracking-wide transition-all group"
                                style={{ background: "linear-gradient(135deg, #7c3aed, #a78bfa)", boxShadow: "0 8px 32px rgba(124,58,237,0.35)" }}
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
                                <span className="relative flex items-center justify-center gap-2">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>Calculer ma roadmap SEO
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── POTENTIEL DE CROISSANCE — DROITE (7 cols) ── */}
                    {tutorialStep < 3 ? (
                      /* Placeholder verrouillé */
                      <div
                        className="lg:col-span-7 rounded-2xl flex flex-col items-center justify-center gap-3 animate-fade-in-up"
                        style={{ minHeight: 420, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.1)" }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                          </svg>
                        </div>
                        <p className="text-gray-700 text-sm font-bold">Potentiel SEO</p>
                        <p className="text-gray-800 text-xs text-center max-w-[200px] leading-relaxed">Se débloque après la génération de la roadmap</p>
                      </div>
                    ) : (
                      /* Carte potentiel réelle */
                      <div
                        className="lg:col-span-7 relative animate-fade-in-up"
                        style={{ zIndex: tutorialStep === 3 ? 10 : "auto" }}
                      >
                        <div
                          className="relative z-[1] rounded-2xl overflow-hidden flex flex-col"
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            minHeight: 420,
                            ...(tutorialStep === 3
                              ? { border: "1px solid rgba(34,197,94,0.25)", animation: "borderGlowGreen 2.5s ease-in-out infinite" }
                              : { border: "1px solid rgba(34,197,94,0.15)" }),
                          }}
                        >
                          <div className="absolute top-0 right-0 w-56 h-44 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(34,197,94,0.09), transparent 65%)" }} />
                          <div className="absolute bottom-0 left-0 w-48 h-32 pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom left, rgba(249,115,22,0.04), transparent 65%)" }} />

                          <div className="relative p-6 flex flex-col flex-1">
                            {/* Header potentiel */}
                            <div className="flex items-start justify-between mb-5">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "#4ade80" }}>Potentiel SEO</p>
                                  <p className="text-white font-black text-xl">Croissance organique</p>
                                </div>
                              </div>
                              <div className="relative group flex-shrink-0">
                                <button className="w-7 h-7 rounded-full flex items-center justify-center text-gray-600 hover:text-green-400 transition-colors text-xs font-black" style={{ background: "rgba(255,255,255,0.04)" }}>?</button>
                                <div className="absolute right-0 top-9 w-60 bg-[#111] border border-green-500/20 rounded-xl p-3 text-xs text-gray-400 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-xl">
                                  Analysez vos mots-clés pour estimer le gain de trafic additionnel atteignable avec votre stratégie SEO actuelle.
                                </div>
                              </div>
                            </div>

                            {/* ── Bulle tutoriel potentiel (étape 3) ── */}
                            {tutorialStep === 3 && (
                              <div className="mb-5 p-4 rounded-xl animate-[modalPop_0.5s_cubic-bezier(0.34,1.56,0.64,1)_0.2s_both]" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.32)" }}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-green-400 text-xs font-black uppercase tracking-wider">📊 Potentiel SEO</span>
                                  <span className="text-gray-600 text-[10px] font-bold uppercase tracking-wide">Étape 4 / 4</span>
                                </div>
                                <p className="text-white/70 text-xs leading-relaxed mb-3">
                                  Voici où vous pouvez <span className="text-white font-bold">gagner du trafic rapidement</span>. Calculez les opportunités détectées dans votre cocon sémantique et votre roadmap.
                                </p>
                                {projections ? (
                                  <button
                                    onClick={() => advanceTutorial(4)}
                                    className="w-full py-2.5 rounded-lg text-xs font-black text-white transition-all hover:opacity-90"
                                    style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 20px rgba(34,197,94,0.3)" }}
                                  >
                                    Accéder au dashboard complet →
                                  </button>
                                ) : (
                                  <div className="flex items-center gap-2 text-green-400/70 text-xs">
                                    <span className="text-base animate-bounce">↓</span>
                                    <span>Cliquez sur le bouton ci-dessous pour lancer le calcul</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Contenu potentiel */}
                            {projections ? (
                              <div className="flex flex-col gap-4 flex-1">
                                <div className="p-4 rounded-xl" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                                  <p className="text-gray-400 text-xs mb-1">Gain de trafic estimé / mois</p>
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <p className="text-white font-black text-3xl leading-none">+{projections.total_estimated_gain.low.toLocaleString("fr-FR")}</p>
                                    <p className="text-gray-500 text-sm font-bold">à +{projections.total_estimated_gain.high.toLocaleString("fr-FR")} clics</p>
                                  </div>
                                  <p className="text-green-400 text-xs font-bold mt-1">clics organiques / mois</p>
                                  <p className="text-gray-600 text-xs mt-1">{[
                                    projections.has_gsc_data && "GSC",
                                    projections.has_cocoon_data && "Cocon",
                                    projections.has_roadmap_data && "Roadmap",
                                    projections.has_cms_data && "CMS",
                                  ].filter(Boolean).length > 0
                                    ? `Basé sur : ${[
                                        projections.has_gsc_data && "GSC",
                                        projections.has_cocoon_data && "Cocon",
                                        projections.has_roadmap_data && "Roadmap",
                                        projections.has_cms_data && "CMS",
                                      ].filter(Boolean).join(" + ")}`
                                    : "Estimation — connectez GSC pour plus de précision"
                                  }</p>
                                </div>
                                <div className="flex-1 flex flex-col gap-1.5">
                                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-wider mb-1">Top opportunités</p>
                                  {(projections.estimated_results ?? []).slice(0, 5).map((item, i) => {
                                    const diffColor = item.difficulty === "easy" ? "#4ade80" : item.difficulty === "medium" ? "#fb923c" : "#f87171";
                                    return (
                                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-all" style={{ borderLeft: `2px solid ${diffColor}30` }}>
                                        <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: i === 0 ? "linear-gradient(135deg,#22c55e,#4ade80)" : "rgba(255,255,255,0.05)", color: i === 0 ? "white" : "#6b7280" }}>{i + 1}</span>
                                        <span className="flex-1 text-xs truncate" style={{ color: "rgba(255,255,255,0.65)" }}>{item.keyword}</span>
                                        <span className="flex-shrink-0 text-green-400 font-black text-xs">+{item.estimated_gain.toLocaleString("fr-FR")}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                                <button onClick={generateProjections} disabled={projectionsLoading} className="text-center text-xs text-gray-600 hover:text-green-400 transition-colors disabled:opacity-40 py-1">
                                  {projectionsLoading ? "Recalcul…" : "↺ Recalculer"}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-5 flex-1 justify-between">
                                <div className="flex flex-col gap-4">
                                  <p className="text-gray-400 text-sm leading-relaxed">
                                    Estimez le <span className="text-white font-bold">gain de trafic organique</span> que vous pouvez atteindre sur chacun de vos mots-clés cibles.
                                  </p>
                                  <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.12)" }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                    <p className="text-gray-400 text-xs">{(data?.keywordStats?.length ?? 0) + (data?.uncoveredKeywords?.length ?? 0)} mots-clés configurés à analyser</p>
                                  </div>
                                  <div className="space-y-2 p-4 rounded-xl" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.08)" }}>
                                    {["Détection des opportunités par mot-clé", "Estimation de gain de clics / mois", "Classement par difficulté et potentiel"].map((f, i) => (
                                      <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#4ade80" }} />
                                        {f}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <button
                                  onClick={generateProjections}
                                  disabled={projectionsLoading}
                                  className="relative w-full overflow-hidden py-4 rounded-xl font-black text-white text-sm uppercase tracking-wide transition-all disabled:opacity-60 group"
                                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 8px 32px rgba(34,197,94,0.3)" }}
                                >
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
                                  <span className="relative flex items-center justify-center gap-2">
                                    {projectionsLoading ? (
                                      <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Calcul en cours…</>
                                    ) : (
                                      <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>Calculer mon potentiel SEO</>
                                    )}
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                )}


              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 1.5 — PERFORMANCE GSC
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "performance" && (() => {
              if (!data?.site?.gsc_connected || !gscPerf) {
                return (
                  <div className="text-center py-20">
                    <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.15)" }}>
                      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" opacity="0.4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" opacity="0.4"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" opacity="0.4"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" opacity="0.4"/>
                      </svg>
                    </div>
                    <p className="text-white font-bold text-lg mb-2">Google Search Console non connecté</p>
                    <p className="text-gray-500 text-sm mb-5 max-w-md mx-auto">Connectez GSC pour voir vos clics, impressions, positions et opportunités SEO en temps réel.</p>
                    <a href="/api/auth/google" className="inline-block bg-gradient-to-r from-blue-500 to-blue-600 text-white font-black text-sm px-6 py-3 rounded-xl uppercase tracking-wide shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-shadow">
                      Connecter Google Search Console →
                    </a>
                  </div>
                );
              }

              const nearTop3 = gscPerf.pages.filter(p => p.position > 3 && p.position <= 10);
              const lowCtr = gscPerf.pages.filter(p => p.impressions > 20 && p.ctr < 2);
              const highPotential = gscPerf.pages.filter(p => p.position > 5 && p.position <= 20 && p.impressions > 30);
              const topOpp = [...gscPerf.pages]
                .filter(p => p.position > 3 && p.position <= 25)
                .sort((a, b) => (b.impressions / b.position) - (a.impressions / a.position))[0] ?? null;
              const potentialGain = topOpp ? Math.max(0, Math.round(topOpp.impressions * 0.15 - topOpp.clicks)) : 0;

              const scoreImpacts: string[] = [];
              if (lowCtr.length > 0) scoreImpacts.push(`CTR faible sur ${lowCtr.length} page${lowCtr.length > 1 ? "s" : ""}`);
              if (nearTop3.length > 0) scoreImpacts.push(`${nearTop3.length} mot${nearTop3.length > 1 ? "s" : ""}-clé${nearTop3.length > 1 ? "s" : ""} proche${nearTop3.length > 1 ? "s" : ""} du top 3`);
              if (gscPerf.avgPosition > 15) scoreImpacts.push("Position moyenne trop éloignée du top 10");
              if (gscPerf.totalClicks < 50) scoreImpacts.push("Volume de clics insuffisant pour l'autorité");

              return (
                <div className="space-y-5">
                  {/* Snapshot — 4 métriques */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { value: gscPerf.totalImpressions.toLocaleString("fr-FR"), label: "Impressions", sub: "30 derniers jours", color: "#4285F4" },
                      { value: gscPerf.totalClicks.toLocaleString("fr-FR"), label: "Clics", sub: "trafic organique", color: "#34A853" },
                      { value: `${(gscPerf.avgCtr * 100).toFixed(1)}%`, label: "CTR moyen", sub: "taux de clics", color: "#FBBC05" },
                      { value: gscPerf.avgPosition.toFixed(1), label: "Position moyenne", sub: "sur Google", color: "#EA4335" },
                    ].map((m, i) => (
                      <div key={m.label} className="group relative bg-white/[0.03] rounded-2xl p-6 overflow-hidden card-hover animate-fade-in-up" style={{ border: `1px solid ${m.color}18`, animationDelay: `${i * 80}ms` }}>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(ellipse at top right, ${m.color}10, transparent 60%)` }} />
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3 relative">{m.label}</p>
                        <p className="text-4xl font-black tracking-tight relative" style={{ color: m.color }}>{m.value}</p>
                        <p className="text-gray-600 text-xs mt-1 relative">{m.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Insights + Opportunité */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Insights */}
                    <div className="lg:col-span-7 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 animate-fade-in-up delay-200">
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-4">Insights automatiques</p>
                      <div className="grid grid-cols-2 gap-3 mb-5">
                        {[
                          { value: nearTop3.length, label: "Proches du top 3", desc: "Position 4 à 10", color: "#34A853" },
                          { value: lowCtr.length, label: "CTR faible", desc: "< 2% avec impressions", color: "#FBBC05" },
                          { value: highPotential.length, label: "Haut potentiel", desc: "Position 5-20, bon volume", color: "#4285F4" },
                          { value: gscPerf.pages.length, label: "Pages actives", desc: "Vues dans Google", color: "#EA4335" },
                        ].map((ins) => (
                          <div key={ins.label} className="flex items-center gap-3 rounded-xl p-4" style={{ background: `${ins.color}06`, border: `1px solid ${ins.color}12` }}>
                            <p className="text-3xl font-black leading-none" style={{ color: ins.color }}>{ins.value}</p>
                            <div>
                              <p className="text-white text-xs font-bold">{ins.label}</p>
                              <p className="text-gray-600 text-[10px]">{ins.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Impact score */}
                      {scoreImpacts.length > 0 && (
                        <div className="rounded-xl p-4" style={{ background: "rgba(66,133,244,0.04)", border: "1px solid rgba(66,133,244,0.1)" }}>
                          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-blue-400/70 mb-2">Impact sur votre score SEO</p>
                          <div className="space-y-1.5">
                            {scoreImpacts.map((impact, i) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ["#EA4335", "#FBBC05", "#4285F4", "#34A853"][i] }} />
                                {impact}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Opportunité principale */}
                    <div className="lg:col-span-5 space-y-5">
                      {topOpp && potentialGain > 0 && (
                        <div className="relative bg-white/[0.03] rounded-2xl p-6 overflow-hidden animate-fade-in-up delay-300" style={{ border: "1px solid rgba(34,168,83,0.15)" }}>
                          <div className="absolute top-0 right-0 w-40 h-40 pointer-events-none" style={{ background: "radial-gradient(circle, rgba(34,168,83,0.08), transparent 70%)" }} />
                          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-green-400/70 mb-4 relative">Opportunité principale</p>
                          <p className="text-white font-bold text-lg mb-1 relative truncate">{(() => { try { return new URL(topOpp.url).pathname; } catch { return topOpp.url; } })()}</p>
                          <div className="flex items-center gap-4 text-sm mb-4 relative">
                            <div>
                              <p className="text-gray-500 text-[10px] font-bold uppercase">Position</p>
                              <p className="text-white font-black text-2xl">{topOpp.position}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-[10px] font-bold uppercase">Impressions</p>
                              <p className="text-white font-black text-2xl">{topOpp.impressions}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-[10px] font-bold uppercase">Gain estimé</p>
                              <p className="text-green-400 font-black text-2xl">+{potentialGain}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowOptimizeConfirm(true)}
                            className="relative w-full overflow-hidden py-3 rounded-xl font-black text-white text-sm transition-all group active:scale-[0.97]"
                            style={{ background: "linear-gradient(135deg, #34A853, #22c55e)", boxShadow: "0 8px 24px rgba(34,168,83,0.25)" }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
                            <span className="relative">Optimiser automatiquement →</span>
                          </button>
                        </div>
                      )}

                      {/* Confiance */}
                      <div className="rounded-xl p-4 text-center" style={{ background: "rgba(66,133,244,0.04)", border: "1px solid rgba(66,133,244,0.08)" }}>
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                          </svg>
                          <span className="text-gray-500 text-xs font-bold">Données Google Search Console</span>
                        </div>
                        <p className="text-gray-600 text-[10px]">{gscPerf.pages.length} pages analysées — 30 derniers jours</p>
                      </div>
                    </div>
                  </div>

                  {/* Graphique clics & impressions — 30 jours */}
                  {gscPerf.dailyChart && gscPerf.dailyChart.length > 0 && (
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 animate-fade-in-up delay-300">
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-5">Évolution — 30 derniers jours</p>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={gscPerf.dailyChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gscClicksGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#34A853" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#34A853" stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="gscImprGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4285F4" stopOpacity={0.2} />
                                <stop offset="95%" stopColor="#4285F4" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={(v: string) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={50} />
                            <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} labelStyle={{ color: "#9ca3af" }} labelFormatter={(v) => new Date(String(v)).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} />
                            <Area yAxisId="right" type="monotone" dataKey="impressions" stroke="#4285F4" strokeWidth={2} fillOpacity={1} fill="url(#gscImprGrad)" name="Impressions" />
                            <Area yAxisId="left" type="monotone" dataKey="clicks" stroke="#34A853" strokeWidth={2} fillOpacity={1} fill="url(#gscClicksGrad)" name="Clics" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center justify-center gap-6 mt-3">
                        <div className="flex items-center gap-2"><div className="w-3 h-0.5 rounded-full" style={{ background: "#34A853" }} /><span className="text-gray-500 text-[10px] font-bold">Clics</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-0.5 rounded-full" style={{ background: "#4285F4" }} /><span className="text-gray-500 text-[10px] font-bold">Impressions</span></div>
                      </div>
                    </div>
                  )}

                  {/* Top pages + Top requêtes côte à côte */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Top pages */}
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden animate-fade-in-up delay-400">
                      <div className="px-6 py-4 border-b border-white/[0.06]">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Top pages par clics</p>
                      </div>
                      <div className="divide-y divide-white/[0.04]">
                        {gscPerf.pages.slice(0, 10).map((page, i) => {
                          const path = (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })();
                          const posColor = page.position <= 3 ? "#34A853" : page.position <= 10 ? "#FBBC05" : page.position <= 20 ? "#EA4335" : "#6b7280";
                          return (
                            <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: i === 0 ? "linear-gradient(135deg, #4285F4, #34A853)" : "rgba(255,255,255,0.05)", color: i === 0 ? "white" : "#6b7280" }}>{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-medium truncate">{path}</p>
                              </div>
                              <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                                <div className="text-right">
                                  <p className="text-white font-bold text-xs">{page.clicks}</p>
                                  <p className="text-gray-600 text-[8px]">clics</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-xs" style={{ color: posColor }}>{page.position}</p>
                                  <p className="text-gray-600 text-[8px]">pos.</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top requêtes */}
                    {gscPerf.queries && gscPerf.queries.length > 0 && (
                      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden animate-fade-in-up delay-400">
                        <div className="px-6 py-4 border-b border-white/[0.06]">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Top requêtes Google</p>
                        </div>
                        <div className="divide-y divide-white/[0.04]">
                          {gscPerf.queries.slice(0, 15).map((q, i) => {
                            const posColor = q.position <= 3 ? "#34A853" : q.position <= 10 ? "#FBBC05" : q.position <= 20 ? "#EA4335" : "#6b7280";
                            return (
                              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: i < 3 ? "linear-gradient(135deg, #FBBC05, #f97316)" : "rgba(255,255,255,0.05)", color: i < 3 ? "white" : "#6b7280" }}>{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-xs font-medium truncate">{q.query}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                                  <div className="text-right">
                                    <p className="text-white font-bold text-xs">{q.clicks}</p>
                                    <p className="text-gray-600 text-[8px]">clics</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-gray-400 font-bold text-xs">{q.impressions}</p>
                                    <p className="text-gray-600 text-[8px]">impr.</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-xs" style={{ color: posColor }}>{q.position}</p>
                                    <p className="text-gray-600 text-[8px]">pos.</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-gray-400 font-bold text-xs">{q.ctr}%</p>
                                    <p className="text-gray-600 text-[8px]">CTR</p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Distribution des positions */}
                  {(() => {
                    const posRanges = [
                      { label: "Top 3", min: 0, max: 3, color: "#34A853" },
                      { label: "4–10", min: 3, max: 10, color: "#FBBC05" },
                      { label: "11–20", min: 10, max: 20, color: "#EA4335" },
                      { label: "21–50", min: 20, max: 50, color: "#6b7280" },
                      { label: "50+", min: 50, max: 9999, color: "#374151" },
                    ];
                    const allItems = [...gscPerf.pages, ...(gscPerf.queries ?? []).map(q => ({ ...q, url: q.query }))];
                    const dist = posRanges.map(r => ({
                      ...r,
                      count: allItems.filter(p => p.position > r.min && p.position <= r.max).length,
                    }));
                    const maxCount = Math.max(...dist.map(d => d.count), 1);

                    return (
                      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 animate-fade-in-up delay-500">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-5">Distribution des positions</p>
                        <div className="space-y-3">
                          {dist.map(d => (
                            <div key={d.label} className="flex items-center gap-4">
                              <span className="text-gray-400 text-xs font-bold w-12 text-right">{d.label}</span>
                              <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
                                <div
                                  className="h-full rounded-lg flex items-center px-3 transition-all duration-700"
                                  style={{ width: `${Math.max(2, (d.count / maxCount) * 100)}%`, background: `${d.color}30`, borderLeft: `3px solid ${d.color}` }}
                                >
                                  <span className="text-[10px] font-black" style={{ color: d.color }}>{d.count}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* ════════════════════════════════════════════════════════════
                TAB — MAILLAGE INTERNE
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "linking" && (
              <div className="animate-fade-in-up">
                <LinkingGraph />
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 2 — PUBLICATIONS
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "publications" && (
              <div className="space-y-5">

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Total publiés", value: cmsPages.length || (kpis?.totalArticles ?? 0), icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>), color: "#f97316", delay: "0ms" },
                    { label: "Ce mois", value: cmsThisMonth, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>), color: "#fb923c", delay: "100ms" },
                    { label: "Cette semaine", value: cmsThisWeek, icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>), color: "#ef4444", delay: "200ms" },
                  ].map(s => (
                    <div key={s.label} className="relative group bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden" style={{ animationDelay: s.delay }}>
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" style={{ background: `radial-gradient(ellipse at top right, ${s.color}12, transparent 60%)` }} />
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{s.label}</p>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: `${s.color}15`, color: s.color }}>{s.icon}</div>
                      </div>
                      <p className="text-4xl font-black text-white tracking-tight">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 overflow-hidden animate-fade-in-up delay-200">
                  <div className="absolute bottom-0 left-0 w-72 h-48 pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom left, rgba(249,115,22,0.07) 0%, transparent 70%)" }} />
                  <div className="flex items-center justify-between mb-5 relative">
                    <div>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Publications par jour</p>
                      <p className="text-xl font-black text-white">30 derniers jours</p>
                    </div>
                    <span className="relative overflow-hidden text-xs bg-orange-500/10 text-orange-400 font-bold px-3 py-1.5 rounded-full">
                      <span className="absolute inset-0 animate-[sweep_3s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.25), transparent)" }} />
                      {cmsPages.length || (kpis?.totalArticles ?? 0)} au total
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={(() => {
                      // Recomputer le graphique avec les CMS pages (source de vérité)
                      const cmsCounts = new Map<string, number>();
                      for (const page of cmsPages) {
                        if (!page.published_at) continue;
                        const pd = new Date(page.published_at);
                        const label = pd.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
                        cmsCounts.set(label, (cmsCounts.get(label) ?? 0) + 1);
                      }
                      // Prendre le max entre base et CMS pour chaque jour
                      return data.pubsChart.map(d => ({
                        ...d,
                        articles: Math.max(d.articles, cmsCounts.get(d.date) ?? 0),
                      }));
                    })()} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.35} />
                          <stop offset="85%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <filter id="areaGlow" x="-5%" y="-30%" width="110%" height="160%">
                          <feGaussianBlur stdDeviation="3" result="blur"/>
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                      <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(249,115,22,0.2)", strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="articles" stroke="#f97316" strokeWidth={2.5} fill="url(#areaGrad2)" filter="url(#areaGlow)" isAnimationActive={true} animationDuration={1400} animationEasing="ease-out" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden animate-fade-in-up delay-300">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Toutes les pages du site</p>
                      {cmsPages.length > 0 && <span className="text-xs text-gray-600 font-medium">{cmsPages.length} page(s)</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => { loadCmsPages(); }} disabled={cmsPagesLoading} className="group flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-blue-500/40 text-gray-400 hover:text-blue-400 transition-all disabled:opacity-40">
                        {cmsPagesLoading ? (<><span className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" /> Scan CMS...</>) : (<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/></svg>Synchroniser</>)}
                      </button>
                      <button onClick={cleanupBrokenLinks} disabled={cleanupLoading} className="group flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-red-500/40 text-gray-400 hover:text-red-400 transition-all disabled:opacity-40">
                        {cleanupLoading ? (<><span className="w-3 h-3 rounded-full border-2 border-red-400 border-t-transparent animate-spin" /> Nettoyage...</>) : (<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/><line x1="2" y1="2" x2="22" y2="22"/></svg>Nettoyer les liens</>)}
                      </button>
                      {syncResult && <span className="text-xs text-blue-400">{syncResult}</span>}
                      {cleanupResult && <span className={`text-xs ${cleanupResult.startsWith("Erreur") ? "text-red-400" : "text-green-400"}`}>{cleanupResult}</span>}
                      {data.site?.gsc_connected && data.site?.gsc_site_url && (
                        <div className="relative group/tip">
                          <button onClick={checkIndexation} disabled={indexationLoading} className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-orange-500/40 text-gray-400 hover:text-orange-400 transition-all disabled:opacity-40">
                            {indexationLoading ? (<><span className="w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" /> Vérification...</>) : (<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Vérifier l&apos;indexation</>)}
                          </button>
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 px-4 py-3 bg-gray-900 border border-white/10 rounded-xl shadow-2xl opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-200 z-50">
                            <p className="text-white text-xs font-bold mb-1">Qu&apos;est-ce que l&apos;indexation ?</p>
                            <p className="text-gray-400 text-[11px] leading-relaxed">L&apos;indexation, c&apos;est quand Google ajoute votre page dans sa base de donn&eacute;es. Une page index&eacute;e peut appara&icirc;tre dans les r&eacute;sultats de recherche. Une page non index&eacute;e est invisible sur Google.</p>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-900 border-r border-b border-white/10 rotate-45 -mt-[5px]" />
                          </div>
                        </div>
                      )}
                      <Link href="/generate" className="group relative overflow-hidden flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/50 text-orange-400 hover:text-orange-300 transition-all">
                        <span className="absolute inset-0 animate-[sweep_3s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.15), transparent)" }} />
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 relative"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                        <span className="relative">+ Créer un article</span>
                      </Link>
                    </div>
                  </div>

                  {/* Filtres */}
                  <div className="flex items-center gap-2 px-6 py-3 border-b border-white/[0.06]">
                    {([
                      { key: "all", label: "Toutes", count: cmsPages.length },
                      { key: "articles", label: "Articles", count: cmsPages.filter(p => p.page_type === "article").length },
                      { key: "pages", label: "Pages", count: cmsPages.filter(p => p.page_type === "page").length },
                      { key: "indexed", label: "Indexées", count: cmsPages.filter(p => p.url && indexationResults[p.url]?.indexed === true).length },
                      { key: "not_indexed", label: "Non indexées", count: cmsPages.filter(p => p.url && indexationResults[p.url]?.indexed === false).length },
                    ] as { key: typeof pubFilter; label: string; count: number }[]).map(f => (
                      <button
                        key={f.key}
                        onClick={() => setPubFilter(f.key)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                          pubFilter === f.key
                            ? "border-orange-500/50 bg-orange-500/10 text-orange-400"
                            : "border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20"
                        }`}
                      >
                        {f.label} <span className="ml-1 opacity-60">{f.count}</span>
                      </button>
                    ))}
                  </div>

                  {cmsPagesLoading && cmsPages.length === 0 ? (
                    <div className="text-center py-16">
                      <span className="w-6 h-6 rounded-full border-2 border-orange-400 border-t-transparent animate-spin inline-block mb-3" />
                      <p className="text-gray-400 text-sm">Scan du CMS en cours...</p>
                    </div>
                  ) : (() => {
                    const filtered = cmsPages.filter(pub => {
                      if (pubFilter === "articles") return pub.page_type === "article";
                      if (pubFilter === "pages") return pub.page_type === "page";
                      if (pubFilter === "indexed") return pub.url && indexationResults[pub.url]?.indexed === true;
                      if (pubFilter === "not_indexed") return pub.url && indexationResults[pub.url]?.indexed === false;
                      return true;
                    });

                    return filtered.length === 0 ? (
                      <div className="text-center py-16">
                        <p className="text-white font-bold mb-2">{pubFilter === "all" ? "Aucune page détectée" : "Aucun résultat pour ce filtre"}</p>
                        <p className="text-gray-500 text-sm mb-5">{pubFilter === "all" ? "Cliquez sur Synchroniser pour scanner votre CMS" : "Essayez un autre filtre ou vérifiez l\u2019indexation"}</p>
                        {pubFilter === "all" && (
                          <button onClick={() => loadCmsPages()} className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-6 py-2.5 rounded-lg text-sm uppercase tracking-wide">
                            Scanner le CMS
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                          {filtered.map((pub, i) => {
                            const idx = pub.url ? indexationResults[pub.url] : null;
                            const isConfirming = confirmDeleteId === String(pub.id);
                            const isDeleting = deletingPostId === String(pub.id);
                            return (
                              <div
                                key={pub.id}
                                className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-orange-500/30 hover:bg-white/[0.04] transition-all overflow-hidden animate-fade-in-up"
                                style={{ animationDelay: `${i * 50}ms`, opacity: isDeleting ? 0.4 : 1 }}
                              >
                                {/* Delete confirmation overlay */}
                                {isConfirming && (
                                  <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 p-4">
                                    <p className="text-white font-bold text-sm text-center">Supprimer cet article du CMS ?</p>
                                    <p className="text-gray-400 text-xs text-center">Cette action est irréversible</p>
                                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg mt-1" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                      <p className="text-amber-400/90 text-[10px] leading-relaxed">D&apos;autres articles peuvent contenir des liens vers cette page. Pensez à cliquer sur <strong>&quot;Nettoyer les liens&quot;</strong> après la suppression.</p>
                                    </div>
                                    <div className="flex gap-2 mt-1">
                                      <button
                                        onClick={() => setConfirmDeleteId(null)}
                                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-gray-300 hover:bg-white/20 transition-colors"
                                      >
                                        Annuler
                                      </button>
                                      <button
                                        onClick={() => deletePublication(pub)}
                                        disabled={isDeleting}
                                        className="px-4 py-1.5 rounded-lg text-xs font-bold bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                                      >
                                        {isDeleting ? "Suppression..." : "Confirmer"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {/* Thumbnail */}
                                <a href={pub.url || "#"} target="_blank" rel="noopener noreferrer" className="block">
                                  <div className="relative w-full aspect-[16/9] bg-white/[0.03] overflow-hidden">
                                    {pub.cover_image ? (
                                      <img
                                        src={pub.cover_image}
                                        alt={pub.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        loading="lazy"
                                        onError={(e) => {
                                          const target = e.currentTarget;
                                          target.style.display = "none";
                                          const placeholder = target.nextElementSibling as HTMLElement | null;
                                          if (placeholder) placeholder.style.display = "flex";
                                        }}
                                      />
                                    ) : null}
                                    <div className={`w-full h-full ${pub.cover_image ? "hidden" : "flex"} items-center justify-center absolute inset-0`}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="w-10 h-10 text-white/[0.06]">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                                      </svg>
                                    </div>
                                    {/* Type badge overlay */}
                                    <div className="absolute top-2 left-2">
                                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase backdrop-blur-sm ${pub.page_type === "page" ? "bg-blue-500/20 text-blue-300 border border-blue-500/20" : "bg-orange-500/20 text-orange-300 border border-orange-500/20"}`}>
                                        {pub.page_type === "page" ? "Page" : "Article"}
                                      </span>
                                    </div>
                                    {/* Indexation badge overlay */}
                                    {idx && (
                                      <div className="absolute top-2 right-2">
                                        <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm ${idx.indexed ? "bg-green-500/20 text-green-300 border border-green-500/20" : "bg-red-500/20 text-red-300 border border-red-500/20"}`}>
                                          <span className={`w-1 h-1 rounded-full ${idx.indexed ? "bg-green-400" : "bg-red-400"}`} />
                                          {idx.indexed ? "Indexé" : "Non indexé"}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </a>
                                {/* Content */}
                                <div className="p-3.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <a href={pub.url || "#"} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                                      <h3 className="text-white font-bold text-sm leading-snug line-clamp-2 group-hover:text-orange-400 transition-colors mb-2">
                                        {pub.title}
                                      </h3>
                                    </a>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(String(pub.id)); }}
                                      className="flex-shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                                      title="Supprimer"
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14M10 11v6M14 11v6"/>
                                      </svg>
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {pub.keyword && (
                                      <span className="bg-orange-500/10 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        {pub.keyword}
                                      </span>
                                    )}
                                    <span className="text-gray-600 text-[10px]">
                                      {new Date(pub.published_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 3 — MOTS-CLÉS
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "keywords" && (() => {
              // Mapper chaque mot-clé à son cluster du cocon
              type KwCocoonInfo = { cluster: string; role: "pilier" | "support"; priority: string };
              const kwCocoonMap = new Map<string, KwCocoonInfo>();
              if (cocoonData?.clusters) {
                for (const cluster of cocoonData.clusters) {
                  if (cluster.pillar?.keyword) kwCocoonMap.set(cluster.pillar.keyword.toLowerCase(), { cluster: cluster.name, role: "pilier", priority: cluster.priority });
                  for (const sp of cluster.support_pages ?? []) {
                    if (sp.keyword) kwCocoonMap.set(sp.keyword.toLowerCase(), { cluster: cluster.name, role: "support", priority: cluster.priority });
                  }
                }
              }

              // Enrichir les keywordStats avec les infos cocon (match partiel)
              const enrichedStats = data.keywordStats.map(kw => {
                const kwLower = kw.keyword.toLowerCase();
                let cocoonInfo = kwCocoonMap.get(kwLower);
                if (!cocoonInfo) {
                  for (const [key, info] of kwCocoonMap.entries()) {
                    if (kwLower.includes(key) || key.includes(kwLower)) { cocoonInfo = info; break; }
                  }
                }
                return { ...kw, cocoonInfo: cocoonInfo ?? null };
              });

              // Stats
              const inCocoon = enrichedStats.filter(k => k.cocoonInfo).length;
              const pillarCount = enrichedStats.filter(k => k.cocoonInfo?.role === "pilier").length;

              return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Mots-clés", value: kpis?.totalKeywords ?? 0, color: "#f97316" },
                    { label: "Couverts", value: kpis?.coveredKeywords ?? 0, color: "#22c55e" },
                    { label: "Dans le cocon", value: inCocoon, color: "#fb923c" },
                    { label: "Pages piliers", value: pillarCount, color: "#ef4444" },
                  ].map(s => (
                    <div key={s.label} className="group relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 text-center overflow-hidden card-hover">
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: `radial-gradient(ellipse at center, ${s.color}10, transparent 70%)` }} />
                      <p className="text-3xl font-black relative" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mt-1 relative">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Mots-clés groupés par cluster */}
                {cocoonData ? (
                  <div className="space-y-4">
                    {(cocoonData.clusters ?? []).map((cluster, ci) => {
                      const orphanedKws = ci === 0 ? enrichedStats.filter(k => !k.cocoonInfo) : [];
                      const priorityColors: Record<string, string> = {
                        haute: "border-red-500/20 bg-red-500/[0.03]",
                        moyenne: "border-orange-500/20 bg-orange-500/[0.03]",
                        faible: "border-white/[0.08] bg-white/[0.02]",
                      };

                      return (
                        <div key={cluster.name} className={`rounded-2xl overflow-hidden animate-fade-in-up ${priorityColors[cluster.priority] ?? priorityColors.faible}`} style={{ border: "1px solid", animationDelay: `${ci * 60}ms` }}>
                          <div className="px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(249,115,22,0.12)" }}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="1.5" className="w-4 h-4"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4m-7.07-15.07l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4"/></svg>
                              </div>
                              <div>
                                <p className="text-white font-bold text-sm">{cluster.name}</p>
                                <p className="text-gray-500 text-[10px]">{cluster.objective}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                cluster.priority === "haute" ? "text-red-400 bg-red-500/10" :
                                cluster.priority === "moyenne" ? "text-orange-400 bg-orange-500/10" :
                                "text-gray-400 bg-white/[0.05]"
                              }`}>{cluster.priority}</span>
                              <span className="text-orange-400/60 text-xs font-bold">+{cluster.traffic_potential}</span>
                            </div>
                          </div>

                          <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                            {/* Page pilier */}
                            {(() => {
                              const pillarKw = enrichedStats.find(k => k.keyword.toLowerCase() === cluster.pillar.keyword.toLowerCase() || k.keyword.toLowerCase().includes(cluster.pillar.keyword.toLowerCase()));
                              return (
                                <div className="relative rounded-xl p-3 overflow-hidden" style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)" }}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" />
                                    <span className="text-[9px] font-black uppercase tracking-wide text-orange-400">Pilier</span>
                                    <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cluster.pillar.status === "existing" ? "text-green-400 bg-green-500/10" : "text-orange-400 bg-orange-500/10"}`}>
                                      {cluster.pillar.status === "existing" ? "Existant" : "A créer"}
                                    </span>
                                  </div>
                                  <p className="text-white text-sm font-semibold mb-0.5">{cluster.pillar.keyword}</p>
                                  {pillarKw && pillarKw.count > 0 ? (
                                    <p className="text-green-400 text-[10px] font-bold">{pillarKw.count} article{pillarKw.count > 1 ? "s" : ""} publié{pillarKw.count > 1 ? "s" : ""}</p>
                                  ) : (
                                    <p className="text-gray-600 text-[10px]">{cluster.pillar.title}</p>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Pages support */}
                            {(cluster.support_pages ?? []).slice(0, 5).map((sp, si) => {
                              const spKw = enrichedStats.find(k => k.keyword.toLowerCase() === sp.keyword.toLowerCase() || k.keyword.toLowerCase().includes(sp.keyword.toLowerCase()));
                              return (
                                <div key={si} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sp.status === "existing" ? "bg-green-400" : "bg-gray-500"}`} />
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">Support</span>
                                    {spKw && spKw.count > 0 && (
                                      <span className="ml-auto text-[9px] font-bold text-green-400">{spKw.count} art.</span>
                                    )}
                                  </div>
                                  <p className="text-gray-300 text-sm">{sp.keyword}</p>
                                  <p className="text-gray-600 text-[10px] truncate">{sp.title}</p>
                                </div>
                              );
                            })}
                            {(cluster.support_pages ?? []).length > 5 && (
                              <div className="rounded-xl p-3 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.06)" }}>
                                <span className="text-gray-600 text-xs">+{(cluster.support_pages ?? []).length - 5} pages support</span>
                              </div>
                            )}
                          </div>

                          {/* Mots-clés orphelins (affichés dans le premier cluster) */}
                          {orphanedKws.length > 0 && ci === 0 && (
                            <div className="mx-5 mb-4 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.04)", border: "1px dashed rgba(239,68,68,0.15)" }}>
                              <p className="text-[9px] font-black uppercase tracking-wide text-red-400/70 mb-2">Mots-clés hors cocon ({orphanedKws.length})</p>
                              <div className="flex flex-wrap gap-1.5">
                                {orphanedKws.map((k, ki) => (
                                  <span key={ki} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-400 border border-white/[0.06]">{k.keyword}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Mots-clés non mappés si pas de premier cluster */}
                    {enrichedStats.filter(k => !k.cocoonInfo).length > 0 && (cocoonData.clusters ?? []).length === 0 && (
                      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-4">Mots-clés non structurés</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {enrichedStats.filter(k => !k.cocoonInfo).map((kw, i) => (
                            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                              <p className="text-white text-sm font-bold">{kw.keyword}</p>
                              <p className="text-gray-600 text-[10px] mt-1">{kw.count > 0 ? `${kw.count} article(s)` : "Non couvert"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Fallback sans cocon */
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-6">Performance par mot-clé</p>
                    {data.keywordStats.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-gray-500 text-sm">Aucun mot-clé configuré. <Link href="/settings" className="text-orange-400 hover:underline">Configurer les mots-clés →</Link></p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {data.keywordStats.map((kw, i) => (
                          <div key={kw.keyword} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 card-hover animate-fade-in-up" style={{animationDelay: `${i * 80}ms`}}>
                            <div className="flex items-start justify-between mb-3">
                              <p className="text-white font-bold">{kw.keyword}</p>
                              <span className={`text-xs font-black px-2 py-1 rounded-full ${kw.count > 0 ? "bg-orange-500/10 text-orange-400" : "bg-white/[0.05] text-gray-500"}`}>
                                {kw.count > 0 ? `${kw.count} article${kw.count > 1 ? "s" : ""}` : "Non couvert"}
                              </span>
                            </div>
                            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-2">
                              <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500" style={{ width: `${maxKeywordCount > 0 ? (kw.count / maxKeywordCount) * 100 : 0}%`, transition: "width 1s ease" }} />
                            </div>
                            {kw.lastPublished ? (
                              <p className="text-gray-600 text-xs">Dernier article : {new Date(kw.lastPublished).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                            ) : (
                              <p className="text-gray-600 text-xs">Pas encore publié — sera priorisé prochainement</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 p-3 rounded-xl text-center" style={{ background: "rgba(249,115,22,0.05)", border: "1px dashed rgba(249,115,22,0.15)" }}>
                      <p className="text-orange-400/70 text-xs font-bold">Générez votre cocon sémantique pour structurer vos mots-clés en clusters</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Link href="/settings" className="flex-1 bg-white/[0.03] border border-white/[0.07] hover:border-orange-500/30 rounded-xl p-4 text-center transition-colors group">
                    <p className="text-white font-bold group-hover:text-orange-400 transition-colors">Modifier les mots-clés</p>
                    <p className="text-gray-600 text-xs mt-1">Ajouter ou supprimer des mots-clés cibles</p>
                  </Link>
                  <Link href="/generate" className="flex-1 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 hover:border-orange-500/40 rounded-xl p-4 text-center transition-colors">
                    <p className="text-orange-400 font-bold">Créer un article</p>
                    <p className="text-gray-600 text-xs mt-1">Choisir le mot-clé et prévisualiser</p>
                  </Link>
                </div>
              </div>
              );
            })()}

            {/* ════════════════════════════════════════════════════════════
                TAB 4 — CALENDRIER
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "calendar" && (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  {(() => {
                    const streak = kpis?.streak ?? 0;
                    const color = streak >= 7 ? "#f97316" : streak >= 3 ? "#fb923c" : "#6b7280";
                    return (
                      <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden group">
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" style={{ background: `radial-gradient(ellipse at top right, ${color}12, transparent 60%)` }} />
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Streak actuel</p>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: `${color}18`, color }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                          </div>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tight">{streak}<span className="text-xl text-gray-500 font-bold ml-1">j</span></p>
                        <p className="text-xs mt-2 font-medium" style={{ color }}>{streak >= 7 ? "En feu 🔥 continue !" : streak >= 3 ? "Bonne dynamique" : streak > 0 ? "Lancé !" : "Publie aujourd'hui"}</p>
                      </div>
                    );
                  })()}

                  {(() => {
                    const best = kpis?.bestStreak ?? 0;
                    return (
                      <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden group" style={{ animationDelay: "120ms" }}>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" style={{ background: "radial-gradient(ellipse at top right, rgba(251,191,36,0.08), transparent 60%)" }} />
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Meilleure streak</p>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                          </div>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tight">{best}<span className="text-xl text-gray-500 font-bold ml-1">j</span></p>
                        <p className="text-xs mt-2 font-medium text-yellow-500/70">Record personnel</p>
                      </div>
                    );
                  })()}

                  {(() => {
                    const days = data.calendarData.slice(-30).filter(d => d.count > 0).length;
                    const pct = Math.round((days / 30) * 100);
                    return (
                      <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden group" style={{ animationDelay: "240ms" }}>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" style={{ background: "radial-gradient(ellipse at top right, rgba(34,197,94,0.07), transparent 60%)" }} />
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Jours publiés / 30j</p>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110" style={{ background: "rgba(34,197,94,0.10)", color: "#22c55e" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>
                          </div>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tight">{days}</p>
                        <div className="mt-2">
                          <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400" style={{ width: `${pct}%`, transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.3s" }} />
                          </div>
                          <p className="text-xs mt-1.5 font-medium text-green-500/70">{pct}% de régularité</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Calendrier d'activité ──────────────────────────────────── */}
                {(() => {
                  const todayStr = new Date().toISOString().split("T")[0];
                  const sliced = data.calendarData.slice(-(calRange));
                  const totalPubs = sliced.reduce((s, d) => s + d.count, 0);
                  const activeDays = sliced.filter(d => d.count > 0).length;
                  const maxCount = Math.max(...sliced.map(d => d.count), 1);
                  const pubs = data.recentPublications ?? [];

                  // Build lookup map for calendar data
                  const calMap = new Map(sliced.map(d => [d.date, d.count]));

                  return (
                    <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover overflow-hidden">
                      <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-[0.04] pointer-events-none" style={{ background: "radial-gradient(circle, #f97316, transparent 70%)" }} />

                      {/* Header */}
                      <div className="flex items-center justify-between mb-6 relative">
                        <div>
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Activité éditoriale</p>
                          <div className="flex items-center gap-3">
                            <p className="text-xl font-black text-white">{calRange} derniers jours</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-orange-400 text-sm font-bold">{totalPubs}</span>
                              <span className="text-gray-600 text-xs">article{totalPubs !== 1 ? "s" : ""}</span>
                              <span className="text-gray-700 mx-1">·</span>
                              <span className="text-green-400/80 text-sm font-bold">{activeDays}</span>
                              <span className="text-gray-600 text-xs">jour{activeDays !== 1 ? "s" : ""} actif{activeDays !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {([7, 30] as const).map(r => (
                            <button key={r} onClick={() => setCalRange(r)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-300 ${calRange === r ? "bg-orange-500/20 text-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.15)]" : "bg-white/[0.04] text-gray-600 hover:bg-white/[0.08] hover:text-gray-400"}`}>
                              {r}j
                            </button>
                          ))}
                        </div>
                      </div>

                      {calRange === 7 ? (
                        /* ══════ Vue 7 jours : barres horizontales ══════ */
                        <div className="space-y-2">
                          {sliced.map((entry, i) => {
                            const d = new Date(entry.date + "T12:00:00");
                            const isToday = entry.date === todayStr;
                            const pct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
                            const dayPubs = pubs.filter(p => p.published_at.startsWith(entry.date));
                            return (
                              <div key={i} className={`group relative flex items-center gap-3 p-2.5 rounded-xl transition-all duration-300 ${isToday ? "bg-orange-500/[0.08] ring-1 ring-orange-500/20" : "hover:bg-white/[0.03]"}`}>
                                <div className="w-16 flex-shrink-0 text-center">
                                  <p className={`text-xs font-bold uppercase ${isToday ? "text-orange-400" : "text-gray-500"}`}>
                                    {d.toLocaleDateString("fr-FR", { weekday: "short" })}
                                  </p>
                                  <p className={`text-lg font-black ${isToday ? "text-white" : "text-gray-400"}`}>{d.getDate()}</p>
                                </div>
                                <div className="flex-1">
                                  <div className="h-8 bg-white/[0.04] rounded-lg overflow-hidden">
                                    <div className="h-full rounded-lg transition-all duration-700 ease-out" style={{ width: `${Math.max(pct, entry.count > 0 ? 8 : 0)}%`, background: entry.count === 0 ? "transparent" : `linear-gradient(90deg, rgba(249,115,22,${0.3 + (pct/100)*0.5}), rgba(251,146,60,${0.4 + (pct/100)*0.5}))`, transitionDelay: `${i * 80}ms` }} />
                                  </div>
                                  {dayPubs.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {dayPubs.map((p, j) => (
                                        <div key={j} className="flex items-center gap-1.5">
                                          <div className="w-1 h-1 rounded-full bg-orange-400/60 flex-shrink-0" />
                                          <span className="text-[11px] text-gray-500 truncate">{p.title}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="w-8 text-right flex-shrink-0">
                                  <span className={`text-sm font-black ${entry.count > 0 ? "text-orange-400" : "text-gray-700"}`}>{entry.count}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* ══════ Vue 30 jours : vrai calendrier mensuel ══════ */
                        (() => {
                          // Build proper month calendar from last 30 days
                          const today = new Date();
                          const firstDay = new Date(today);
                          firstDay.setDate(firstDay.getDate() - 29);
                          // Get the Monday of the week containing firstDay
                          const startOfCal = new Date(firstDay);
                          const dow = startOfCal.getDay();
                          startOfCal.setDate(startOfCal.getDate() - ((dow + 6) % 7)); // rewind to Monday

                          // Generate all days from startOfCal to today (and pad to end of week)
                          const endOfCal = new Date(today);
                          const endDow = endOfCal.getDay();
                          endOfCal.setDate(endOfCal.getDate() + (endDow === 0 ? 0 : 7 - endDow)); // forward to Sunday

                          const allDays: Date[] = [];
                          const cur = new Date(startOfCal);
                          while (cur <= endOfCal) {
                            allDays.push(new Date(cur));
                            cur.setDate(cur.getDate() + 1);
                          }

                          const weeks: Date[][] = [];
                          for (let i = 0; i < allDays.length; i += 7) {
                            weeks.push(allDays.slice(i, i + 7));
                          }

                          const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
                          const firstDateStr = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-${String(firstDay.getDate()).padStart(2, "0")}`;

                          return (
                            <div>
                              {/* Day headers */}
                              <div className="grid grid-cols-7 gap-1 mb-1">
                                {dayLabels.map(d => (
                                  <div key={d} className="text-center">
                                    <span className="text-[10px] font-semibold text-gray-600 uppercase">{d}</span>
                                  </div>
                                ))}
                              </div>
                              {/* Weeks */}
                              <div className="grid gap-1">
                                {weeks.map((week, wi) => (
                                  <div key={wi} className="grid grid-cols-7 gap-1">
                                    {week.map((day, di) => {
                                      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                                      const count = calMap.get(dateStr) ?? 0;
                                      const isToday = dateStr === todayStr;
                                      const inRange = dateStr >= firstDateStr && dateStr <= todayStr;
                                      const ratio = maxCount > 0 ? count / maxCount : 0;
                                      const dayPubs = pubs.filter(p => p.published_at.startsWith(dateStr));
                                      const isFirstOfMonth = day.getDate() === 1;

                                      return (
                                        <div
                                          key={di}
                                          className={`group relative rounded-lg p-1.5 min-h-[56px] transition-all duration-200 cursor-default ${isToday ? "ring-1 ring-orange-400/60" : ""} ${!inRange ? "opacity-30" : ""}`}
                                          style={{
                                            background: !inRange ? "rgba(255,255,255,0.015)"
                                              : count === 0 ? "rgba(255,255,255,0.03)"
                                              : `rgba(249, 115, 22, ${0.08 + ratio * 0.25})`,
                                            boxShadow: count > 0 && inRange ? `inset 0 0 ${8 + ratio * 12}px rgba(249,115,22,${ratio * 0.15})` : "none",
                                          }}
                                        >
                                          <div className="flex items-center justify-between mb-0.5">
                                            <span className={`text-[11px] font-bold ${isToday ? "text-orange-400" : isFirstOfMonth ? "text-white" : "text-gray-500"}`}>
                                              {isFirstOfMonth ? day.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : day.getDate()}
                                            </span>
                                            {count > 0 && inRange && (
                                              <span className="text-[10px] font-black text-orange-400">{count}</span>
                                            )}
                                          </div>
                                          {/* Publication dots */}
                                          {dayPubs.length > 0 && inRange && (
                                            <div className="flex gap-0.5 flex-wrap">
                                              {dayPubs.slice(0, 3).map((_, j) => (
                                                <div key={j} className="w-1.5 h-1.5 rounded-full bg-orange-400" style={{ opacity: 0.5 + j * 0.2 }} />
                                              ))}
                                              {dayPubs.length > 3 && <span className="text-[8px] text-orange-400/60">+{dayPubs.length - 3}</span>}
                                            </div>
                                          )}
                                          {/* Tooltip */}
                                          {inRange && (
                                            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
                                              <div className="bg-gray-900/95 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-2 shadow-2xl whitespace-nowrap">
                                                <p className="text-white text-xs font-bold">{day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
                                                <p className={`text-[11px] font-semibold mt-0.5 ${count > 0 ? "text-orange-400" : "text-gray-600"}`}>
                                                  {count === 0 ? "Aucune publication" : `${count} article${count > 1 ? "s" : ""}`}
                                                </p>
                                                {dayPubs.length > 0 && (
                                                  <div className="mt-1.5 pt-1.5 border-t border-white/10">
                                                    {dayPubs.slice(0, 3).map((p, j) => (
                                                      <p key={j} className="text-gray-400 text-[10px] truncate max-w-[200px]">{p.title}</p>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                              <div className="w-2 h-2 bg-gray-900/95 border-r border-b border-white/10 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  );
                })()}

                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-5">Prochaines publications planifiées</p>
                  <div className="space-y-3">
                    {(data.plannedItems?.length ?? 0) === 0 ? (
                      <p className="text-gray-600 text-sm py-4 text-center">Aucun mot-clé non couvert — tous les articles sont publiés !</p>
                    ) : (
                      data.plannedItems.slice(0, 7).map((item, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() + i + 1);
                        d.setHours(13, 0, 0, 0);
                        const sourceLabel = item.source === "roadmap" ? "Roadmap SEO" : "Mot-clé configuré";
                        const roleLabel = item.role === "pilier" ? "Page pilier" : item.role === "support" ? "Page support" : item.role === "cluster" ? "Cluster" : null;
                        return (
                          <div key={i} className="flex items-center gap-4 py-3 border-b border-white/[0.04] last:border-0">
                            <div className="w-12 text-center flex-shrink-0">
                              <p className="text-white font-black text-sm">{d.getDate()}</p>
                              <p className="text-gray-600 text-xs">{d.toLocaleDateString("fr-FR", { month: "short" })}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400/60 flex-shrink-0" />
                                <p className="text-white text-sm font-medium truncate">{item.keyword}</p>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/[0.06] text-gray-500">{sourceLabel}</span>
                                {roleLabel && <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400/70">{roleLabel}</span>}
                              </div>
                              {item.reason && <p className="text-gray-600 text-xs mt-1 truncate">{item.reason}</p>}
                              <p className="text-gray-700 text-xs mt-0.5">Publication automatique à 13h00</p>
                            </div>
                            <span className="text-xs text-gray-600 bg-white/[0.04] px-2.5 py-1 rounded-full flex-shrink-0">Prévu</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
