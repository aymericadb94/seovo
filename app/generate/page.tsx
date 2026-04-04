"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LOCALES, localeFlags, localeNames, type Locale } from "@/lib/i18n/translations";

type SiteConfig = {
  business_name: string;
  industry: string;
  keywords: string[];
  target_languages: Locale[];
};

type SuggestedKeyword = {
  keyword: string;
  source: "roadmap" | "cocoon" | "settings";
  role: "pillar" | "support" | "unknown";
  cluster: string | null;
  phase: number | null;
  priority: "haute" | "moyenne" | "faible";
  reason: string;
};

type GeneratedArticle = {
  title: string;
  content: string;
  meta_description: string;
  cover_image_query?: string | null;
  cover_alt_text?: string | null;
};

const STEPS = [
  {
    id: "analyze",
    label: "Analyse du secteur et des mots-clés",
    sub: "Recherche sémantique et positionnement concurrentiel",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    ),
  },
  {
    id: "write",
    label: "Rédaction de l'article",
    sub: "1 500+ mots structurés H1/H2/H3 optimisés SEO",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    ),
  },
  {
    id: "optimize",
    label: "Optimisation SEO & méta-description",
    sub: "Balises, densité de mots-clés et structure optimale",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    id: "publish",
    label: "Publication sur votre site",
    sub: "Envoi automatique vers votre CMS",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
      </svg>
    ),
  },
];

const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  roadmap: { label: "Roadmap", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  cocoon: { label: "Cocon", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  settings: { label: "Config", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

export default function GeneratePage() {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [smartKeywords, setSmartKeywords] = useState<SuggestedKeyword[]>([]);
  const [keyword, setKeyword] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [language, setLanguage] = useState<Locale>("fr");
  const [previewMode, setPreviewMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "preview" | "publishing" | "done" | "error">("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [generated, setGenerated] = useState<GeneratedArticle | null>(null);
  const [result, setResult] = useState<{ title: string; url: string; meta?: string } | null>(null);
  const [error, setError] = useState("");
  const [kwFilter, setKwFilter] = useState<"all" | "roadmap" | "cocoon">("all");

  useEffect(() => {
    // Load site config + smart keywords in parallel
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/keywords/suggest").then(r => r.json()),
    ]).then(([settingsData, kwData]) => {
      if (!settingsData.error) {
        setSite({
          business_name: settingsData.business_name ?? "",
          industry: settingsData.industry ?? "",
          keywords: Array.isArray(settingsData.keywords) ? settingsData.keywords : [],
          target_languages: Array.isArray(settingsData.target_languages) && settingsData.target_languages.length > 0
            ? settingsData.target_languages
            : ["fr"],
        });
        if (Array.isArray(settingsData.target_languages) && settingsData.target_languages.length > 0) {
          setLanguage(settingsData.target_languages[0]);
        }
      }
      if (!kwData.error && kwData.suggestions) {
        setSmartKeywords(kwData.suggestions);
        // Auto-select the first suggestion
        if (kwData.suggestions.length > 0) {
          setKeyword(kwData.suggestions[0].keyword);
        }
      }
    });
  }, []);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === "generating" || status === "publishing") {
      setElapsed(0);
      const id = setInterval(() => setElapsed(s => s + 1), 1000);
      return () => clearInterval(id);
    }
  }, [status]);

  const activeKeyword = customKeyword.trim() || keyword;

  // Filtered keywords
  const filteredKeywords = kwFilter === "all"
    ? smartKeywords
    : smartKeywords.filter(k => k.source === kwFilter);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeKeyword) return;

    setStatus("generating");
    setCurrentStep(0);
    setError("");
    setResult(null);
    setGenerated(null);

    const stepTimer = setInterval(() => {
      setCurrentStep((s) => {
        if (s < 2) return s + 1;
        clearInterval(stepTimer);
        return s;
      });
    }, 4000);

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          businessName: site?.business_name ?? "",
          industry: site?.industry ?? "",
          allKeywords: site?.keywords ?? [],
          language,
        }),
      });

      clearInterval(stepTimer);

      if (!genRes.ok) {
        const data = await genRes.json();
        throw new Error(data.error || "Erreur lors de la génération");
      }

      const { title, content, meta_description, cover_image_query = null, cover_alt_text = null } = await genRes.json();
      setGenerated({ title, content, meta_description, cover_image_query, cover_alt_text });

      if (previewMode) {
        setCurrentStep(2);
        setStatus("preview");
      } else {
        await publishArticle({ title, content, meta_description, cover_image_query, cover_alt_text });
      }
    } catch (err: unknown) {
      clearInterval(stepTimer);
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  async function publishArticle(article: GeneratedArticle) {
    setCurrentStep(3);
    setStatus("publishing");

    try {
      const pubRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          content: article.content,
          meta_description: article.meta_description,
          keyword: activeKeyword,
          cover_image_query: article.cover_image_query ?? null,
          cover_alt_text: article.cover_alt_text ?? null,
        }),
      });

      const data = await pubRes.json();

      if (!pubRes.ok) {
        throw new Error(data.error || "Erreur lors de la publication");
      }

      // Warn if publication succeeded but database recording failed
      if (data.warning) {
        console.warn("[publish] Warning:", data.warning);
      }

      setResult({ title: article.title, url: data.url, meta: article.meta_description });
      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden">

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-600/8 rounded-full blur-3xl animate-orb" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-red-600/8 rounded-full blur-3xl animate-orb delay-400" />
      </div>

      <div className={`relative mx-auto px-6 py-12 transition-all duration-500 ${status === "preview" ? "max-w-4xl" : "max-w-2xl"}`}>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <Link href="/dashboard" className="text-2xl font-black tracking-tight">
              Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
            </Link>
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>
          <h1 className="text-3xl font-black mb-2">Générer un article</h1>
          <p className="text-gray-500">
            {site ? (
              <>Pour <span className="text-orange-400 font-bold">{site.business_name}</span> — {site.industry}</>
            ) : (
              "Chargement..."
            )}
          </p>
        </div>

        {/* ── Formulaire ── */}
        {status === "idle" || status === "error" ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Keyword picker — Smart suggestions */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                1. Mot-clé cible
              </label>

              {/* Source filters */}
              {smartKeywords.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  {([
                    { key: "all" as const, label: "Tous", count: smartKeywords.length },
                    { key: "roadmap" as const, label: "Roadmap SEO", count: smartKeywords.filter(k => k.source === "roadmap").length },
                    { key: "cocoon" as const, label: "Cocon", count: smartKeywords.filter(k => k.source === "cocoon").length },
                  ]).filter(f => f.count > 0).map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setKwFilter(f.key)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                        kwFilter === f.key
                          ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                          : "bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-gray-300"
                      }`}
                    >
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>
              )}

              {/* Keywords grid */}
              {filteredKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {filteredKeywords.map((kw) => {
                    const badge = SOURCE_BADGES[kw.source];
                    const isSelected = keyword === kw.keyword && !customKeyword.trim();
                    return (
                      <button
                        key={kw.keyword}
                        type="button"
                        onClick={() => { setKeyword(kw.keyword); setCustomKeyword(""); }}
                        className={`group relative px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          isSelected
                            ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                            : "bg-white/[0.04] border-white/[0.1] text-gray-400 hover:border-orange-500/30 hover:text-orange-400"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {kw.keyword}
                          {kw.source !== "settings" && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase"
                              style={{ background: badge.bg, color: badge.color }}
                            >
                              {kw.role === "pillar" ? "Pilier" : badge.label}
                            </span>
                          )}
                          {kw.priority === "haute" && (
                            <span className="text-red-400 text-[9px]">●</span>
                          )}
                        </span>
                        {/* Tooltip on hover */}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#111] border border-white/10 text-gray-300 text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          {kw.reason}{kw.cluster ? ` · ${kw.cluster}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : site && site.keywords.length > 0 ? (
                /* Fallback: raw site keywords */
                <div className="flex flex-wrap gap-2 mb-4">
                  {site.keywords.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => { setKeyword(kw); setCustomKeyword(""); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                        keyword === kw && !customKeyword.trim()
                          ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                          : "bg-white/[0.04] border-white/[0.1] text-gray-400 hover:border-orange-500/30 hover:text-orange-400"
                      }`}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="relative">
                <input
                  type="text"
                  value={customKeyword}
                  onChange={(e) => setCustomKeyword(e.target.value)}
                  placeholder="Ou saisir un mot-clé personnalisé..."
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
                />
                {customKeyword && (
                  <button
                    type="button"
                    onClick={() => setCustomKeyword("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                  >
                    ×
                  </button>
                )}
              </div>
              {activeKeyword && (
                <p className="mt-3 text-xs text-gray-500">
                  Mot-clé sélectionné : <span className="text-orange-400 font-bold">{activeKeyword}</span>
                </p>
              )}
            </div>

            {/* Language picker */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-4">
                2. Langue de l&apos;article
              </label>
              <div className="grid grid-cols-5 gap-2">
                {LOCALES.map((l) => {
                  const available = !site || site.target_languages.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => available && setLanguage(l)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-bold transition-all ${
                        language === l
                          ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
                          : available
                          ? "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-300"
                          : "bg-white/[0.02] border-white/[0.04] text-gray-700 cursor-not-allowed opacity-40"
                      }`}
                    >
                      <span className="text-xl">{localeFlags[l]}</span>
                      <span>{localeNames[l].slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview checkbox */}
            <label
              className={`flex items-center gap-4 cursor-pointer select-none p-4 rounded-xl border transition-all ${
                previewMode
                  ? "bg-orange-500/10 border-orange-500/40"
                  : "bg-white/[0.03] border-white/[0.07] hover:border-white/20"
              }`}
            >
              <input
                type="checkbox"
                checked={previewMode}
                onChange={(e) => setPreviewMode(e.target.checked)}
                className="w-5 h-5 accent-orange-500 cursor-pointer flex-shrink-0"
              />
              <div>
                <p className={`text-sm font-bold transition-colors ${previewMode ? "text-orange-400" : "text-gray-300"}`}>
                  Prévisualiser avant publication
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Relisez et validez l&apos;article avant qu&apos;il soit publié sur votre site
                </p>
              </div>
            </label>

            {status === "error" && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-red-400 text-sm font-bold">Erreur</p>
                <p className="text-gray-400 text-sm mt-1">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!activeKeyword}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20 text-sm"
            >
              {previewMode ? "Générer et prévisualiser" : "Générer et publier l'article"}
            </button>
          </form>

        ) : status === "generating" || status === "publishing" ? (
          /* ── Chargement ── */
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#090909", border: "1px solid rgba(249,115,22,0.15)" }}
          >
            {/* Top gradient bar */}
            <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />

            <div className="p-7">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#f97316", boxShadow: "0 0 8px rgba(249,115,22,0.8)", animation: "pulse 1.2s ease-in-out infinite" }}
                  />
                  <span className="text-orange-400 font-black text-sm uppercase tracking-widest">
                    {status === "publishing" ? "Publication" : "Rédaction"} en cours
                  </span>
                </div>
                {/* Live timer */}
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
                  style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.12)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3 text-orange-400/60">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span className="text-orange-400 font-black text-xs tabular-nums">{elapsed}s</span>
                </div>
              </div>

              {/* Context */}
              <p className="text-gray-500 text-sm mb-5">
                Article sur{" "}
                <span className="text-white font-black">&ldquo;{activeKeyword}&rdquo;</span>
                {" "}— {localeNames[language]}
              </p>

              {/* Overall progress bar */}
              <div className="relative h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min((currentStep / (STEPS.length - 1)) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #f97316, #ef4444)",
                    transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
                    boxShadow: "0 0 8px rgba(249,115,22,0.5)",
                  }}
                />
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-2">
                {STEPS.map((step, i) => {
                  const isDone = i < currentStep;
                  const isActive = i === currentStep;
                  return (
                    <div
                      key={step.id}
                      className="flex items-start gap-4 p-4 rounded-xl transition-all duration-500"
                      style={{
                        background: isDone
                          ? "rgba(249,115,22,0.06)"
                          : isActive
                          ? "rgba(255,255,255,0.04)"
                          : "transparent",
                        borderLeft: isActive ? "2px solid #f97316" : "2px solid transparent",
                        opacity: !isDone && !isActive ? 0.35 : 1,
                      }}
                    >
                      {/* Icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-500"
                        style={{
                          background: isDone
                            ? "rgba(249,115,22,0.2)"
                            : isActive
                            ? "rgba(249,115,22,0.1)"
                            : "rgba(255,255,255,0.04)",
                          color: isDone ? "#f97316" : isActive ? "#fb923c" : "#4b5563",
                        }}
                      >
                        {isDone ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : isActive ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="rgba(249,115,22,0.2)" strokeWidth="2"/>
                            <path d="M12 3a9 9 0 019 9" stroke="#f97316" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        ) : (
                          step.icon
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-bold leading-snug transition-colors duration-300"
                          style={{ color: isDone ? "#fdba74" : isActive ? "white" : "#6b7280" }}
                        >
                          {step.label}
                        </p>
                        {(isDone || isActive) && (
                          <p className="text-xs mt-0.5 transition-all duration-300" style={{ color: "rgba(156,163,175,0.6)" }}>
                            {step.sub}
                          </p>
                        )}
                      </div>

                      {/* Done badge */}
                      {isDone && (
                        <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: "rgba(249,115,22,0.6)" }}>
                          ✓
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-gray-600 text-xs">
                  Étape {Math.min(currentStep + 1, STEPS.length)} sur {STEPS.length}
                </p>
                <p className="text-gray-600 text-xs">
                  {elapsed < 15 ? "Estimation : 30 – 60s" : elapsed < 40 ? "Presque terminé..." : "Finalisation en cours..."}
                </p>
              </div>
            </div>
          </div>

        ) : status === "preview" && generated ? (
          /* ── Preview ── */
          <div className="flex flex-col gap-5">
            {/* Bandeau */}
            <div className="flex items-center justify-between bg-orange-500/10 border border-orange-500/30 rounded-2xl px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">👁</span>
                <div>
                  <p className="font-black text-orange-400 text-sm uppercase tracking-wide">Prévisualisation</p>
                  <p className="text-gray-500 text-xs">{localeFlags[language]} {localeNames[language]} · &quot;{activeKeyword}&quot;</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStatus("idle"); setGenerated(null); }}
                  className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 font-bold text-sm transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => generated && publishArticle(generated)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-orange-500/20 transition-all"
                >
                  Publier →
                </button>
              </div>
            </div>

            {/* Article rendu */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 md:p-12">
              {/* Meta description */}
              <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl px-4 py-3 mb-8">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Meta description</p>
                <p className="text-gray-400 text-sm leading-relaxed">{generated.meta_description}</p>
              </div>

              {/* Titre */}
              <h1 className="text-3xl font-black text-white leading-tight mb-8">
                {generated.title}
              </h1>

              {/* Contenu HTML */}
              <div
                className="prose-article"
                dangerouslySetInnerHTML={{ __html: generated.content }}
              />
            </div>

            {/* Boutons bas de page */}
            <div className="flex gap-3">
              <button
                onClick={() => { setStatus("idle"); setGenerated(null); }}
                className="flex-1 px-5 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 font-bold text-sm transition-all"
              >
                Annuler
              </button>
              <button
                onClick={() => generated && publishArticle(generated)}
                className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-orange-500/20 transition-all"
              >
                Publier l&apos;article →
              </button>
            </div>
          </div>

        ) : status === "done" && result ? (
          /* ── Succès ── */
          <div className="flex flex-col gap-4">
            <div className="bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/30 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center text-xl">✓</div>
                <div>
                  <p className="font-black text-orange-400 uppercase tracking-wide text-sm">Article publié !</p>
                  <p className="text-gray-500 text-xs">{localeFlags[language]} {localeNames[language]} · &quot;{activeKeyword}&quot;</p>
                </div>
              </div>

              <h2 className="text-xl font-black text-white mb-3 leading-snug">{result.title}</h2>

              {result.meta && (
                <p className="text-gray-400 text-sm leading-relaxed mb-5 border-l-2 border-orange-500/30 pl-3">
                  {result.meta}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-3 rounded-xl transition-all text-sm uppercase tracking-wide shadow-lg shadow-orange-500/20"
                >
                  Voir l&apos;article →
                </a>
                <button
                  onClick={() => { setStatus("idle"); setResult(null); setCustomKeyword(""); setGenerated(null); }}
                  className="flex-1 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] text-gray-300 font-bold py-3 rounded-xl transition-all text-sm"
                >
                  Générer un autre
                </button>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="text-center text-gray-600 hover:text-gray-400 text-sm transition-colors"
            >
              ← Retour au dashboard
            </Link>
          </div>
        ) : null}

      </div>
    </main>
  );
}
