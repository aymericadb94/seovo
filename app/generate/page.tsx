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

type GeneratedArticle = {
  title: string;
  content: string;
  meta_description: string;
};

const STEPS = [
  { id: "analyze", label: "Analyse du secteur et des mots-clés", icon: "🔍" },
  { id: "write", label: "Rédaction de l'article (1500+ mots)", icon: "✍️" },
  { id: "optimize", label: "Optimisation SEO & méta-description", icon: "📈" },
  { id: "publish", label: "Publication sur votre site", icon: "🚀" },
];

export default function GeneratePage() {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [keyword, setKeyword] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [language, setLanguage] = useState<Locale>("fr");
  const [previewMode, setPreviewMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "preview" | "publishing" | "done" | "error">("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [generated, setGenerated] = useState<GeneratedArticle | null>(null);
  const [result, setResult] = useState<{ title: string; url: string; meta?: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setSite({
            business_name: data.business_name ?? "",
            industry: data.industry ?? "",
            keywords: Array.isArray(data.keywords) ? data.keywords : [],
            target_languages: Array.isArray(data.target_languages) && data.target_languages.length > 0
              ? data.target_languages
              : ["fr"],
          });
          if (Array.isArray(data.target_languages) && data.target_languages.length > 0) {
            setLanguage(data.target_languages[0]);
          }
          if (Array.isArray(data.keywords) && data.keywords.length > 0) {
            setKeyword(data.keywords[0]);
          }
        }
      });
  }, []);

  const activeKeyword = customKeyword.trim() || keyword;

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

      const { title, content, meta_description } = await genRes.json();
      setGenerated({ title, content, meta_description });

      if (previewMode) {
        setCurrentStep(2);
        setStatus("preview");
      } else {
        await publishArticle({ title, content, meta_description });
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
        }),
      });

      if (!pubRes.ok) {
        const data = await pubRes.json();
        throw new Error(data.error || "Erreur lors de la publication");
      }

      const { url } = await pubRes.json();
      setResult({ title: article.title, url, meta: article.meta_description });
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

            {/* Keyword picker */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-4">
                1. Mot-clé cible
              </label>
              {site && site.keywords.length > 0 && (
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
              )}
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
              {previewMode ? "✦ Générer et prévisualiser" : "✦ Générer et publier l'article"}
            </button>
          </form>

        ) : status === "generating" || status === "publishing" ? (
          /* ── Chargement ── */
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-full px-5 py-2.5 mb-4">
                <span className="w-2.5 h-2.5 bg-orange-400 rounded-full animate-pulse" />
                <span className="text-orange-400 font-bold text-sm">
                  {status === "publishing" ? "Publication en cours..." : "Rédaction en cours..."}
                </span>
              </div>
              <p className="text-gray-500 text-sm">
                Article sur <span className="text-white font-bold">&quot;{activeKeyword}&quot;</span> en {localeNames[language]}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              {STEPS.map((step, i) => {
                const isDone = i < currentStep;
                const isActive = i === currentStep;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${
                      isDone
                        ? "bg-orange-500/10 border-orange-500/20"
                        : isActive
                        ? "bg-white/[0.05] border-white/[0.15]"
                        : "bg-white/[0.02] border-white/[0.05]"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0 ${
                      isDone ? "bg-orange-500/20" : isActive ? "bg-white/10" : "bg-white/5"
                    }`}>
                      {isDone ? "✓" : isActive ? (
                        <span className="w-4 h-4 rounded-full border-2 border-orange-400 border-t-transparent animate-spin inline-block" />
                      ) : (
                        <span className="text-gray-600">{step.icon}</span>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${
                      isDone ? "text-orange-300" : isActive ? "text-white" : "text-gray-600"
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-gray-600 text-xs mt-6">
              Cela prend environ 30 à 60 secondes ☕
            </p>
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
