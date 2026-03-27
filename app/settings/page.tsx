"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LOCALES, localeFlags, localeNames, type Locale } from "@/lib/i18n/translations";

type SiteConfig = {
  business_name: string;
  industry: string;
  cms: "wordpress" | "shopify";
  site_url: string;
  wp_username: string;
  wp_app_password: string;
  shopify_api_key: string;
  keywords: string[];
  frequency: number;
  target_languages: Locale[];
};

export default function SettingsPage() {
  const { t, locale } = useLanguage();
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [discoveringKw, setDiscoveringKw] = useState(false);
  const [discoverReasoning, setDiscoverReasoning] = useState("");
  const [discoverError, setDiscoverError] = useState("");
  const [newKeyword, setNewKeyword] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setConfig({
          ...data,
          keywords: Array.isArray(data.keywords) ? data.keywords : [],
          target_languages: Array.isArray(data.target_languages) && data.target_languages.length > 0
            ? data.target_languages
            : ["fr"],
        });
      })
      .finally(() => setLoading(false));
  }, []);

  async function discoverKeywords() {
    setDiscoveringKw(true);
    setDiscoverReasoning("");
    setDiscoverError("");
    try {
      const res = await fetch("/api/keywords/discover", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDiscoverError(data.error || "Erreur lors de la génération des mots-clés");
      } else if (data.keywords?.length > 0) {
        setConfig((c) => c ? { ...c, keywords: data.keywords } : c);
        setDiscoverReasoning(data.reasoning ?? "");
      } else {
        setDiscoverError("Aucun mot-clé généré, réessayez.");
      }
    } catch {
      setDiscoverError("Impossible de contacter l'IA. Vérifiez votre connexion.");
    }
    setDiscoveringKw(false);
  }

  function addKeyword() {
    const kw = newKeyword.trim();
    if (!kw || !config) return;
    if (!config.keywords.includes(kw)) {
      setConfig((c) => c ? { ...c, keywords: [...c.keywords, kw] } : c);
    }
    setNewKeyword("");
  }

  function removeKeyword(kw: string) {
    setConfig((c) => c ? { ...c, keywords: c.keywords.filter((k) => k !== kw) } : c);
  }

  function toggleLanguage(lang: Locale) {
    if (!config) return;
    const current = config.target_languages;
    if (current.includes(lang)) {
      if (current.length === 1) return; // au moins 1 langue obligatoire
      setConfig((c) => c ? { ...c, target_languages: current.filter((l) => l !== lang) } : c);
    } else {
      setConfig((c) => c ? { ...c, target_languages: [...current, lang] } : c);
    }
  }

  async function handleSave(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...config,
        keywords: config && Array.isArray(config.keywords) ? config.keywords : [],
        target_languages: config?.target_languages ?? ["fr"],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erreur lors de la sauvegarde");
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
    setSaving(false);
  }

  function update(key: keyof SiteConfig, value: string | number) {
    setConfig((c) => c ? { ...c, [key]: value } : c);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-gray-500">{t.settings.loading}</p>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-white font-bold mb-4">{t.settings.noConfig}</p>
          <Link href="/onboarding" className="text-orange-400 hover:underline">{t.settings.configureLink}</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <Link href="/dashboard" className="text-2xl font-black tracking-tight">
              SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
            </Link>
            <p className="text-gray-500 text-sm mt-1">{t.settings.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              {t.settings.backToDashboard}
            </Link>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-6">

          {/* Informations générales */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">{t.settings.activity}</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.businessName}</label>
                <input
                  type="text"
                  value={config.business_name}
                  onChange={(e) => update("business_name", e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.industry}</label>
                <input
                  type="text"
                  value={config.industry}
                  onChange={(e) => update("industry", e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Connexion site */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">{t.settings.siteConnection}</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.siteUrl}</label>
                <input
                  type="url"
                  value={config.site_url}
                  onChange={(e) => update("site_url", e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
              {config.cms === "wordpress" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.wpUsername}</label>
                    <input
                      type="text"
                      value={config.wp_username}
                      onChange={(e) => update("wp_username", e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.wpPassword}</label>
                    <input
                      type="password"
                      value={config.wp_app_password}
                      onChange={(e) => update("wp_app_password", e.target.value)}
                      placeholder={t.settings.wpPasswordPlaceholder}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                </>
              )}
              {config.cms === "shopify" && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.shopifyKey}</label>
                  <input
                    type="password"
                    value={config.shopify_api_key}
                    onChange={(e) => update("shopify_api_key", e.target.value)}
                    placeholder={t.settings.shopifyKeyPlaceholder}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mots-clés & fréquence */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">{t.settings.seoStrategy}</h2>
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t.settings.targetKeywords}</label>
                  <button
                    type="button"
                    onClick={discoverKeywords}
                    disabled={discoveringKw}
                    className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 text-orange-400 hover:border-orange-500/60 transition-all disabled:opacity-50"
                  >
                    {discoveringKw ? (
                      <>
                        <span className="w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
                        {t.settings.analyzing}
                      </>
                    ) : (
                      <>{t.settings.discoverWithAi}</>
                    )}
                  </button>
                </div>

                {discoverReasoning && (
                  <div className="mb-3 bg-orange-500/5 border border-orange-500/20 rounded-xl px-4 py-3">
                    <p className="text-orange-400 text-xs font-bold mb-1">{t.settings.aiStrategy}</p>
                    <p className="text-gray-400 text-xs">{discoverReasoning}</p>
                  </div>
                )}
                {discoverError && (
                  <div className="mb-3 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">
                    <p className="text-red-400 text-xs">{discoverError}</p>
                  </div>
                )}

                <div className="min-h-[60px] bg-white/[0.03] border border-white/[0.1] rounded-xl p-3 flex flex-wrap gap-2">
                  {config.keywords.length === 0 && (
                    <p className="text-gray-600 text-sm">{t.settings.noKeywords}</p>
                  )}
                  {config.keywords.map((kw) => (
                    <span key={kw} className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium px-3 py-1.5 rounded-full group">
                      {kw}
                      <button
                        type="button"
                        onClick={() => removeKeyword(kw)}
                        className="text-orange-500/50 hover:text-red-400 transition-colors font-black leading-none"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    placeholder={t.settings.addKeyword}
                    className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/40 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] hover:border-orange-500/30 rounded-xl text-gray-400 hover:text-orange-400 text-sm font-bold transition-all"
                  >
                    {t.settings.add}
                  </button>
                </div>
              </div>

              {/* Langues de génération */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">{t.settings.targetLanguages}</label>
                <p className="text-gray-600 text-xs mb-3">{t.settings.languageNote}</p>
                <div className="grid grid-cols-5 gap-2">
                  {LOCALES.map((lang) => {
                    const selected = config.target_languages.includes(lang);
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => toggleLanguage(lang)}
                        className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-bold transition-all ${
                          selected
                            ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
                            : "bg-white/[0.03] border-white/[0.08] text-gray-500 hover:border-white/20 hover:text-gray-300"
                        }`}
                      >
                        <span className="text-xl">{localeFlags[lang]}</span>
                        <span>{localeNames[lang].slice(0, 3)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">{t.settings.frequency}</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 1, label: { fr: "1 article / jour", en: "1 article / day", es: "1 artículo / día", de: "1 Artikel / Tag", it: "1 articolo / giorno" } },
                    { value: 2, label: { fr: "2 articles / jour", en: "2 articles / day", es: "2 artículos / día", de: "2 Artikel / Tag", it: "2 articoli / giorno" } },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update("frequency", opt.value)}
                      className={`py-3 rounded-xl border font-bold text-sm transition-all ${
                        config.frequency === opt.value
                          ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
                          : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-white/20"
                      }`}
                    >
                      {opt.label[locale]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
              <p className="text-orange-400 text-sm font-bold">{t.settings.saved}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20"
          >
            {saving ? t.settings.saving : t.settings.save}
          </button>
        </form>
      </div>
    </main>
  );
}
