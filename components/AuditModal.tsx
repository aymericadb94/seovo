"use client";

import { useState, useEffect } from "react";

type AuditKpis = {
  articles_this_month: number;
  articles_last_month: number;
  keywords_covered: number;
  total_keywords: number;
  total_articles: number;
};

type Recommendation = {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
};

type TopArticle = {
  title: string;
  keyword: string;
  published_at: string;
  url?: string;
};

export type AuditData = {
  month_label: string;
  overall_score: number;
  score_previous: number;
  score_evolution: number;
  summary: string;
  highlights: string[];
  improvements: string[];
  recommendations: Recommendation[];
  next_month_focus: string;
  kpis: AuditKpis;
  top_articles: TopArticle[];
};

type AuditRecord = {
  id: string;
  month: string;
  created_at: string;
  data: AuditData;
};

type Props = {
  auditRecord: AuditRecord | null;
  isAvailable: boolean;
  onClose: () => void;
  onGenerate: () => Promise<void>;
};

const priorityConfig = {
  high:   { label: "Priorité haute",   color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)" },
  medium: { label: "Priorité moyenne", color: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)" },
  low:    { label: "Priorité basse",   color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.2)" },
};

function ScoreEvolution({ current, evolution }: { current: number; evolution: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const color = current >= 66 ? "#22c55e" : current >= 40 ? "#f97316" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setAnimated(current), 150);
    return () => clearTimeout(t);
  }, [current]);

  const offset = circ * (1 - animated / 100);
  const evColor = evolution > 0 ? "#22c55e" : evolution < 0 ? "#ef4444" : "#6b7280";
  const evSign = evolution > 0 ? "+" : "";

  return (
    <div className="flex items-center gap-4">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={7} />
        <circle
          cx={50} cy={50} r={r} fill="none"
          stroke={color} strokeWidth={7} strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)" }}
        />
        <text x={50} y={46} textAnchor="middle" fill="white" fontSize={22} fontWeight="900" fontFamily="inherit">{animated}</text>
        <text x={50} y={60} textAnchor="middle" fill="rgba(156,163,175,0.7)" fontSize={10} fontFamily="inherit">/ 100</text>
      </svg>
      <div>
        <p className="text-white font-black text-lg leading-none">Score SEO</p>
        <p className="text-gray-500 text-xs mt-1">ce mois</p>
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-lg font-black" style={{ color: evColor }}>
            {evSign}{evolution}
          </span>
          <span className="text-gray-600 text-xs">vs mois précédent</span>
          {evolution > 0 && (
            <svg viewBox="0 0 24 24" fill="none" stroke={evColor} strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
              <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
            </svg>
          )}
          {evolution < 0 && (
            <svg viewBox="0 0 24 24" fill="none" stroke={evColor} strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
              <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-white font-black text-xl" style={{ color }}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

export default function AuditModal({ auditRecord, isAvailable, onClose, onGenerate }: Props) {
  const [view, setView] = useState<"notification" | "report" | "generating">(
    auditRecord ? "notification" : "notification"
  );
  const [visible, setVisible] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedAudit, setGeneratedAudit] = useState<AuditRecord | null>(auditRecord);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 350);
  }

  async function handleGenerate() {
    setView("generating");
    setGenerating(true);
    await onGenerate();
    // After generation, fetch the new audit
    try {
      const res = await fetch("/api/audit");
      const json = await res.json();
      if (json.audit) {
        setGeneratedAudit(json.audit);
      }
    } catch { /* ignore */ }
    setGenerating(false);
    setView("report");
  }

  function exportPDF() {
    document.body.classList.add("printing-audit");
    window.print();
    setTimeout(() => document.body.classList.remove("printing-audit"), 500);
  }

  const audit = generatedAudit?.data ?? null;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
        style={{
          background: view === "notification" ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.88)",
          backdropFilter: "blur(8px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}
        onClick={view === "notification" ? close : undefined}
      >
        {/* Notification */}
        {view === "notification" && (
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{
              background: "#0d0d0d",
              border: "1px solid rgba(249,115,22,0.2)",
              transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
              transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
              boxShadow: "0 0 60px rgba(249,115,22,0.08)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.2)" }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-black text-sm">Audit mensuel disponible</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <button onClick={close} className="text-gray-600 hover:text-gray-400 transition-colors mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <p className="text-gray-400 text-xs leading-relaxed mb-4">
                Votre rapport SEO mensuel est prêt — score d&apos;évolution, recommandations
                et analyse de vos publications.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={auditRecord ? () => setView("report") : handleGenerate}
                  className="flex-1 py-2.5 rounded-xl text-white font-black text-xs uppercase tracking-wide transition-all"
                  style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: "0 0 20px rgba(249,115,22,0.25)" }}
                >
                  {auditRecord ? "Voir l'audit →" : "Générer l'audit →"}
                </button>
                <button
                  onClick={close}
                  className="px-4 py-2.5 rounded-xl text-gray-500 hover:text-white text-xs border transition-colors"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                >
                  Plus tard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generating */}
        {view === "generating" && (
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: "#0d0d0d", border: "1px solid rgba(249,115,22,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />
            <div className="p-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5 relative"
                style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}>
                <svg className="absolute inset-0 w-14 h-14 animate-spin" viewBox="0 0 56 56" fill="none">
                  <circle cx="28" cy="28" r="24" stroke="rgba(249,115,22,0.15)" strokeWidth="2"/>
                  <path d="M28 4a24 24 0 0124 24" stroke="#f97316" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <p className="text-white font-black text-base mb-1">Génération de votre audit</p>
              <p className="text-gray-500 text-xs">Analyse de vos publications et performances...</p>
            </div>
          </div>
        )}

        {/* Full Report */}
        {view === "report" && audit && (
          <div
            className="w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col audit-report-container"
            style={{
              background: "#090909",
              border: "1px solid rgba(255,255,255,0.07)",
              transform: visible ? "translateY(0) scale(1)" : "translateY(30px) scale(0.97)",
              transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header fixe */}
            <div style={{ background: "#090909", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />
              <div className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-orange-400 text-xs font-bold uppercase tracking-widest">Audit SEO mensuel</p>
                  <p className="text-white font-black text-base mt-0.5">{audit.month_label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={exportPDF}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                    style={{ background: "rgba(249,115,22,0.1)", color: "#f97316", border: "1px solid rgba(249,115,22,0.2)" }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    PDF
                  </button>
                  <button onClick={close} className="text-gray-600 hover:text-gray-400 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>

              {/* Score + KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="rounded-2xl p-5" style={{ background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.12)" }}>
                  <ScoreEvolution current={audit.overall_score} evolution={audit.score_evolution} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <KpiCard label="Articles ce mois" value={audit.kpis.articles_this_month} sub={`${audit.kpis.articles_last_month} le mois d'avant`} color="white" />
                  <KpiCard label="Mots-clés couverts" value={`${audit.kpis.keywords_covered}/${audit.kpis.total_keywords}`} color="#f97316" />
                  <KpiCard label="Total publié" value={audit.kpis.total_articles} sub="depuis le début" color="white" />
                  <KpiCard
                    label="Progression"
                    value={audit.kpis.total_keywords > 0 ? `${Math.round((audit.kpis.keywords_covered / audit.kpis.total_keywords) * 100)}%` : "—"}
                    sub="couverture"
                    color={audit.kpis.keywords_covered / Math.max(audit.kpis.total_keywords, 1) > 0.5 ? "#22c55e" : "#f97316"}
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Synthèse</p>
                <p className="text-gray-300 text-sm leading-relaxed">{audit.summary}</p>
              </div>

              {/* Highlights + Improvements */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.12)" }}>
                  <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-3">Points positifs</p>
                  <ul className="space-y-2">
                    {audit.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
                        <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.1)" }}>
                  <p className="text-red-400 text-xs font-bold uppercase tracking-widest mb-3">À améliorer</p>
                  <ul className="space-y-2">
                    {audit.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-400 leading-relaxed">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">▸</span>
                        {imp}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Recommendations */}
              <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Recommandations</p>
                <div className="space-y-2">
                  {audit.recommendations.map((rec, i) => {
                    const cfg = priorityConfig[rec.priority] ?? priorityConfig.low;
                    return (
                      <div key={i} className="rounded-xl p-4 flex items-start gap-3"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                        <span className="text-xs font-black px-2 py-0.5 rounded-md flex-shrink-0 mt-0.5"
                          style={{ color: cfg.color, background: `${cfg.color}20` }}>
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-white text-xs font-bold mb-0.5">{rec.title}</p>
                          <p className="text-gray-500 text-xs leading-relaxed">{rec.description}</p>
                        </div>
                        <span className="ml-auto text-xs flex-shrink-0 font-medium" style={{ color: cfg.color }}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top articles */}
              {audit.top_articles?.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Articles publiés ce mois</p>
                  <div className="space-y-2">
                    {audit.top_articles.map((art, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <span className="text-gray-700 text-xs font-mono w-5 flex-shrink-0">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{art.title}</p>
                          <p className="text-gray-600 text-xs mt-0.5">{art.keyword}</p>
                        </div>
                        {art.url && (
                          <a href={art.url} target="_blank" rel="noopener noreferrer"
                            className="text-orange-500/60 hover:text-orange-400 transition-colors flex-shrink-0">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5">
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next month focus */}
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(239,68,68,0.04))", border: "1px solid rgba(249,115,22,0.18)" }}>
                <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">Focus du mois prochain</p>
                <p className="text-gray-300 text-sm leading-relaxed">{audit.next_month_focus}</p>
              </div>

            </div>
          </div>
        )}

        {/* Generating is handled above */}
        {generating && view !== "generating" && null}
      </div>

      <style>{`
        @media print {
          body > *:not(.audit-print-root) { display: none !important; }
          body.printing-audit > * { display: none !important; }
          body.printing-audit .audit-report-container { display: block !important; position: static !important; }
          .audit-report-container { color-scheme: light; background: white !important; color: black !important; }
        }
      `}</style>
    </>
  );
}
