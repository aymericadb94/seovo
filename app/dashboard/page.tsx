"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import SeoAnalysisModal from "@/components/SeoAnalysisModal";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar,
} from "recharts";

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
  } | null;
  kpis: {
    totalArticles: number;
    articlesThisMonth: number;
    articlesThisWeek: number;
    coveredKeywords: number;
    totalKeywords: number;
    seoScore: number;
    nextPublicationIn: string;
    streak: number;
    bestStreak: number;
  };
  pubsChart: { date: string; articles: number }[];
  keywordStats: { keyword: string; count: number; lastPublished: string | null }[];
  uncoveredKeywords: string[];
  calendarData: { date: string; count: number }[];
  recentPublications: {
    id: string;
    title: string;
    keyword: string;
    url: string;
    published_at: string;
  }[];
};

// ─── Animated counter ─────────────────────────────────────────────────────────

function useCounter(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now();
    const from = value;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + ease * (target - from)));
      if (progress < 1) { rafRef.current = requestAnimationFrame(tick); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);
  return value;
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  const [numVisible, setNumVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setDash((score / 100) * circ); setNumVisible(true); }, 300);
    return () => clearTimeout(t);
  }, [score, circ]);
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444";
  const label = score >= 75 ? "Excellent" : score >= 50 ? "En progrès" : "À améliorer";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0">
        {/* Halo pulsant derrière le ring */}
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle, ${color}18 0%, transparent 68%)`,
            animationDuration: "2.5s",
          }}
        />
        <svg className="absolute inset-0 rotate-[-90deg]" viewBox="0 0 100 100">
          <defs>
            <filter id="scoreGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Piste de fond */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          {/* Arc coloré avec glow */}
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - dash}
            filter="url(#scoreGlow)"
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
        </svg>
        {/* Chiffre central — apparaît après l'arc */}
        <div
          className="text-center z-10"
          style={{ opacity: numVisible ? 1 : 0, transform: numVisible ? "scale(1)" : "scale(0.8)", transition: "opacity 0.5s ease 0.9s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.9s" }}
        >
          <p className="text-2xl font-black text-white leading-none">{score}</p>
          <p className="text-gray-600 text-xs">/100</p>
        </div>
      </div>
      <div>
        <p className="text-white font-bold text-lg">Score SEO</p>
        {/* Badge avec shimmer */}
        <span
          className="relative inline-flex items-center overflow-hidden text-xs font-bold px-2.5 py-1 rounded-full mt-1"
          style={{ background: `${color}20`, color }}
        >
          <span
            className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]"
            style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
          />
          {label}
        </span>
        <p className="text-gray-500 text-xs mt-2">Basé sur vos publications et mots-clés couverts</p>
      </div>
    </div>
  );
}

// ─── Custom bar with glow dot ─────────────────────────────────────────────────

function GlowBar(props: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!value || height <= 0) return null;
  const cx = x + width / 2;
  return (
    <g>
      {/* Barre principale avec filter glow */}
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.7} />
        </linearGradient>
        <filter id="barGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Reflet de fond sous la barre */}
      <rect
        x={x + width * 0.2} y={y + height * 0.6}
        width={width * 0.6} height={height * 0.4}
        rx={3}
        fill="#f97316"
        opacity={0.12}
        filter="url(#barGlow)"
      />
      {/* Barre */}
      <rect
        x={x} y={y}
        width={width} height={height}
        rx={4}
        fill="url(#barGrad)"
        filter="url(#barGlow)"
      />
      {/* Dot lumineux au sommet */}
      <circle cx={cx} cy={y} r={4} fill="#f97316" filter="url(#barGlow)" />
      <circle cx={cx} cy={y} r={2} fill="#fff" opacity={0.9} />
    </g>
  );
}

// ─── Tooltip chart ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-orange-400 font-black text-lg">{payload[0].value}</p>
      <p className="text-gray-500 text-xs">article{payload[0].value > 1 ? "s" : ""} publié{payload[0].value > 1 ? "s" : ""}</p>
    </div>
  );
}

// ─── Keyword badge ────────────────────────────────────────────────────────────

function KeywordBar({ kw, max }: { kw: { keyword: string; count: number; lastPublished: string | null }; max: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(max > 0 ? (kw.count / max) * 100 : 0), 400);
    return () => clearTimeout(t);
  }, [kw.count, max]);
  return (
    <div className="flex items-center gap-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-white font-medium truncate">{kw.keyword}</span>
          <span className="text-xs font-black text-orange-400 ml-2 flex-shrink-0">{kw.count}×</span>
        </div>
        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500"
            style={{ width: `${w}%`, transition: "width 1s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
        </div>
        {kw.lastPublished && (
          <p className="text-gray-600 text-xs mt-0.5">
            Dernier : {new Date(kw.lastPublished).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "publications" | "keywords" | "calendar">("overview");
  const [showSeoModal, setShowSeoModal] = useState<boolean | null>(null); // null = inconnu, attente des données
  const [indexationResults, setIndexationResults] = useState<Record<string, { indexed: boolean | null; verdict: string; coverage: string }>>({});
  const [indexationLoading, setIndexationLoading] = useState(false);

  async function loadData() {
    const res = await fetch("/api/dashboard/stats");
    const json = await res.json();
    if (!json.error) {
      setData(json);
      // Afficher le modal si l'analyse n'a pas encore été faite
      setShowSeoModal(json.site ? !json.site.seo_analysis_done : false);
    } else {
      setShowSeoModal(false);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function checkIndexation() {
    if (!data?.recentPublications.length) return;
    setIndexationLoading(true);
    const urls = data.recentPublications.filter(p => p.url).map(p => p.url);
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

  async function handleManualPublish() {
    setCronRunning(true);
    setCronResult(null);
    try {
      const res = await fetch("/api/cron/trigger", { method: "POST" });
      const json = await res.json();
      const detail = json.results?.map((r: {status: string; title?: string; error?: string}) =>
        r.status === "error" ? `❌ ${r.error}` : `✓ ${r.title}`
      ).join(" | ") ?? "";
      setCronResult((json.message ?? json.error ?? "Terminé") + (detail ? ` — ${detail}` : ""));
      await loadData();
    } catch {
      setCronResult("Erreur lors du déclenchement");
    }
    setCronRunning(false);
  }

  const kpis = data?.kpis;
  const animScore = useCounter(kpis?.seoScore ?? 0);
  const animTotal = useCounter(kpis?.totalArticles ?? 0);
  const animMonth = useCounter(kpis?.articlesThisMonth ?? 0);
  const animKw = useCounter(kpis?.coveredKeywords ?? 0);

  const maxKeywordCount = Math.max(...(data?.keywordStats.map(k => k.count) ?? [1]), 1);

  return (
    <main className="min-h-screen bg-[#080808] text-white overflow-x-hidden">
      {/* SEO Analysis Modal — s'affiche uniquement quand showSeoModal est explicitement true */}
      {showSeoModal === true && (
        <SeoAnalysisModal onComplete={() => { setShowSeoModal(false); loadData(); }} />
      )}

      {/* Orbes de fond animées */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="animate-orb absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-[120px]" />
        <div className="animate-orb delay-400 absolute bottom-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[100px]" style={{animationDirection:"reverse"}} />
        <div className="animate-orb delay-200 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-400/3 blur-[80px]" />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-md border-b border-white/[0.06] animate-fade-in">
        {/* Rangée 1 : logo + actions */}
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
                  {kpis?.totalArticles ?? 0} articles publiés
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualPublish}
              disabled={cronRunning}
              className={`text-xs px-3 py-2 rounded-lg border transition-all font-bold flex items-center gap-2 ${
                cronRunning
                  ? "text-orange-400 border-orange-500/60 bg-orange-500/10 animate-pulse cursor-not-allowed"
                  : "text-orange-400 hover:text-white border-orange-500/30 hover:border-orange-500/60"
              }`}
            >
              {cronRunning ? (
                <>
                  <span className="w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                  En cours...
                </>
              ) : "▶ Publier"}
            </button>
            <Link href="/generate" className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-4 py-2 rounded-lg text-xs uppercase tracking-wide shadow-lg shadow-orange-500/20">
              + Générer
            </Link>
            <Link href="/settings" className="text-gray-500 hover:text-white text-xs px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
              ⚙
            </Link>
            <Link href="/admin" className="text-gray-600 hover:text-orange-400 text-xs px-2 py-2 transition-colors" title="Admin">◈</Link>
            <LanguageSwitcher />
            <button onClick={handleLogout} className="text-gray-500 hover:text-white text-xs px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
              Déconnexion
            </button>
          </div>
        </div>

        {/* Rangée 2 : tabs */}
        <div className="border-t border-white/[0.04]">
          <div className="max-w-screen-xl mx-auto px-6 flex items-center gap-1 py-0">
            {(["overview", "publications", "keywords", "calendar"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                  activeTab === tab
                    ? "border-orange-500 text-white"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {tab === "overview" ? "Vue d'ensemble" : tab === "publications" ? "Publications" : tab === "keywords" ? "Mots-clés" : "Calendrier"}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="max-w-screen-xl mx-auto px-6 py-8">

        {/* ── Notification cron ────────────────────────────────────────── */}
        {cronResult && (
          <div className="mb-6 bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 flex items-center justify-between">
            <p className="text-orange-400 font-bold text-sm">✓ {cronResult}</p>
            <button onClick={() => setCronResult(null)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>
        )}

        {/* ── Bandeau GSC non connecté ─────────────────────────────── */}
        {!loading && data?.site && !data.site.gsc_connected && (
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
            <a
              href="/api/auth/google"
              className="flex-shrink-0 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-xs px-4 py-2.5 rounded-xl uppercase tracking-wide shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 transition-shadow whitespace-nowrap"
            >
              Connecter →
            </a>
          </div>
        )}

        {loading && (
          <div className="text-center text-gray-600 py-24 text-sm">Chargement du dashboard...</div>
        )}

        {!loading && data && (

          <>
            {/* ════════════════════════════════════════════════════════════
                TAB 1 — VUE D'ENSEMBLE
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "overview" && (
              <div className="space-y-5">

                {/* ── Row 1 : Score + 4 KPIs ───────────────────────────── */}
                <div className="grid grid-cols-12 gap-4">

                  {/* Score SEO */}
                  <div className="col-span-12 lg:col-span-4 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up">
                    <ScoreRing score={animScore} />
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="bg-white/[0.03] rounded-xl p-3 animate-fade-in-up" style={{ animationDelay: "400ms" }}>
                        <p className="text-gray-500 text-xs mb-1">Ce mois</p>
                        <p className="text-white font-black text-xl">{animMonth}</p>
                        <p className="text-gray-600 text-xs">articles publiés</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-xl p-3 animate-fade-in-up" style={{ animationDelay: "550ms" }}>
                        <p className="text-gray-500 text-xs mb-1">Cette semaine</p>
                        <p className="text-white font-black text-xl">{kpis?.articlesThisWeek ?? 0}</p>
                        <p className="text-gray-600 text-xs">articles publiés</p>
                      </div>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="col-span-12 lg:col-span-8 grid grid-cols-2 md:grid-cols-2 gap-4">
                    {([
                      {
                        label: "Total articles publiés",
                        value: animTotal,
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                          </svg>
                        ),
                        sub: `+${kpis?.articlesThisMonth ?? 0} ce mois`,
                        color: "#f97316",
                        delay: "100ms",
                      },
                      {
                        label: "Mots-clés couverts",
                        value: animKw,
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                          </svg>
                        ),
                        sub: `sur ${kpis?.totalKeywords ?? 0} configurés`,
                        color: "#ef4444",
                        delay: "200ms",
                      },
                      {
                        label: "Prochaine publication",
                        value: null,
                        text: kpis?.nextPublicationIn ?? "—",
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        ),
                        sub: `Fréquence : ${kpis ? (kpis.totalArticles > 0 ? "automatique" : "en attente") : "—"}`,
                        color: "#fb923c",
                        delay: "300ms",
                      },
                      {
                        label: "Couverture mots-clés",
                        value: kpis && kpis.totalKeywords > 0
                          ? Math.round((kpis.coveredKeywords / kpis.totalKeywords) * 100)
                          : 0,
                        suffix: "%",
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                          </svg>
                        ),
                        sub: `${kpis?.coveredKeywords ?? 0}/${kpis?.totalKeywords ?? 0} mots-clés`,
                        color: "#fca5a5",
                        delay: "400ms",
                      },
                    ] as const).map((kpi) => (
                      <div
                        key={kpi.label}
                        className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 flex flex-col justify-between min-h-[140px] card-hover animate-fade-in-up overflow-hidden group"
                        style={{ animationDelay: kpi.delay }}
                      >
                        {/* Glow de fond au hover */}
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                          style={{ background: `radial-gradient(ellipse at top right, ${kpi.color}10, transparent 60%)` }}
                        />

                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{kpi.label}</p>
                          {/* Icône SVG dans container avec glow */}
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110"
                            style={{ background: `${kpi.color}15`, color: kpi.color, boxShadow: `0 0 0 0 ${kpi.color}30` }}
                          >
                            {kpi.icon}
                          </div>
                        </div>

                        <p className="text-3xl font-black text-white tracking-tight">
                          {"text" in kpi ? kpi.text : `${"value" in kpi ? (kpi.value?.toLocaleString("fr-FR") ?? 0) : 0}${"suffix" in kpi ? kpi.suffix ?? "" : ""}`}
                        </p>

                        {/* Sous-texte avec barre de progression pour couverture */}
                        <div className="mt-3">
                          <p className="text-xs font-medium" style={{ color: kpi.color }}>{kpi.sub}</p>
                          {"suffix" in kpi && kpi.suffix === "%" && (
                            <div className="mt-2 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${"value" in kpi ? kpi.value : 0}%`,
                                  background: `linear-gradient(90deg, ${kpi.color}80, ${kpi.color})`,
                                  transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.5s",
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Streak banner ─────────────────────────────────── */}
                {(kpis?.streak ?? 0) > 0 && (
                  <div className="bg-gradient-to-r from-orange-500/10 to-red-500/5 border border-orange-500/20 rounded-2xl px-6 py-4 flex items-center justify-between animate-fade-in-up delay-150">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">{(kpis?.streak ?? 0) >= 7 ? "🔥" : (kpis?.streak ?? 0) >= 3 ? "⚡" : "✦"}</span>
                      <div>
                        <p className="text-white font-black text-lg">{kpis?.streak} jour{(kpis?.streak ?? 0) > 1 ? "s" : ""} de suite</p>
                        <p className="text-gray-500 text-xs">Streak de publication actuel</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-orange-400 font-black text-2xl">{kpis?.bestStreak}</p>
                      <p className="text-gray-600 text-xs">Meilleur streak</p>
                    </div>
                  </div>
                )}

                {/* ── Row 2 : Graphique publications ───────────────────── */}
                <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up delay-200 overflow-hidden">
                  {/* Halo orange en bas à droite */}
                  <div className="absolute bottom-0 right-0 w-64 h-40 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at bottom right, rgba(249,115,22,0.08) 0%, transparent 70%)" }} />

                  <div className="flex items-center justify-between mb-6 relative">
                    <div>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Publications automatisées</p>
                      <p className="text-xl font-black text-white">Historique sur 30 jours</p>
                    </div>
                    {/* Badge avec sweep shimmer */}
                    <span className="relative overflow-hidden text-xs bg-orange-500/10 text-orange-400 font-bold px-3 py-1.5 rounded-full">
                      <span className="absolute inset-0 animate-[sweep_3s_ease-in-out_infinite]"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.25), transparent)" }} />
                      {kpis?.totalArticles ?? 0} articles au total
                    </span>
                  </div>

                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.pubsChart} margin={{ top: 12, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#4b5563", fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        interval={4}
                      />
                      <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(249,115,22,0.04)" }} />
                      <Bar
                        dataKey="articles"
                        shape={<GlowBar />}
                        isAnimationActive={true}
                        animationDuration={1200}
                        animationEasing="ease-out"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* ── Row 3 : Couverture mots-clés + Infos site ────────── */}
                <div className="grid grid-cols-12 gap-4">

                  {/* Couverture mots-clés */}
                  <div className="col-span-12 lg:col-span-7 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up delay-300">
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Couverture des mots-clés</p>
                      <span className="text-xs text-orange-400 font-bold">{kpis?.coveredKeywords}/{kpis?.totalKeywords} couverts</span>
                    </div>
                    {data.keywordStats.length === 0 ? (
                      <p className="text-gray-600 text-sm">Aucun mot-clé configuré</p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {data.keywordStats.map((kw) => (
                          <KeywordBar key={kw.keyword} kw={kw} max={maxKeywordCount} />
                        ))}
                      </div>
                    )}
                    {data.uncoveredKeywords.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-white/[0.05]">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">À couvrir en priorité</p>
                          <span className="text-xs text-orange-400 font-bold">{data.uncoveredKeywords.length} restant{data.uncoveredKeywords.length > 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {data.uncoveredKeywords.slice(0, 3).map(kw => (
                            <span key={kw} className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs px-3 py-1.5 rounded-full font-medium">
                              <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                              {kw}
                            </span>
                          ))}
                          {data.uncoveredKeywords.slice(3).map(kw => (
                            <span key={kw} className="bg-white/[0.04] border border-white/[0.08] text-gray-500 text-xs px-3 py-1.5 rounded-full">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Infos site */}
                  <div className="col-span-12 lg:col-span-5 space-y-4 animate-fade-in-up delay-400">

                    {/* Statut connexion */}
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 card-hover">
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-4">Statut de la connexion</p>
                      <div className="flex flex-col gap-3">
                        {[
                          { label: "CMS connecté", ok: !!data.site, value: data.site?.cms === "wordpress" ? "WordPress" : "Shopify" },
                          { label: "Site URL", ok: !!data.site?.site_url, value: data.site?.site_url ? "Configuré" : "Non défini" },
                          { label: "Automatisation SEO", ok: true, value: "Active" },
                          { label: "Publication auto", ok: true, value: `${data.site?.frequency ?? 1}×/jour` },
                        ].map(row => (
                          <div key={row.label} className="flex items-center justify-between">
                            <span className="text-gray-400 text-sm">{row.label}</span>
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${row.ok ? "bg-green-400" : "bg-red-400"}`} />
                              <span className="text-white text-sm font-medium">{row.value}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Secteur */}
                    {data.site && (
                      <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3">Profil de l'entreprise</p>
                        <p className="text-white font-black text-lg">{data.site.business_name}</p>
                        <p className="text-gray-400 text-sm mt-1">{data.site.industry}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-3 py-1 rounded-full">
                            {data.site.cms === "wordpress" ? "WordPress" : "Shopify"}
                          </span>
                          <span className="bg-white/[0.05] text-gray-400 text-xs px-3 py-1 rounded-full">
                            {data.site.frequency} article{(data.site.frequency ?? 1) > 1 ? "s" : ""}/jour
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 2 — PUBLICATIONS
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "publications" && (
              <div className="space-y-5">

                {/* Stat rapide */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Total", value: kpis?.totalArticles ?? 0 },
                    { label: "Ce mois", value: kpis?.articlesThisMonth ?? 0 },
                    { label: "Cette semaine", value: kpis?.articlesThisWeek ?? 0 },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 text-center">
                      <p className="text-3xl font-black text-white">{s.value}</p>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Graphique */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-5">Publications par jour — 30 jours</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data.pubsChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                      <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="articles" stroke="#f97316" strokeWidth={2} fill="url(#areaGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Table complète */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Tous les articles publiés</p>
                    <div className="flex items-center gap-3">
                      {data.site?.gsc_connected && data.site?.gsc_site_url && (
                        <button
                          onClick={checkIndexation}
                          disabled={indexationLoading}
                          className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-orange-500/40 text-gray-400 hover:text-orange-400 transition-all disabled:opacity-40"
                        >
                          {indexationLoading ? (
                            <><span className="w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" /> Vérification...</>
                          ) : (
                            <><span>🔍</span> Vérifier l&apos;indexation</>
                          )}
                        </button>
                      )}
                      <Link href="/generate" className="text-orange-400 hover:text-orange-300 text-xs font-bold uppercase tracking-wide transition-colors">
                        + Générer un article
                      </Link>
                    </div>
                  </div>

                  {data.recentPublications.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-white font-bold mb-2">Aucun article pour l'instant</p>
                      <p className="text-gray-500 text-sm mb-5">Lancez la publication ou générez manuellement</p>
                      <button onClick={handleManualPublish} className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-6 py-2.5 rounded-lg text-sm uppercase tracking-wide">
                        Lancer la publication maintenant
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/[0.05]">
                            <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Titre</th>
                            <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Mot-clé</th>
                            <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Date</th>
                            <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Statut</th>
                            <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Indexation</th>
                            <th className="px-6 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentPublications.map((pub, i) => {
                            const idx = pub.url ? indexationResults[pub.url] : null;
                            return (
                            <tr key={pub.id} className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-all animate-fade-in-up ${i === data.recentPublications.length - 1 ? "border-b-0" : ""}`} style={{animationDelay: `${i * 60}ms`}}>
                              <td className="px-6 py-4 text-white font-medium max-w-xs truncate text-sm">{pub.title}</td>
                              <td className="px-6 py-4">
                                <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-2.5 py-1 rounded-full">
                                  {pub.keyword}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-gray-500 text-sm whitespace-nowrap">
                                {new Date(pub.published_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                              </td>
                              <td className="px-6 py-4">
                                <span className="flex items-center gap-1.5 text-xs font-bold text-green-400">
                                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                                  Publié
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                {!idx ? (
                                  <span className="text-gray-700 text-xs">—</span>
                                ) : idx.indexed === true ? (
                                  <span className="flex items-center gap-1.5 text-xs font-bold text-green-400">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Indexé
                                  </span>
                                ) : idx.indexed === false ? (
                                  <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                                    <span className="w-1.5 h-1.5 bg-red-400 rounded-full" /> Non indexé
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">Inconnu</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {pub.url && (
                                  <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors">
                                    Voir →
                                  </a>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 3 — MOTS-CLÉS
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "keywords" && (
              <div className="space-y-5">

                {/* Résumé */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Mots-clés configurés", value: kpis?.totalKeywords ?? 0 },
                    { label: "Couverts au moins 1×", value: kpis?.coveredKeywords ?? 0 },
                    { label: "Non encore couverts", value: (kpis?.totalKeywords ?? 0) - (kpis?.coveredKeywords ?? 0) },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 text-center">
                      <p className="text-3xl font-black text-white">{s.value}</p>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Détail par mot-clé */}
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
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                              style={{ width: `${maxKeywordCount > 0 ? (kw.count / maxKeywordCount) * 100 : 0}%`, transition: "width 1s ease" }}
                            />
                          </div>
                          {kw.lastPublished ? (
                            <p className="text-gray-600 text-xs">
                              Dernier article : {new Date(kw.lastPublished).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                            </p>
                          ) : (
                            <p className="text-gray-600 text-xs">Pas encore publié — sera priorisé prochainement</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Link href="/settings" className="flex-1 bg-white/[0.03] border border-white/[0.07] hover:border-orange-500/30 rounded-xl p-4 text-center transition-colors group">
                    <p className="text-white font-bold group-hover:text-orange-400 transition-colors">⚙ Modifier les mots-clés</p>
                    <p className="text-gray-600 text-xs mt-1">Ajouter ou supprimer des mots-clés cibles</p>
                  </Link>
                  <button
                    onClick={handleManualPublish}
                    disabled={cronRunning}
                    className="flex-1 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 hover:border-orange-500/40 rounded-xl p-4 text-center transition-colors disabled:opacity-40"
                  >
                    <p className="text-orange-400 font-bold">{cronRunning ? "⏳ En cours..." : "▶ Générer un article maintenant"}</p>
                    <p className="text-gray-600 text-xs mt-1">Couvre le prochain mot-clé non traité</p>
                  </button>
                </div>
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                TAB 4 — CALENDRIER
            ════════════════════════════════════════════════════════════ */}
            {activeTab === "calendar" && (
              <div className="space-y-5">

                {/* Streak summary */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Streak actuel", value: kpis?.streak ?? 0, icon: (kpis?.streak ?? 0) >= 7 ? "🔥" : (kpis?.streak ?? 0) >= 3 ? "⚡" : "✦", suffix: "j" },
                    { label: "Meilleure streak", value: kpis?.bestStreak ?? 0, icon: "🏆", suffix: "j" },
                    { label: "Jours publiés / 90j", value: data.calendarData.filter(d => d.count > 0).length, icon: "📅", suffix: "" },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 text-center card-hover">
                      <p className="text-2xl mb-1">{s.icon}</p>
                      <p className="text-3xl font-black text-white">{s.value}{s.suffix}</p>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mt-1">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Heatmap 90 jours */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Activité éditoriale</p>
                      <p className="text-xl font-black text-white">90 derniers jours</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span>Moins</span>
                      {["bg-white/[0.05]", "bg-orange-900/60", "bg-orange-600/60", "bg-orange-500", "bg-orange-400"].map((c, i) => (
                        <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                      ))}
                      <span>Plus</span>
                    </div>
                  </div>
                  <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}>
                    {Array.from({ length: 13 }).map((_, weekIdx) => (
                      <div key={weekIdx} className="flex flex-col gap-1">
                        {Array.from({ length: 7 }).map((_, dayIdx) => {
                          const cellIdx = weekIdx * 7 + dayIdx;
                          const entry = data.calendarData[cellIdx];
                          if (!entry) return <div key={dayIdx} className="w-full aspect-square" />;
                          const intensity = entry.count === 0 ? 0 : entry.count === 1 ? 1 : entry.count === 2 ? 2 : entry.count >= 3 ? 3 : 3;
                          const colors = ["bg-white/[0.05]", "bg-orange-800/70", "bg-orange-600/80", "bg-orange-500"];
                          const isToday = entry.date === new Date().toISOString().split("T")[0];
                          return (
                            <div
                              key={dayIdx}
                              title={`${entry.date} — ${entry.count} article${entry.count !== 1 ? "s" : ""}`}
                              className={`w-full aspect-square rounded-sm ${colors[intensity]} ${isToday ? "ring-1 ring-orange-400" : ""} transition-all hover:scale-125 cursor-default`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-3 text-xs text-gray-700">
                    {(() => {
                      const labels: string[] = [];
                      const today = new Date();
                      for (let w = 12; w >= 0; w -= 4) {
                        const d = new Date(today);
                        d.setDate(d.getDate() - w * 7);
                        labels.push(d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }));
                      }
                      return labels.map((l, i) => <span key={i}>{l}</span>);
                    })()}
                  </div>
                </div>

                {/* Prochaines publications planifiées */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-5">Prochaines publications planifiées</p>
                  <div className="space-y-3">
                    {Array.from({ length: 7 }).map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() + i + 1);
                      d.setHours(8, 0, 0, 0);
                      const kwIndex = (data.keywordStats.length > 0)
                        ? i % data.uncoveredKeywords.length
                        : -1;
                      const kw = data.uncoveredKeywords[kwIndex] ?? data.keywordStats[i % Math.max(data.keywordStats.length, 1)]?.keyword ?? "—";
                      return (
                        <div key={i} className="flex items-center gap-4 py-2.5 border-b border-white/[0.04] last:border-0">
                          <div className="w-12 text-center flex-shrink-0">
                            <p className="text-white font-black text-sm">{d.getDate()}</p>
                            <p className="text-gray-600 text-xs">{d.toLocaleDateString("fr-FR", { month: "short" })}</p>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-400/60" />
                              <p className="text-gray-400 text-sm">{kw}</p>
                            </div>
                            <p className="text-gray-700 text-xs mt-0.5">Publication automatique à 8h00</p>
                          </div>
                          <span className="text-xs text-gray-600 bg-white/[0.04] px-2.5 py-1 rounded-full">Planifié</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
