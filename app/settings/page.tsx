"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
};

export default function SettingsPage() {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setConfig({ ...data, keywords: data.keywords?.join(", ") ?? "" });
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
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
        <p className="text-gray-500">Chargement...</p>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-white font-bold mb-4">Aucune configuration trouvée.</p>
          <Link href="/onboarding" className="text-orange-400 hover:underline">Configurer mon site →</Link>
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
            <p className="text-gray-500 text-sm mt-1">Paramètres</p>
          </div>
          <Link
            href="/dashboard"
            className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
          >
            ← Tableau de bord
          </Link>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-6">

          {/* Informations générales */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">Votre activité</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Nom de l&apos;entreprise</label>
                <input
                  type="text"
                  value={config.business_name}
                  onChange={(e) => update("business_name", e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Secteur d&apos;activité</label>
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
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">Connexion au site</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">URL du site</label>
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
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Nom d&apos;utilisateur WordPress</label>
                    <input
                      type="text"
                      value={config.wp_username}
                      onChange={(e) => update("wp_username", e.target.value)}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Mot de passe d&apos;application</label>
                    <input
                      type="password"
                      value={config.wp_app_password}
                      onChange={(e) => update("wp_app_password", e.target.value)}
                      placeholder="Laisser vide pour ne pas modifier"
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                  </div>
                </>
              )}
              {config.cms === "shopify" && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Clé API Admin Shopify</label>
                  <input
                    type="password"
                    value={config.shopify_api_key}
                    onChange={(e) => update("shopify_api_key", e.target.value)}
                    placeholder="Laisser vide pour ne pas modifier"
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Mots-clés & fréquence */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <h2 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-5">Stratégie SEO</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Mots-clés cibles</label>
                <textarea
                  value={Array.isArray(config.keywords) ? config.keywords.join(", ") : config.keywords}
                  onChange={(e) => update("keywords", e.target.value)}
                  rows={3}
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500/50 transition-colors resize-none"
                />
                <p className="text-gray-600 text-xs mt-1.5">Séparés par des virgules</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Fréquence de publication</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 1, label: "1 article / jour" },
                    { value: 2, label: "2 articles / jour" },
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
                      {opt.label}
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
              <p className="text-orange-400 text-sm font-bold">✓ Paramètres sauvegardés</p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20"
          >
            {saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
          </button>
        </form>
      </div>
    </main>
  );
}
