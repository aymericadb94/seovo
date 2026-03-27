"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LanguageSwitcher from "@/components/LanguageSwitcher";
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
  } | null;
  kpis: {
    totalArticles: number;
    articlesThisMonth: number;
    articlesThisWeek: number;
    coveredKeywords: number;
    totalKeywords: number;
    seoScore: number;
    nextPublicationIn: string;
  };
  pubsChart: { date: string; articles: number }[];
  keywordStats: { keyword: string; count: number; lastPublished: string | null }[];
  uncoveredKeywords: string[];
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
  useEffect(() => {
    const t = setTimeout(() => setDash((score / 100) * circ), 300);
    return () => clearTimeout(t);
  }, [score, circ]);
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444";
  const label = score >= 75 ? "Excellent" : score >= 50 ? "En progrès" : "À améliorer";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-24 h-24 flex items-center justify-center flex-shrink-0">
        <svg className="absolute inset-0 rotate-[-90deg]" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - dash}
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
        </svg>
        <div className="text-center z-10">
          <p className="text-2xl font-black text-white leading-none">{score}</p>
          <p className="text-gray-600 text-xs">/100</p>
        </div>
      </div>
      <div>
        <p className="text-white font-bold text-lg">Score SEO</p>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
          {label}
        </span>
        <p className="text-gray-500 text-xs mt-1.5">Basé sur vos publications et mots-clés couverts</p>
      </div>
    </div>
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
  const [activeTab, setActiveTab] = useState<"overview" | "publications" | "keywords">("overview");

  async function loadData() {
    const res = await fetch("/api/dashboard/stats");
    const json = await res.json();
    if (!json.error) setData(json);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
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
      {/* Orbes de fond animées */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="animate-orb absolute top-[-200px] left-[-100px] w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-[120px]" />
        <div className="animate-orb delay-400 absolute bottom-[-200px] right-[-100px] w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[100px]" style={{animationDirection:"reverse"}} />
        <div className="animate-orb delay-200 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-400/3 blur-[80px]" />
      </div>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-md border-b border-white/[0.06] px-6 py-3 animate-fade-in">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xl font-black tracking-tight logo-glow cursor-default">
              SEO<span className="text-shimmer">VO</span>
            </span>
            {data?.site && (
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                {data.site.business_name} · {data.site.cms === "wordpress" ? "WordPress" : "Shopify"}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1">
            {(["overview", "publications", "keywords"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
                  activeTab === tab
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow"
                    : "text-gray-500 hover:text-white"
                }`}
              >
                {tab === "overview" ? "Vue d'ensemble" : tab === "publications" ? "Publications" : "Mots-clés"}
              </button>
            ))}
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
                  Publication en cours...
                </>
              ) : "▶ Lancer la publication"}
            </button>
            <Link href="/generate" className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-4 py-2 rounded-lg text-xs uppercase tracking-wide shadow-lg shadow-orange-500/20">
              + Générer
            </Link>
            <Link href="/settings" className="text-gray-500 hover:text-white text-xs px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
              ⚙ Paramètres
            </Link>
            <Link href="/admin" className="text-gray-600 hover:text-orange-400 text-xs px-2 py-2 transition-colors" title="Admin">◈</Link>
            <LanguageSwitcher />
            <button onClick={handleLogout} className="text-gray-500 hover:text-white text-xs px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
              Déconnexion
            </button>
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
                      <div className="bg-white/[0.03] rounded-xl p-3">
                        <p className="text-gray-500 text-xs mb-1">Ce mois</p>
                        <p className="text-white font-black text-xl">{animMonth}</p>
                        <p className="text-gray-600 text-xs">articles publiés</p>
                      </div>
                      <div className="bg-white/[0.03] rounded-xl p-3">
                        <p className="text-gray-500 text-xs mb-1">Cette semaine</p>
                        <p className="text-white font-black text-xl">{kpis?.articlesThisWeek ?? 0}</p>
                        <p className="text-gray-600 text-xs">articles publiés</p>
                      </div>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="col-span-12 lg:col-span-8 grid grid-cols-2 md:grid-cols-2 gap-4 animate-fade-in-up delay-100">
                    {[
                      {
                        label: "Total articles publiés",
                        value: animTotal,
                        icon: "✍️",
                        sub: `+${kpis?.articlesThisMonth ?? 0} ce mois`,
                        color: "#f97316",
                      },
                      {
                        label: "Mots-clés couverts",
                        value: animKw,
                        icon: "🎯",
                        sub: `sur ${kpis?.totalKeywords ?? 0} configurés`,
                        color: "#ef4444",
                      },
                      {
                        label: "Prochaine publication",
                        value: null,
                        text: kpis?.nextPublicationIn ?? "—",
                        icon: "⏱️",
                        sub: `Fréquence : ${kpis ? (kpis.totalArticles > 0 ? "automatique" : "en attente") : "—"}`,
                        color: "#fb923c",
                      },
                      {
                        label: "Couverture mots-clés",
                        value: kpis && kpis.totalKeywords > 0
                          ? Math.round((kpis.coveredKeywords / kpis.totalKeywords) * 100)
                          : 0,
                        suffix: "%",
                        icon: "📊",
                        sub: `${kpis?.coveredKeywords ?? 0}/${kpis?.totalKeywords ?? 0} mots-clés`,
                        color: "#fca5a5",
                      },
                    ].map((kpi) => (
                      <div key={kpi.label} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 flex flex-col justify-between min-h-[130px] card-hover">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{kpi.label}</p>
                          <span className="text-xl">{kpi.icon}</span>
                        </div>
                        <p className="text-3xl font-black text-white">
                          {kpi.text ?? `${kpi.value?.toLocaleString("fr-FR") ?? 0}${kpi.suffix ?? ""}`}
                        </p>
                        <p className="text-xs mt-2 font-medium" style={{ color: kpi.color }}>{kpi.sub}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Row 2 : Graphique publications ───────────────────── */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up delay-200">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Publications automatisées</p>
                      <p className="text-xl font-black text-white">Historique sur 30 jours</p>
                    </div>
                    <span className="text-xs bg-orange-500/10 text-orange-400 font-bold px-3 py-1.5 rounded-full">
                      {kpis?.totalArticles ?? 0} articles au total
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.pubsChart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: "#4b5563", fontSize: 10 }}
                        axisLine={false} tickLine={false}
                        interval={4}
                      />
                      <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(249,115,22,0.05)" }} />
                      <Bar dataKey="articles" fill="url(#barGrad)" radius={[4, 4, 0, 0]}>
                        <defs>
                          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f97316" />
                            <stop offset="100%" stopColor="#ef4444" />
                          </linearGradient>
                        </defs>
                      </Bar>
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
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-3">Pas encore couverts</p>
                        <div className="flex flex-wrap gap-2">
                          {data.uncoveredKeywords.map(kw => (
                            <span key={kw} className="bg-white/[0.04] border border-white/[0.08] text-gray-400 text-xs px-3 py-1 rounded-full">
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
                    <Link href="/generate" className="text-orange-400 hover:text-orange-300 text-xs font-bold uppercase tracking-wide transition-colors">
                      + Générer un article
                    </Link>
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
                            <th className="px-6 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {data.recentPublications.map((pub, i) => (
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
                              <td className="px-6 py-4 text-right">
                                {pub.url && (
                                  <a href={pub.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors">
                                    Voir →
                                  </a>
                                )}
                              </td>
                            </tr>
                          ))}
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
          </>
        )}
      </div>
    </main>
  );
}
