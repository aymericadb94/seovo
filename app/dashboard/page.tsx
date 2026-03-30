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

function CountdownTimer({ targetIso }: { targetIso: string | null }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [time, setTime] = useState({ h: 0, m: 0, s: 0, ms: 0 });
  const [glow, setGlow] = useState(false);
  const prevSec = useRef(-1);

  useEffect(() => {
    function calc() {
      if (!targetIso) { setTime({ h: 0, m: 0, s: 0, ms: 0 }); return; }
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setTime({ h: 0, m: 0, s: 0, ms: 0 }); return; }
      const s = Math.floor((diff % 60000) / 1000);
      if (s !== prevSec.current) {
        prevSec.current = s;
        setGlow(true);
        setTimeout(() => setGlow(false), 180);
      }
      setTime({ h: Math.floor(diff / 3600000), m: Math.floor((diff % 3600000) / 60000), s, ms: diff });
    }
    calc();
    const id = setInterval(calc, 250);
    return () => clearInterval(id);
  }, [targetIso]);

  const hasTime = time.ms > 0 && targetIso;
  const progress = targetIso ? Math.max(0, Math.min(100, 100 - (time.ms / 86400000) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4 w-full">
      {hasTime ? (
        <div className="flex items-start">
          {([
            { val: pad(time.h), label: "heure" },
            { val: pad(time.m), label: "min" },
            { val: pad(time.s), label: "sec" },
          ] as const).map(({ val, label }, i) => (
            <div key={label} className="flex items-start">
              {i > 0 && (
                <span
                  className="font-black select-none"
                  style={{
                    fontSize: "2.4rem",
                    lineHeight: 1,
                    margin: "0 3px",
                    color: "rgba(249,115,22,0.3)",
                    animation: "colonPulse 1s ease-in-out infinite",
                  }}
                >:</span>
              )}
              <div className="flex flex-col items-center" style={{ minWidth: 50 }}>
                <span
                  className="font-black tabular-nums leading-none"
                  style={{
                    fontSize: "2.6rem",
                    color: "white",
                    textShadow: label === "sec" && glow
                      ? "0 0 24px rgba(249,115,22,0.9), 0 0 8px rgba(249,115,22,0.6)"
                      : "0 0 12px rgba(255,255,255,0.06)",
                    transition: "text-shadow 0.18s ease",
                  }}
                >
                  {val}
                </span>
                <span
                  className="uppercase tracking-widest font-bold"
                  style={{ fontSize: "0.6rem", color: "rgba(249,115,22,0.45)", marginTop: 5 }}
                >
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-2xl font-black text-white">Très prochainement</p>
      )}

      {/* Progress bar with glowing orb */}
      <div className="relative" style={{ height: 6 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, rgba(249,115,22,0.25) 0%, #f97316 100%)",
            transition: "width 1s linear",
          }}
        />
        {/* Glowing orb */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: `clamp(3px, calc(${progress}% - 3px), calc(100% - 3px))`,
            width: 12, height: 12,
            borderRadius: "50%",
            background: "radial-gradient(circle, #fff 10%, #f97316 70%)",
            boxShadow: "0 0 12px 4px rgba(249,115,22,0.65), 0 0 4px 1px rgba(255,200,100,0.4)",
            transition: "left 1s linear",
          }}
        />
      </div>

      <style>{`
        @keyframes colonPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.15; }
        }
      `}</style>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);
  const [showDailyLimitModal, setShowDailyLimitModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "publications" | "keywords" | "calendar">("overview");
  const [showSeoModal, setShowSeoModal] = useState<boolean | null>(null);
  const [indexationResults, setIndexationResults] = useState<Record<string, { indexed: boolean | null; verdict: string; coverage: string }>>({});
  const [indexationLoading, setIndexationLoading] = useState(false);

  // Audit
  type AuditRecord = { id: string; month: string; created_at: string; data: AuditData };
  const [latestAudit, setLatestAudit] = useState<AuditRecord | null>(null);
  const [auditAvailable, setAuditAvailable] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
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

  // Roadmap SEO
  type RoadmapRecord = { id: string; created_at: string; data: RoadmapData };
  const [roadmapRecord, setRoadmapRecord] = useState<RoadmapRecord | null>(null);
  const [showRoadmapModal, setShowRoadmapModal] = useState(false);

  async function loadRoadmap() {
    try {
      const res = await fetch("/api/roadmap");
      const json = await res.json();
      if (!json.error) setRoadmapRecord(json.roadmap);
    } catch { /* ignore */ }
  }

  async function generateRoadmap() {
    const res = await fetch("/api/roadmap", { method: "POST" });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setRoadmapRecord(json.roadmap);
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
    window.addEventListener("focus", loadData);
    return () => window.removeEventListener("focus", loadData);
  }, []);

  // Popup audit : uniquement à partir de la 2ème connexion
  useEffect(() => {
    if (!auditAvailable) return;
    const hasVisited = localStorage.getItem("rankpill_has_visited");
    if (!hasVisited) {
      localStorage.setItem("rankpill_has_visited", "1");
      return; // 1ère connexion → pas de popup
    }
    setShowAuditModal(true);
  }, [auditAvailable]);

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

  async function handleManualPublish(force = false) {
    const pubsToday = data?.kpis.pubsToday ?? 0;
    if (pubsToday >= 3 && !force) {
      setShowDailyLimitModal(true);
      return;
    }
    setShowDailyLimitModal(false);
    setCronRunning(true);
    setCronResult(null);
    try {
      const res = await fetch("/api/cron/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
      });
      const text = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        setCronResult(`Erreur serveur (${res.status}): ${text.slice(0, 150)}`);
        setCronRunning(false);
        return;
      }
      const detail = (json.results as {status: string; title?: string; error?: string}[] | undefined)
        ?.map((r) => r.status === "error" ? `❌ ${r.error}` : `✓ ${r.title}`)
        .join(" | ") ?? "";
      setCronResult(((json.message ?? json.error ?? "Terminé") as string) + (detail ? ` — ${detail}` : ""));
      await loadData();
    } catch (err) {
      setCronResult("Erreur réseau : " + (err instanceof Error ? err.message : String(err)));
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

      {/* Audit mensuel */}
      {showAuditReport && (
        <AuditModal
          auditRecord={latestAudit}
          isAvailable={auditAvailable}
          onClose={() => setShowAuditReport(false)}
          onGenerate={async () => { await generateAudit(); }}
        />
      )}

      {/* Roadmap SEO 40 articles */}
      {showRoadmapModal && (
        <RoadmapModal
          roadmapRecord={roadmapRecord}
          onClose={() => setShowRoadmapModal(false)}
          onGenerate={generateRoadmap}
        />
      )}

      {/* Modale limite journalière */}
      {showDailyLimitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in-up" style={{ animationDuration: "200ms" }}>
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ animation: "modalPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            {/* Gradient de fond */}
            <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, #1a0e00 0%, #120800 40%, #0e0e0e 100%)" }} />
            {/* Bordure gradient animée */}
            <div className="absolute inset-0 rounded-2xl p-px" style={{ background: "linear-gradient(135deg, rgba(251,146,60,0.5), rgba(239,68,68,0.3), rgba(251,146,60,0.1))" }}>
              <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(135deg, #1a0e00 0%, #120800 40%, #0e0e0e 100%)" }} />
            </div>
            {/* Halo orange radial */}
            <div className="absolute top-0 left-0 w-64 h-64 pointer-events-none" style={{ background: "radial-gradient(ellipse at top left, rgba(251,146,60,0.15) 0%, transparent 65%)" }} />
            <div className="absolute bottom-0 right-0 w-48 h-48 pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom right, rgba(239,68,68,0.08) 0%, transparent 65%)" }} />

            <div className="relative p-7">
              {/* Badge + icône */}
              <div className="flex items-start gap-4 mb-5">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(251,146,60,0.2), rgba(239,68,68,0.15))", border: "1px solid rgba(251,146,60,0.3)" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-orange-400">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  </div>
                  {/* Pulse ring */}
                  <div className="absolute inset-0 rounded-2xl animate-ping opacity-20" style={{ background: "rgba(251,146,60,0.4)", animationDuration: "2s" }} />
                </div>
                <div>
                  <h3 className="text-white font-black text-lg leading-tight">Limite journalière<br/>atteinte</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-5 h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, #fb923c, #ef4444)" }} />
                    ))}
                    <span className="text-orange-400 text-xs font-bold ml-1">3/3</span>
                  </div>
                </div>
              </div>

              <p className="text-white/70 text-sm leading-relaxed mb-2">
                Vous avez atteint la limite recommandée de <span className="font-bold" style={{ background: "linear-gradient(90deg, #fb923c, #f97316)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>3 publications par jour</span>. Publier davantage peut nuire à votre référencement.
              </p>
              <p className="text-white/35 text-xs leading-relaxed mb-7">
                Google peut interpréter un volume excessif comme du spam. Attendez demain pour maintenir une croissance organique optimale.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDailyLimitModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl text-white/50 hover:text-white/80 transition-all text-sm font-medium"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleManualPublish(true)}
                  className="flex-1 px-4 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-95 relative overflow-hidden"
                  style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 4px 24px rgba(249,115,22,0.35)" }}
                >
                  <span className="relative z-10">Générer quand même</span>
                  <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(135deg, #fb923c, #f87171)" }} />
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

          <div className="flex items-center gap-2.5">
            {/* Bouton Auto-publier */}
            {(() => {
              const pubsToday = data?.kpis.pubsToday ?? 0;
              const dailyMax = 3;
              const limitReached = pubsToday >= dailyMax;
              return (
            <button
              onClick={() => handleManualPublish()}
              disabled={cronRunning}
              className="group relative flex items-center gap-2 px-4 py-2 rounded-xl border border-orange-500/25 bg-orange-500/[0.06] hover:bg-orange-500/[0.12] hover:border-orange-500/50 transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cronRunning && (
                <span className="absolute inset-0 rounded-xl border border-orange-500/40 animate-ping" />
              )}
              {cronRunning ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-orange-400 border-t-transparent animate-spin flex-shrink-0" />
                  <span className="text-xs font-bold text-orange-400">Publication...</span>
                </>
              ) : (
                <>
                  {/* Icône éclair */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-300 transition-colors flex-shrink-0">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none"/>
                  </svg>
                  <span className="text-xs font-bold text-orange-400 group-hover:text-orange-300 transition-colors">
                    {limitReached ? "3/3" : `${pubsToday + 1}/3`}
                  </span>
                  <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1a1a1a] border border-white/10 text-gray-400 text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                    {limitReached ? "Limite journalière atteinte (3/3)" : "Publie automatiquement le prochain mot-clé"}
                  </span>
                </>
              )}
            </button>
            );
            })()}

            {/* Bouton Créer un article */}
            <Link
              href="/generate"
              className="group relative overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-xs shadow-lg shadow-orange-500/25 hover:shadow-orange-500/45 transition-all duration-300 hover:scale-[1.03]"
            >
              {/* Shimmer sweep */}
              <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
              {/* Icône crayon */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                className="w-3.5 h-3.5 flex-shrink-0 relative">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              <span className="relative">Créer</span>
              {/* Tooltip au hover */}
              <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#1a1a1a] border border-white/10 text-gray-400 text-xs px-2.5 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50 font-normal">
                Choisir le mot-clé et prévisualiser avant publication
              </span>
            </Link>
            <Link href="/settings" className="group w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 hover:border-orange-500/40 bg-white/[0.03] hover:bg-orange-500/10 transition-all duration-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                className="w-4 h-4 text-gray-500 group-hover:text-orange-400 transition-colors duration-300 group-hover:rotate-90 transition-transform duration-500">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
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

                    {/* Carte Roadmap — prochains articles */}
                    {(() => {
                      const publishedKeywords = new Set((data?.recentPublications ?? []).map(p => p.keyword?.toLowerCase()));
                      const nextArticles = (roadmapRecord?.data?.articles ?? [])
                        .filter(a => !publishedKeywords.has(a.keyword?.toLowerCase()))
                        .sort((a, b) => a.priority - b.priority)
                        .slice(0, 3);
                      const total = roadmapRecord?.data?.articles?.length ?? 0;
                      const done = (data?.kpis.totalArticles ?? 0);
                      const pct = Math.round((done / Math.max(total, 1)) * 100);
                      return (
                        <button
                          onClick={() => setShowRoadmapModal(true)}
                          className="relative rounded-2xl p-5 flex flex-col justify-between min-h-[140px] overflow-hidden group text-left animate-fade-in-up"
                          style={{
                            animationDelay: "100ms",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                          }}
                        >
                          {/* Halos de fond */}
                          <div className="absolute top-0 left-0 w-40 h-40 pointer-events-none"
                            style={{ background: "radial-gradient(ellipse at top left, rgba(167,139,250,0.13) 0%, transparent 70%)" }} />
                          <div className="absolute bottom-0 right-0 w-32 h-32 pointer-events-none"
                            style={{ background: "radial-gradient(ellipse at bottom right, rgba(96,165,250,0.07) 0%, transparent 70%)" }} />
                          {/* Hover glow */}
                          <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(167,139,250,0.1), transparent 60%)", border: "1px solid rgba(167,139,250,0.3)" }} />

                          {/* Header */}
                          <div className="flex items-center justify-between mb-3 relative">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-[0.15em]"
                                style={{ background: "linear-gradient(90deg, #a78bfa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                Roadmap SEO
                              </p>
                              {total > 0 && (
                                <p className="text-white/25 text-[10px] mt-0.5">{total} articles planifiés</p>
                              )}
                            </div>
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6"
                              style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.2), rgba(96,165,250,0.12))", border: "1px solid rgba(167,139,250,0.2)", color: "#c4b5fd" }}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                              </svg>
                            </div>
                          </div>

                          {total > 0 ? (
                            <>
                              <div className="relative flex-1 space-y-1">
                                {nextArticles.length > 0 ? nextArticles.map((a, i) => (
                                  <div key={a.id}
                                    className="relative rounded-lg px-2.5 py-1.5 overflow-hidden"
                                    style={{
                                      opacity: 1 - i * 0.3,
                                      transition: `all 0.4s ease ${i * 70}ms`,
                                      background: i === 0 ? "linear-gradient(90deg, rgba(167,139,250,0.12), rgba(96,165,250,0.06) 70%, transparent)" : "transparent",
                                      borderLeft: i === 0 ? "2px solid rgba(167,139,250,0.6)" : "2px solid rgba(167,139,250,0.12)",
                                    }}>
                                    {i === 0 && (
                                      <div className="absolute inset-0 pointer-events-none animate-[sweep_3s_ease-in-out_infinite]"
                                        style={{ background: "linear-gradient(90deg, transparent, rgba(167,139,250,0.08), transparent)" }} />
                                    )}
                                    <span className="relative text-xs truncate block"
                                      style={{ color: i === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)", fontWeight: i === 0 ? 600 : 400, letterSpacing: i === 0 ? "-0.01em" : "normal" }}>
                                      {a.title}
                                    </span>
                                  </div>
                                )) : (
                                  <p className="text-white/40 text-xs">Tous les articles publiés !</p>
                                )}
                              </div>
                              <div className="mt-3 relative">
                                <div className="flex justify-between items-baseline mb-1.5">
                                  <span className="text-xs font-bold" style={{ background: "linear-gradient(90deg, #a78bfa, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                    {done}/{total} publiés
                                  </span>
                                  <span className="text-[10px] font-bold text-white/25">{pct}%</span>
                                </div>
                                <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(167,139,250,0.08)" }}>
                                  <div className="h-full rounded-full transition-all duration-1000 relative overflow-hidden"
                                    style={{ width: `${pct}%`, background: "linear-gradient(90deg, #7c3aed, #a78bfa, #60a5fa)" }}>
                                    <div className="absolute inset-0 animate-[sweep_2s_ease-in-out_infinite]"
                                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }} />
                                  </div>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="flex-1 flex flex-col justify-center gap-2">
                              <p className="text-white/40 text-xs leading-relaxed">Générez votre roadmap pour voir les prochains articles à publier</p>
                              <span className="text-[10px] font-bold" style={{ background: "linear-gradient(90deg, #a78bfa, #60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                                Générer →
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })()}

                    {([{
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
                          {"text" in kpi ? String(kpi.text) : `${"value" in kpi ? (kpi.value?.toLocaleString("fr-FR") ?? 0) : 0}${"suffix" in kpi ? kpi.suffix ?? "" : ""}`}
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

                    {/* Countdown card */}
                    <div
                      className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 flex flex-col justify-between min-h-[140px] card-hover animate-fade-in-up overflow-hidden group"
                      style={{ animationDelay: "300ms" }}
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                        style={{ background: "radial-gradient(ellipse at top right, rgba(249,115,22,0.08), transparent 60%)" }} />
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Prochaine publication</p>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110"
                          style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c" }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                          </svg>
                        </div>
                      </div>
                      <CountdownTimer targetIso={kpis?.nextPublicationAt ?? null} />
                      <p className="text-xs font-medium mt-2" style={{ color: "#fb923c" }}>
                        {kpis ? (kpis.totalArticles > 0 ? "Publication automatique" : "En attente du 1er article") : "—"}
                      </p>
                    </div>
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

                {/* ── Outils SEO ───────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up delay-150">

                  {/* Audit mensuel */}
                  <button
                    onClick={() => setShowAuditReport(true)}
                    className="relative group bg-white/[0.03] border border-white/[0.07] hover:border-orange-500/30 rounded-2xl p-5 text-left transition-all duration-300 overflow-hidden"
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: "radial-gradient(ellipse at top left, rgba(249,115,22,0.06), transparent 60%)" }} />
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(249,115,22,0.12)", color: "#fb923c" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                        </svg>
                      </div>
                      {auditAvailable && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25">Nouveau</span>
                      )}
                    </div>
                    <p className="text-white font-bold text-sm mb-1">Audit SEO mensuel</p>
                    <p className="text-white/40 text-xs leading-relaxed">
                      {latestAudit
                        ? `Dernier audit : ${latestAudit.data.month_label} — Score ${latestAudit.data.overall_score}/100`
                        : "Générez votre premier audit SEO mensuel"}
                    </p>
                  </button>

                  {/* Roadmap 40 articles */}
                  <button
                    onClick={() => setShowRoadmapModal(true)}
                    className="relative group bg-white/[0.03] border border-white/[0.07] hover:border-violet-500/30 rounded-2xl p-5 text-left transition-all duration-300 overflow-hidden"
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: "radial-gradient(ellipse at top left, rgba(167,139,250,0.06), transparent 60%)" }} />
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                        </svg>
                      </div>
                      {!roadmapRecord && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25">À générer</span>
                      )}
                    </div>
                    <p className="text-white font-bold text-sm mb-1">Roadmap SEO — 40 articles</p>
                    <p className="text-white/40 text-xs leading-relaxed">
                      {roadmapRecord
                        ? `Générée le ${new Date(roadmapRecord.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} — ${roadmapRecord.data.articles?.length ?? 0} articles planifiés`
                        : "Plan éditorial stratégique personnalisé pour dominer Google"}
                    </p>
                  </button>
                </div>

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
                            <span key={kw.keyword} className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs px-3 py-1.5 rounded-full font-medium">
                              <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse flex-shrink-0" />
                              {kw.keyword}
                              {kw.impressions !== null && (
                                <span className="text-orange-500/70 font-normal">{kw.impressions.toLocaleString("fr-FR")} imp.</span>
                              )}
                            </span>
                          ))}
                          {data.uncoveredKeywords.slice(3).map(kw => (
                            <span key={kw.keyword} className="bg-white/[0.04] border border-white/[0.08] text-gray-500 text-xs px-3 py-1.5 rounded-full">
                              {kw.keyword}
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
                    { label: "Total", value: kpis?.totalArticles ?? 0, icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>), color: "#f97316", delay: "0ms" },
                    { label: "Ce mois", value: kpis?.articlesThisMonth ?? 0, icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>), color: "#fb923c", delay: "100ms" },
                    { label: "Cette semaine", value: kpis?.articlesThisWeek ?? 0, icon: (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>), color: "#ef4444", delay: "200ms" },
                  ].map(s => (
                    <div key={s.label}
                      className="relative group bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden"
                      style={{ animationDelay: s.delay }}
                    >
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                        style={{ background: `radial-gradient(ellipse at top right, ${s.color}12, transparent 60%)` }} />
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{s.label}</p>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                          style={{ background: `${s.color}15`, color: s.color }}>
                          {s.icon}
                        </div>
                      </div>
                      <p className="text-4xl font-black text-white tracking-tight">{s.value}</p>
                      <div className="mt-3 h-0.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full rounded-full animate-[sweep_3s_ease-in-out_infinite]"
                          style={{ background: `linear-gradient(90deg, transparent, ${s.color}60, transparent)` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Graphique area */}
                <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 overflow-hidden animate-fade-in-up delay-200">
                  <div className="absolute bottom-0 left-0 w-72 h-48 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at bottom left, rgba(249,115,22,0.07) 0%, transparent 70%)" }} />
                  <div className="flex items-center justify-between mb-5 relative">
                    <div>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">Publications par jour</p>
                      <p className="text-xl font-black text-white">30 derniers jours</p>
                    </div>
                    <span className="relative overflow-hidden text-xs bg-orange-500/10 text-orange-400 font-bold px-3 py-1.5 rounded-full">
                      <span className="absolute inset-0 animate-[sweep_3s_ease-in-out_infinite]"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.25), transparent)" }} />
                      {kpis?.totalArticles ?? 0} au total
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data.pubsChart} margin={{ top: 10, right: 5, left: -20, bottom: 0 }}>
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
                      <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(249,115,22,0.2)", strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="articles"
                        stroke="#f97316" strokeWidth={2.5} fill="url(#areaGrad2)"
                        filter="url(#areaGlow)"
                        isAnimationActive={true} animationDuration={1400} animationEasing="ease-out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Table complète */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden animate-fade-in-up delay-300">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
                    <div>
                      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-0.5">Tous les articles publiés</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {data.site?.gsc_connected && data.site?.gsc_site_url && (
                        <button
                          onClick={checkIndexation}
                          disabled={indexationLoading}
                          className="group flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border border-white/10 hover:border-orange-500/40 text-gray-400 hover:text-orange-400 transition-all disabled:opacity-40"
                        >
                          {indexationLoading ? (
                            <><span className="w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" /> Vérification...</>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                              </svg>
                              Vérifier l&apos;indexation
                            </>
                          )}
                        </button>
                      )}
                      <Link href="/generate"
                        className="group relative overflow-hidden flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/50 text-orange-400 hover:text-orange-300 transition-all">
                        <span className="absolute inset-0 animate-[sweep_3s_ease-in-out_infinite]"
                          style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.15), transparent)" }} />
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 relative">
                          <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                        <span className="relative">+ Créer un article</span>
                      </Link>
                    </div>
                  </div>

                  {data.recentPublications.length === 0 ? (
                    <div className="text-center py-16">
                      <p className="text-white font-bold mb-2">Aucun article pour l'instant</p>
                      <p className="text-gray-500 text-sm mb-5">Lancez la publication ou générez manuellement</p>
                      <button onClick={() => handleManualPublish()} className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-6 py-2.5 rounded-lg text-sm uppercase tracking-wide">
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
                    onClick={() => handleManualPublish()}
                    disabled={cronRunning}
                    className="flex-1 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 hover:border-orange-500/40 rounded-xl p-4 text-center transition-colors disabled:opacity-40"
                  >
                    <p className="text-orange-400 font-bold">
                      {cronRunning ? "⏳ En cours..." : "▶ Générer un article maintenant"}
                    </p>
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
                  {/* Streak actuel */}
                  {(() => {
                    const streak = kpis?.streak ?? 0;
                    const color = streak >= 7 ? "#f97316" : streak >= 3 ? "#fb923c" : "#6b7280";
                    return (
                      <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden group" style={{ animationDelay: "0ms" }}>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                          style={{ background: `radial-gradient(ellipse at top right, ${color}12, transparent 60%)` }} />
                        {streak > 0 && (
                          <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
                            style={{ background: `radial-gradient(ellipse at top right, ${color}10, transparent 65%)` }} />
                        )}
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Streak actuel</p>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                            style={{ background: `${color}18`, color }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                            </svg>
                          </div>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tight">{streak}<span className="text-xl text-gray-500 font-bold ml-1">j</span></p>
                        <p className="text-xs mt-2 font-medium" style={{ color }}>
                          {streak >= 7 ? "En feu 🔥 continue !" : streak >= 3 ? "Bonne dynamique" : streak > 0 ? "Lancé !" : "Publie aujourd'hui"}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Meilleure streak */}
                  {(() => {
                    const best = kpis?.bestStreak ?? 0;
                    return (
                      <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden group" style={{ animationDelay: "120ms" }}>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                          style={{ background: "radial-gradient(ellipse at top right, rgba(251,191,36,0.08), transparent 60%)" }} />
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Meilleure streak</p>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                            style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          </div>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tight">{best}<span className="text-xl text-gray-500 font-bold ml-1">j</span></p>
                        <p className="text-xs mt-2 font-medium text-yellow-500/70">Record personnel</p>
                      </div>
                    );
                  })()}

                  {/* Jours publiés */}
                  {(() => {
                    const days = data.calendarData.filter(d => d.count > 0).length;
                    const pct = Math.round((days / 90) * 100);
                    return (
                      <div className="relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 card-hover animate-fade-in-up overflow-hidden group" style={{ animationDelay: "240ms" }}>
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                          style={{ background: "radial-gradient(ellipse at top right, rgba(34,197,94,0.07), transparent 60%)" }} />
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Jours publiés / 90j</p>
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                            style={{ background: "rgba(34,197,94,0.10)", color: "#22c55e" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
                            </svg>
                          </div>
                        </div>
                        <p className="text-4xl font-black text-white tracking-tight">{days}</p>
                        <div className="mt-2">
                          <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-green-600 to-green-400"
                              style={{ width: `${pct}%`, transition: "width 1.2s cubic-bezier(0.34,1.56,0.64,1) 0.3s" }} />
                          </div>
                          <p className="text-xs mt-1.5 font-medium text-green-500/70">{pct}% de régularité</p>
                        </div>
                      </div>
                    );
                  })()}
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
                      const kwIndex = (data.uncoveredKeywords.length > 0)
                        ? i % data.uncoveredKeywords.length
                        : -1;
                      const kw = data.uncoveredKeywords[kwIndex]?.keyword ?? data.keywordStats[i % Math.max(data.keywordStats.length, 1)]?.keyword ?? "—";
                      return (
                        <div key={i} className="flex items-center gap-4 py-2.5 border-b border-white/[0.04] last:border-0">
                          <div className="w-12 text-center flex-shrink-0">
                            <p className="text-white font-black text-sm">{d.getDate()}</p>
                            <p className="text-gray-600 text-xs">{d.toLocaleDateString("fr-FR", { month: "short" })}</p>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-400/60" />
                              <p className="text-gray-400 text-sm">{typeof kw === "string" ? kw : kw}</p>
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
      <Footer />
    </main>
  );
}
