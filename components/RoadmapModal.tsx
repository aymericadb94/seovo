"use client";

import { useState } from "react";

type BusinessAnalysis = {
  summary: string;
  main_offers: string[];
  positioning: string;
  target_customers: string;
  seo_maturity: "débutant" | "intermédiaire" | "avancé";
  competitive_advantages: string[];
};

type Article = {
  id: number;
  title: string;
  keyword: string;
  intent: "informationnelle" | "commerciale" | "transactionnelle" | "navigationnelle";
  angle: string;
  why_rank: string;
  difficulty: "facile" | "moyen" | "difficile";
  conversion: "faible" | "moyen" | "fort";
  objective: "trafic" | "autorité" | "conversion";
  role: "pilier" | "cluster" | "support";
  related: number[];
  summary: string;
  key_points?: string[];
  priority: number;
};

type Phase = {
  phase: number;
  label: string;
  weeks: string;
  ids: number[];
  rationale: string;
};

export type RoadmapData = {
  business_analysis: BusinessAnalysis;
  articles: Article[];
  phases: Phase[];
  internal_linking_rules: string[];
  editorial_guidelines: string;
};

type RoadmapRecord = {
  id: string;
  created_at: string;
  data: RoadmapData;
};

type Props = {
  roadmapRecord: RoadmapRecord | null;
  onClose: () => void;
  onGenerate: () => Promise<void>;
};

const difficultyConfig = {
  facile:   { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)" },
  moyen:    { color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)" },
  difficile:{ color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.25)" },
};
const conversionConfig = {
  faible: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.25)" },
  moyen:  { color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.25)" },
  fort:   { color: "#22c55e", bg: "rgba(34,197,94,0.1)",   border: "rgba(34,197,94,0.25)" },
};
const roleConfig = {
  pilier:  { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.25)", label: "Pilier" },
  cluster: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  border: "rgba(96,165,250,0.25)", label: "Cluster" },
  support: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.25)", label: "Support" },
};
const objectiveIcons: Record<string, string> = {
  trafic: "📈",
  autorité: "🏆",
  conversion: "💰",
};

type FilterType = "all" | "pilier" | "cluster" | "support" | "facile" | "moyen" | "difficile";

export default function RoadmapModal({ roadmapRecord, onClose, onGenerate }: Props) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"articles" | "phases" | "strategy">("articles");
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const data = roadmapRecord?.data ?? null;
  const articles = data?.articles ?? [];
  const filtered = filter === "all" ? articles : articles.filter(a =>
    a.role === filter || a.difficulty === filter
  );

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await onGenerate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
    setGenerating(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/80 backdrop-blur-md overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-5xl rounded-2xl shadow-2xl mb-8 overflow-hidden"
        style={{ background: "#0e0e0e", border: "1px solid rgba(167,139,250,0.15)" }}>

        {/* Orbes de fond */}
        <div className="absolute top-0 left-0 w-[500px] h-[300px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, rgba(124,58,237,0.12) 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse at bottom right, rgba(96,165,250,0.06) 0%, transparent 65%)" }} />

        {/* Header */}
        <div className="relative flex items-center justify-between px-7 py-5" style={{ borderBottom: "1px solid rgba(167,139,250,0.1)" }}>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.2), rgba(96,165,250,0.12))", border: "1px solid rgba(167,139,250,0.25)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{ color: "#c4b5fd" }}>
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight"
                style={{ background: "linear-gradient(90deg, #e9d5ff, #c4b5fd, #a5b4fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Roadmap SEO — 40 articles
              </h2>
              {roadmapRecord && (
                <p className="text-xs text-white/30 mt-0.5">
                  Généré le {new Date(roadmapRecord.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/8"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white/40">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* No roadmap yet */}
        {!data && (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-violet-400">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Votre Roadmap SEO n'a pas encore été générée</h3>
            <p className="text-white/40 text-sm mb-6 max-w-md mx-auto">
              RankPill va analyser votre secteur, vos concurrents et vos mots-clés pour générer un plan éditorial stratégique de 40 articles optimisé pour dominer Google.
            </p>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-6 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {generating ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  Analyse en cours (1-2 min)...
                </span>
              ) : "Générer ma Roadmap SEO"}
            </button>
          </div>
        )}

        {/* Roadmap content */}
        {data && (
          <>
            {/* Business analysis banner */}
            <div className="relative px-7 py-4" style={{ borderBottom: "1px solid rgba(167,139,250,0.08)", background: "rgba(124,58,237,0.04)" }}>
              <div className="flex items-start gap-5">
                <div className="flex-1">
                  <p className="text-white/65 text-sm leading-relaxed">{data.business_analysis.summary}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    <span className="text-xs">
                      <span className="font-semibold" style={{ color: "#a78bfa" }}>Positionnement</span>
                      <span className="text-white/30 mx-1">·</span>
                      <span className="text-white/40">{data.business_analysis.positioning}</span>
                    </span>
                    <span className="text-xs">
                      <span className="font-semibold" style={{ color: "#a78bfa" }}>Maturité SEO</span>
                      <span className="text-white/30 mx-1">·</span>
                      <span className="text-white/40 capitalize">{data.business_analysis.seo_maturity}</span>
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all disabled:opacity-40 hover:bg-white/8"
                  style={{ border: "1px solid rgba(167,139,250,0.2)", color: "rgba(196,181,253,0.7)" }}
                >
                  {generating ? "En cours..." : "Regénérer"}
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex" style={{ borderBottom: "1px solid rgba(167,139,250,0.08)" }}>
              {(["articles", "phases", "strategy"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-5 py-3.5 text-sm font-medium transition-all border-b-2 -mb-px"
                  style={{
                    borderBottomColor: activeTab === tab ? "#a78bfa" : "transparent",
                    color: activeTab === tab ? "#c4b5fd" : "rgba(255,255,255,0.3)",
                  }}
                >
                  {tab === "articles" ? `40 Articles (${articles.length})` : tab === "phases" ? "Plan de publication" : "Stratégie éditoriale"}
                </button>
              ))}
            </div>

            {/* Articles tab */}
            {activeTab === "articles" && (
              <div className="p-5">
                {/* Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {(["all", "pilier", "cluster", "support", "facile", "moyen", "difficile"] as FilterType[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                      style={filter === f ? {
                        background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(109,40,217,0.3))",
                        border: "1px solid rgba(167,139,250,0.4)",
                        color: "#e9d5ff",
                      } : {
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.35)",
                      }}
                    >
                      {f === "all" ? `Tous (${articles.length})` : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Article list */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {filtered.map(article => {
                    const diff = difficultyConfig[article.difficulty] ?? difficultyConfig.moyen;
                    const conv = conversionConfig[article.conversion] ?? conversionConfig.moyen;
                    const role = roleConfig[article.role] ?? roleConfig.support;
                    const isExpanded = expandedId === article.id;
                    return (
                      <div
                        key={article.id}
                        className="bg-white/3 border border-white/8 rounded-xl overflow-hidden hover:border-white/15 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : article.id)}
                      >
                        <div className="flex items-center gap-3 p-3">
                          <span className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/40 flex-shrink-0">
                            {article.id}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white truncate">{article.title}</span>
                              <span className="text-xs">{objectiveIcons[article.objective]}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-white/40">{article.keyword}</span>
                              <span className="text-white/20">·</span>
                              <span className="text-xs" style={{ color: role.color }}>{role.label}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium border" style={{ color: diff.color, background: diff.bg, borderColor: diff.border }}>
                              {article.difficulty}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium border" style={{ color: conv.color, background: conv.bg, borderColor: conv.border }}>
                              conv. {article.conversion}
                            </span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 text-white/30 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}>
                              <polyline points="6 9 12 15 18 9"/>
                            </svg>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-white/8 space-y-3">
                            <div>
                              <p className="text-xs text-violet-400 font-medium mb-1">Angle différenciant</p>
                              <p className="text-sm text-white/70">{article.angle}</p>
                            </div>
                            <div>
                              <p className="text-xs text-violet-400 font-medium mb-1">Pourquoi cet article peut ranker</p>
                              <p className="text-sm text-white/70">{article.why_rank}</p>
                            </div>
                            <div>
                              <p className="text-xs text-violet-400 font-medium mb-1">Résumé stratégique</p>
                              <p className="text-sm text-white/60 leading-relaxed">{article.summary}</p>
                            </div>
                            {(article.key_points?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-xs text-violet-400 font-medium mb-1">Points clés à traiter</p>
                                <ul className="space-y-1">
                                  {article.key_points?.map((pt, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                                      <span className="text-violet-500 mt-0.5">›</span>
                                      {pt}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {article.related?.length > 0 && (
                              <p className="text-xs text-white/30">
                                Maillage : articles {article.related.join(", ")}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phases tab */}
            {activeTab === "phases" && (
              <div className="p-5 space-y-4">
                {data.phases.map(phase => {
                  const phaseArticles = articles.filter(a => phase.ids.includes(a.id));
                  const colors = [
                    { bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)", accent: "#a78bfa" },
                    { bg: "rgba(96,165,250,0.08)",  border: "rgba(96,165,250,0.2)",  accent: "#60a5fa" },
                    { bg: "rgba(34,197,94,0.08)",   border: "rgba(34,197,94,0.2)",   accent: "#22c55e" },
                  ][phase.phase - 1] ?? { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)", accent: "#fff" };

                  return (
                    <div key={phase.phase} className="rounded-xl border p-4" style={{ background: colors.bg, borderColor: colors.border }}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="font-bold text-white text-sm">Phase {phase.phase} — {phase.label}</h3>
                          <p className="text-xs mt-0.5" style={{ color: colors.accent }}>{phase.weeks} · {phase.ids.length} articles</p>
                        </div>
                        <span className="w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-bold" style={{ color: colors.accent, borderColor: colors.border }}>
                          {phase.phase}
                        </span>
                      </div>
                      <p className="text-white/50 text-xs mb-3 leading-relaxed">{phase.rationale}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {phaseArticles.map(a => (
                          <span
                            key={a.id}
                            className="px-2 py-1 rounded-lg text-xs text-white/60 border border-white/8 bg-white/3 cursor-pointer hover:bg-white/8 transition-colors"
                            onClick={() => { setActiveTab("articles"); setExpandedId(a.id); setFilter("all"); }}
                            title={a.title}
                          >
                            #{a.id} {a.title.length > 30 ? a.title.slice(0, 30) + "…" : a.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Strategy tab */}
            {activeTab === "strategy" && (
              <div className="p-5 space-y-5">
                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-xs">🔗</span>
                    Règles de maillage interne
                  </h3>
                  <ul className="space-y-2">
                    {data.internal_linking_rules.map((rule, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                        <span className="text-violet-400 mt-0.5 flex-shrink-0">›</span>
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-xs">✍️</span>
                    Directives éditoriales anti-IA
                  </h3>
                  <p className="text-sm text-white/60 leading-relaxed">{data.editorial_guidelines}</p>
                </div>

                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-green-500/15 border border-green-500/25 flex items-center justify-center text-xs">🏢</span>
                    Avantages concurrentiels à exploiter
                  </h3>
                  <ul className="space-y-2">
                    {data.business_analysis.competitive_advantages.map((adv, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                        <span className="text-green-400 mt-0.5 flex-shrink-0">›</span>
                        {adv}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white/3 border border-white/8 rounded-xl p-4">
                  <h3 className="text-sm font-bold text-white mb-3">Clients cibles</h3>
                  <p className="text-sm text-white/60">{data.business_analysis.target_customers}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
