"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { LOCALES, localeFlags, localeNames, type Locale } from "@/lib/i18n/translations";

type SiteConfig = {
  business_name: string;
  industry: string;
  cms: "wordpress" | "shopify" | "wix" | "custom";
  site_url: string;
  wp_username: string;
  wp_app_password: string;
  shopify_api_key: string;
  wix_api_key: string;
  wix_site_id: string;
  custom_api_url: string;
  custom_api_key: string;
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
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "ok" | "error">("idle");
  const [connectionError, setConnectionError] = useState("");
  const [discoveringKw, setDiscoveringKw] = useState(false);
  const [discoverReasoning, setDiscoverReasoning] = useState("");
  const [discoverError, setDiscoverError] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [gscConnected, setGscConnected] = useState(false);
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [gscProperties, setGscProperties] = useState<{ url: string }[]>([]);
  const [gscMsg, setGscMsg] = useState<"success" | "error" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    // Detect GSC OAuth redirect result
    const params = new URLSearchParams(window.location.search);
    if (params.get("gsc") === "success") setGscMsg("success");
    if (params.get("gsc") === "error") {
      const reason = params.get("reason");
      console.error("[GSC] error reason:", reason);
      setGscMsg("error");
    }

    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) {
          setConfig({
            ...data,
            keywords: Array.isArray(data.keywords) ? data.keywords : [],
            target_languages: Array.isArray(data.target_languages) && data.target_languages.length > 0
              ? data.target_languages
              : ["fr"],
            custom_api_url: data.custom_api_url ?? "",
            custom_api_key: data.custom_api_key ?? "",
          });
          setGscConnected(!!data.gsc_connected);
          setGscSiteUrl(data.gsc_site_url ?? "");
          if (data.gsc_connected) {
            fetch("/api/gsc/sites").then(r => r.json()).then(d => {
              if (d.sites) setGscProperties(d.sites);
            });
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function testConnection() {
    if (!config) return;
    setTestingConnection(true);
    setConnectionStatus("idle");
    setConnectionError("");
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cms: config.cms,
          siteUrl: config.site_url,
          wpUsername: config.wp_username,
          wpAppPassword: config.wp_app_password,
          shopifyApiKey: config.shopify_api_key,
          wixApiKey: config.wix_api_key,
          wixSiteId: config.wix_site_id,
          customApiUrl: config.custom_api_url,
          customApiKey: config.custom_api_key,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConnectionStatus("ok");
      } else {
        setConnectionStatus("error");
        setConnectionError(data.reason ?? "Erreur inconnue");
      }
    } catch {
      setConnectionStatus("error");
      setConnectionError("Impossible de joindre le serveur");
    }
    setTestingConnection(false);
  }

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
      setDiscoverError("Impossible de générer les mots-clés. Vérifiez votre connexion.");
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
              Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
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
              {config.cms === "wix" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.wixApiKey}</label>
                    <input
                      type="password"
                      value={config.wix_api_key}
                      onChange={(e) => update("wix_api_key", e.target.value)}
                      placeholder={t.settings.wixApiKeyPlaceholder}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.settings.wixSiteId}</label>
                    <input
                      type="text"
                      value={config.wix_site_id}
                      onChange={(e) => update("wix_site_id", e.target.value)}
                      placeholder={t.settings.wixSiteIdPlaceholder}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                </>
              )}
              {config.cms === "custom" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Endpoint URL</label>
                    <input
                      type="url"
                      value={config.custom_api_url}
                      onChange={(e) => update("custom_api_url", e.target.value)}
                      placeholder="https://votresite.com/api/articles"
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Clé API (Bearer)</label>
                    <input
                      type="password"
                      value={config.custom_api_key}
                      onChange={(e) => update("custom_api_key", e.target.value)}
                      placeholder="votre-clé-api-secrète"
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                </>
              )}

              {/* Bouton test de connexion */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={testConnection}
                  disabled={testingConnection}
                  className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.1] text-gray-300 hover:border-white/30 hover:text-white transition-all disabled:opacity-50"
                >
                  {testingConnection ? (
                    <>
                      <span className="w-3 h-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                      {t.settings.testing}
                    </>
                  ) : (
                    <>{t.settings.testConnection}</>
                  )}
                </button>

                {connectionStatus === "ok" && (
                  <span className="text-xs font-bold text-green-400">{t.settings.connectionOk}</span>
                )}
                {connectionStatus === "error" && (
                  <span className="text-xs font-bold text-red-400">{t.settings.connectionFailed} — {connectionError}</span>
                )}
              </div>
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

          {/* Google Search Console */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Google Search Console</h2>
                <p className="text-gray-600 text-xs">Clics, impressions, positions réelles depuis Google</p>
              </div>
              {gscConnected && (
                <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-green-400">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Connecté
                </span>
              )}
            </div>

            {gscMsg === "success" && (
              <div className="mb-4 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
                <p className="text-green-400 text-sm font-bold">✓ Google Search Console connecté avec succès</p>
              </div>
            )}
            {gscMsg === "error" && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">Erreur lors de la connexion Google. Réessayez.</p>
              </div>
            )}

            {!gscConnected ? (
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-2 w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 rounded-xl text-white text-sm font-bold transition-all"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connecter Google Search Console
              </a>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1.5 block">
                    Propriété GSC à utiliser
                  </label>
                  <div className="relative">
                    <select
                      value={gscSiteUrl}
                      onChange={e => setGscSiteUrl(e.target.value)}
                      className="w-full appearance-none bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500/50 transition-colors cursor-pointer"
                      style={{ color: gscSiteUrl ? "white" : "rgba(156,163,175,0.7)" }}
                    >
                      <option value="" style={{ background: "#111", color: "rgba(156,163,175,0.7)" }}>Sélectionner une propriété</option>
                      {gscProperties.map(p => (
                        <option key={p.url} value={p.url} style={{ background: "#111", color: "white" }}>{p.url}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  <p className="text-gray-600 text-xs mt-1.5">Sélectionnez le site qui correspond à vos publications</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch("/api/settings", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ gsc_site_url: gscSiteUrl }),
                    });
                    setGscMsg("success");
                  }}
                  disabled={!gscSiteUrl}
                  className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all"
                >
                  Enregistrer la propriété GSC
                </button>
              </div>
            )}
          </div>

          {/* Sécurité — changement de mot de passe */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">Sécurité</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Nouveau mot de passe</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  minLength={8}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
              {passwordMsg === "success" && (
                <p className="text-green-400 text-sm font-bold">✓ Mot de passe modifié — un email de confirmation vous a été envoyé.</p>
              )}
              {passwordMsg === "error" && (
                <p className="text-red-400 text-sm">Erreur lors du changement de mot de passe. Réessayez.</p>
              )}
              <button
                type="button"
                disabled={passwordSaving || newPassword.length < 8}
                onClick={async () => {
                  setPasswordSaving(true);
                  setPasswordMsg(null);
                  const res = await fetch("/api/auth/password", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: newPassword }),
                  });
                  setPasswordMsg(res.ok ? "success" : "error");
                  if (res.ok) setNewPassword("");
                  setPasswordSaving(false);
                }}
                className="w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] hover:border-white/[0.2] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all"
              >
                {passwordSaving ? "Modification…" : "Changer le mot de passe"}
              </button>
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
