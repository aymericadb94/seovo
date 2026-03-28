"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type FormData = {
  business_name: string;
  industry: string;
  cms: "wordpress" | "shopify" | "wix" | "";
  site_url: string;
  wp_username: string;
  wp_app_password: string;
  shopify_api_key: string;
  wix_api_key: string;
  wix_site_id: string;
  keywords: string;
  frequency: number;
};

const industries = [
  "Mode & Vêtements", "Beauté & Cosmétiques", "Alimentation & Restauration",
  "Immobilier", "Santé & Bien-être", "Sport & Fitness", "Technologie",
  "Voyage & Tourisme", "Éducation & Formation", "Finance & Assurance",
  "Décoration & Maison", "Automobile", "Autre",
];

// ─── Tutoriels ────────────────────────────────────────────────────────────────

const WP_TUTORIAL = {
  title: "Comment connecter WordPress",
  permissions: ["Publier des articles", "Lire les articles existants"],
  steps: [
    {
      num: "01",
      title: "Accédez à votre admin WordPress",
      detail: "Ouvrez votre navigateur et allez sur :",
      code: "https://votresite.com/wp-admin",
    },
    {
      num: "02",
      title: "Allez dans votre profil",
      detail: "Dans le menu à gauche, cliquez sur :",
      path: ["Utilisateurs", "Votre profil"],
    },
    {
      num: "03",
      title: "Créez un mot de passe d'application",
      detail: "Descendez jusqu'à la section \"Mots de passe d'application\". Dans le champ \"Nom du mot de passe\", tapez :",
      code: "RankPill",
    },
    {
      num: "04",
      title: "Cliquez sur \"Ajouter\"",
      detail: "WordPress va générer un mot de passe de type :",
      code: "xxxx xxxx xxxx xxxx xxxx xxxx",
    },
    {
      num: "05",
      title: "Copiez ce mot de passe",
      detail: "⚠️ Ce mot de passe n'est affiché qu'une seule fois. Copiez-le immédiatement et collez-le dans le champ à gauche.",
    },
    {
      num: "06",
      title: "Renseignez les champs",
      detail: "Entrez votre nom d'utilisateur WordPress habituel (celui que vous utilisez pour vous connecter) et le mot de passe généré.",
    },
  ],
  warning: "Si vous ne voyez pas la section \"Mots de passe d'application\", vérifiez que votre WordPress est en version 5.6 minimum et que les connexions d'applications sont activées.",
};

const SHOPIFY_TUTORIAL = {
  title: "Comment connecter Shopify",
  permissions: [
    "write_content — Publier des articles de blog",
    "read_content — Lire les blogs existants",
  ],
  steps: [
    {
      num: "01",
      title: "Ouvrez votre admin Shopify",
      detail: "Connectez-vous à votre boutique Shopify et accédez à :",
      path: ["Paramètres", "Applications"],
    },
    {
      num: "02",
      title: "Accédez au Dev Dashboard",
      detail: "Cliquez sur le bouton :",
      code: "Développer des applications dans le Dev Dashboard",
    },
    {
      num: "03",
      title: "Créez une nouvelle app",
      detail: "Sur dev.shopify.com, cliquez sur \"Create app\". Donnez-lui le nom :",
      code: "RankPill",
    },
    {
      num: "04",
      title: "Configurez les accès API",
      detail: "Dans l'app, allez dans \"Configuration\" → \"Admin API integration\". Activez ces deux autorisations :",
      permissions: true,
    },
    {
      num: "05",
      title: "Créez une version et publiez",
      detail: "Allez dans \"Versions\" → \"Créer une version\". Entrez l'URL de l'app :",
      code: "https://rankpill-vbo3.vercel.app",
    },
    {
      num: "06",
      title: "Installez l'app sur votre boutique",
      detail: "Cliquez sur \"Publier\", puis installez l'app sur votre boutique TAGZ depuis le lien d'installation.",
    },
    {
      num: "07",
      title: "Copiez le token d'accès",
      detail: "Dans \"Configuration\" → \"API credentials\", copiez le :",
      code: "Jeton d'accès à l'API Admin (shpat_...)",
    },
    {
      num: "08",
      title: "Collez le token dans le champ",
      detail: "Revenez ici et collez le token dans le champ \"Clé API Admin Shopify\" à gauche.",
    },
  ],
  warning: "Le token Shopify ne s'affiche qu'une seule fois. Si vous l'avez manqué, supprimez et recréez l'app pour en générer un nouveau.",
};

const WIX_TUTORIAL = {
  title: "Comment connecter Wix",
  permissions: [
    "Blog — Lire et créer des articles",
    "Site — Lire les informations du site",
  ],
  steps: [
    {
      num: "01",
      title: "Ouvrez votre dashboard Wix",
      detail: "Connectez-vous sur manage.wix.com et sélectionnez votre site.",
    },
    {
      num: "02",
      title: "Allez dans les paramètres avancés",
      detail: "Dans le menu gauche, cliquez sur :",
      path: ["Paramètres", "Avancé", "Clés API"],
    },
    {
      num: "03",
      title: "Créez une nouvelle clé API",
      detail: "Cliquez sur \"Générer une clé API\". Donnez-lui le nom :",
      code: "RankPill",
    },
    {
      num: "04",
      title: "Accordez les permissions Blog",
      detail: "Activez les permissions : Blog (lecture + écriture). Puis cliquez sur \"Générer\".",
    },
    {
      num: "05",
      title: "Copiez la clé API",
      detail: "⚠️ La clé ne s'affiche qu'une seule fois. Copiez-la immédiatement et collez-la dans le champ à gauche.",
    },
    {
      num: "06",
      title: "Trouvez votre Site ID",
      detail: "Dans l'URL de votre dashboard Wix, repérez le UUID après /dashboard/ :",
      code: "manage.wix.com/dashboard/XXXXXXXX-XXXX-XXXX-XXXX/...",
    },
  ],
  warning: "La clé API Wix ne s'affiche qu'une seule fois à la création. Si vous l'avez manquée, supprimez-la et générez-en une nouvelle.",
};

// ─── Composant tutoriel ───────────────────────────────────────────────────────

type TutorialStep = {
  num: string;
  title: string;
  detail: string;
  code?: string;
  path?: string[];
  permissions?: boolean;
};

function Tutorial({ cms, shopifyPermissions, requiredPermissionsLabel, attentionLabel }: {
  cms: "wordpress" | "shopify" | "wix";
  shopifyPermissions?: string[];
  requiredPermissionsLabel: string;
  attentionLabel: string;
}) {
  const tuto = cms === "wordpress" ? WP_TUTORIAL : cms === "shopify" ? SHOPIFY_TUTORIAL : WIX_TUTORIAL;

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 h-full">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-base">
          {cms === "wordpress" ? "🔧" : cms === "shopify" ? "🛍️" : "🌐"}
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-wide">{tuto.title}</h3>
      </div>

      {/* Autorisations requises */}
      <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl p-3 mb-5">
        <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-2">{requiredPermissionsLabel}</p>
        <ul className="flex flex-col gap-1">
          {tuto.permissions.map((p) => (
            <li key={p} className="flex items-start gap-2 text-xs text-gray-400">
              <span className="text-orange-400 mt-0.5 flex-shrink-0">✓</span>
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* Étapes */}
      <div className="flex flex-col gap-4">
        {(tuto.steps as TutorialStep[]).map((s, i) => (
          <div key={s.num} className="flex gap-3">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                {i + 1}
              </div>
              {i < tuto.steps.length - 1 && <div className="w-px flex-1 bg-white/[0.06] mt-1 min-h-[12px]" />}
            </div>
            <div className="pb-3 flex-1">
              <p className="text-sm font-bold text-white mb-1">{s.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{s.detail}</p>
              {s.code && (
                <code className="block mt-1.5 bg-black/40 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-orange-300 font-mono">
                  {s.code}
                </code>
              )}
              {s.path && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {s.path.map((p, pi) => (
                    <span key={p} className="flex items-center gap-1">
                      <span className="bg-black/40 border border-white/[0.08] rounded px-2 py-0.5 text-xs text-gray-300 font-medium">{p}</span>
                      {pi < s.path!.length - 1 && <span className="text-gray-600 text-xs">→</span>}
                    </span>
                  ))}
                </div>
              )}
              {s.permissions && shopifyPermissions && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {shopifyPermissions.map((p) => (
                    <li key={p} className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-xs">✓</span>
                      <code className="text-xs text-orange-300 font-mono">{p.split(" — ")[0]}</code>
                      <span className="text-xs text-gray-500">{p.split(" — ")[1]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Avertissement */}
      <div className="mt-5 bg-red-500/5 border border-red-500/15 rounded-xl p-3">
        <p className="text-xs text-red-400/80 leading-relaxed">
          <span className="font-bold">⚠️ {attentionLabel} : </span>
          {tuto.warning}
        </p>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormData>({
    business_name: "", industry: "", cms: "", site_url: "",
    wp_username: "", wp_app_password: "", shopify_api_key: "",
    wix_api_key: "", wix_site_id: "",
    keywords: "", frequency: 1,
  });

  function update(key: keyof FormData, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function canProceed() {
    if (step === 0) return form.business_name.trim() && form.industry;
    if (step === 1) {
      if (!form.cms || !form.site_url.trim()) return false;
      if (form.cms === "wordpress") return form.wp_username.trim() && form.wp_app_password.trim();
      if (form.cms === "shopify") return form.shopify_api_key.trim();
      if (form.cms === "wix") return form.wix_api_key.trim() && form.wix_site_id.trim();
    }
    if (step === 2) return form.keywords.trim().length > 0;
    return false;
  }

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError("");
    const keywords = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, keywords }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || t.onboarding.error); setLoading(false); }
    else router.push("/onboarding/success");
  }

  const STEPS = t.onboarding.steps;

  // Largeur dynamique : plus large à l'étape "site" si un CMS est sélectionné
  const isWide = step === 1 && form.cms !== "";

  const freqOptions = [
    { value: 1, label: t.onboarding.freq1Label, sub: t.onboarding.freq1Sub },
    { value: 2, label: t.onboarding.freq2Label, sub: t.onboarding.freq2Sub },
  ];

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl" />
      </div>

      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className={`relative w-full transition-all duration-500 ${isWide ? "max-w-5xl" : "max-w-xl"}`}>

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black tracking-tight">
            Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
          </Link>
          <p className="text-gray-500 mt-2 text-sm">{t.onboarding.subtitle}</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 mb-10">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                  i < step ? "bg-gradient-to-r from-orange-500 to-red-500 text-white" :
                  i === step ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30" :
                  "bg-white/[0.06] text-gray-500 border border-white/10"
                }`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className={`text-xs font-bold uppercase tracking-wide ${i === step ? "text-orange-400" : "text-gray-600"}`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-20 h-px mx-2 mb-5 transition-all ${i < step ? "bg-gradient-to-r from-orange-500 to-red-500" : "bg-white/[0.08]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Layout 2 colonnes à l'étape site si CMS choisi */}
        <div className={`flex gap-5 ${isWide ? "items-start" : "flex-col"}`}>

          {/* ── Card formulaire ─────────────────────────────────────── */}
          <div className={`bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 flex flex-col gap-5 ${isWide ? "w-[420px] flex-shrink-0" : "w-full"}`}>

            {/* Step 0 : Activité */}
            {step === 0 && (
              <>
                <div>
                  <h2 className="text-xl font-black mb-1">{t.onboarding.step0Title}</h2>
                  <p className="text-gray-500 text-sm">{t.onboarding.step0Subtitle}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.businessName}</label>
                  <input
                    type="text"
                    value={form.business_name}
                    onChange={(e) => update("business_name", e.target.value)}
                    placeholder={t.onboarding.businessNamePlaceholder}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.industry}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {industries.map((ind) => (
                      <button key={ind} type="button" onClick={() => update("industry", ind)}
                        className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-all ${
                          form.industry === ind ? "bg-orange-500/10 border-orange-500/40 text-orange-400 font-bold" : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-white/20"
                        }`}>
                        {ind}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Step 1 : Site */}
            {step === 1 && (
              <>
                <div>
                  <h2 className="text-xl font-black mb-1">{t.onboarding.step1Title}</h2>
                  <p className="text-gray-500 text-sm">{t.onboarding.step1Subtitle}</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.cms}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(["wordpress", "shopify", "wix"] as const).map((cms) => (
                      <button key={cms} type="button" onClick={() => update("cms", cms)}
                        className={`py-4 rounded-xl border font-bold text-sm uppercase tracking-wide transition-all ${
                          form.cms === cms ? "bg-orange-500/10 border-orange-500/40 text-orange-400" : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-white/20"
                        }`}>
                        {cms === "wordpress" ? "WordPress" : cms === "shopify" ? "Shopify" : "Wix"}
                      </button>
                    ))}
                  </div>
                </div>

                {form.cms && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.siteUrl}</label>
                      <input
                        type="url"
                        value={form.site_url}
                        onChange={(e) => update("site_url", e.target.value)}
                        placeholder={form.cms === "wordpress" ? "https://monsite.com" : "https://maboutique.myshopify.com"}
                        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                      />
                    </div>

                    {form.cms === "wordpress" && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.wpUsername}</label>
                          <input
                            type="text"
                            value={form.wp_username}
                            onChange={(e) => update("wp_username", e.target.value)}
                            placeholder={t.onboarding.wpUsernamePlaceholder}
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.wpPassword}</label>
                          <input
                            type="password"
                            value={form.wp_app_password}
                            onChange={(e) => update("wp_app_password", e.target.value)}
                            placeholder={t.onboarding.wpPasswordPlaceholder}
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                          <p className="text-gray-600 text-xs mt-1.5">{t.onboarding.tutorialHint}</p>
                        </div>
                      </>
                    )}

                    {form.cms === "shopify" && (
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.shopifyKey}</label>
                        <input
                          type="password"
                          value={form.shopify_api_key}
                          onChange={(e) => update("shopify_api_key", e.target.value)}
                          placeholder={t.onboarding.shopifyKeyPlaceholder}
                          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                        />
                        <p className="text-gray-600 text-xs mt-1.5">{t.onboarding.tutorialHint}</p>
                      </div>
                    )}

                    {form.cms === "wix" && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.wixApiKey}</label>
                          <input
                            type="password"
                            value={form.wix_api_key}
                            onChange={(e) => update("wix_api_key", e.target.value)}
                            placeholder={t.onboarding.wixApiKeyPlaceholder}
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.wixSiteId}</label>
                          <input
                            type="text"
                            value={form.wix_site_id}
                            onChange={(e) => update("wix_site_id", e.target.value)}
                            placeholder={t.onboarding.wixSiteIdPlaceholder}
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                          <p className="text-gray-600 text-xs mt-1.5">{t.onboarding.tutorialHint}</p>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {/* Step 2 : Mots-clés */}
            {step === 2 && (
              <>
                <div>
                  <h2 className="text-xl font-black mb-1">{t.onboarding.step2Title}</h2>
                  <p className="text-gray-500 text-sm">{t.onboarding.step2Subtitle}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.keywords}</label>
                  <textarea
                    value={form.keywords}
                    onChange={(e) => update("keywords", e.target.value)}
                    placeholder={t.onboarding.keywordsPlaceholder}
                    rows={4}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors resize-none"
                  />
                  <p className="text-gray-600 text-xs mt-1.5">{t.onboarding.keywordsHint}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">{t.onboarding.frequency}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {freqOptions.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => update("frequency", opt.value)}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          form.frequency === opt.value ? "bg-orange-500/10 border-orange-500/40" : "bg-white/[0.03] border-white/[0.08] hover:border-white/20"
                        }`}>
                        <p className={`font-bold text-sm ${form.frequency === opt.value ? "text-orange-400" : "text-white"}`}>{opt.label}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{opt.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Erreur */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-2">
              {step > 0 ? (
                <button onClick={() => { setStep(step - 1); setError(""); }} className="text-gray-500 hover:text-white text-sm font-bold transition-colors">
                  {t.onboarding.back}
                </button>
              ) : <div />}
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => canProceed() && setStep(step + 1)}
                  disabled={!canProceed()}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all uppercase tracking-wide text-sm shadow-lg shadow-orange-500/20"
                >
                  {t.onboarding.next}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canProceed() || loading}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all uppercase tracking-wide text-sm shadow-lg shadow-orange-500/20"
                >
                  {loading ? t.onboarding.saving : t.onboarding.finish}
                </button>
              )}
            </div>
          </div>

          {/* ── Tutoriel (colonne droite) ────────────────────────────── */}
          {isWide && form.cms && (
            <div className="flex-1">
              <Tutorial
                cms={form.cms as "wordpress" | "shopify" | "wix"}
                shopifyPermissions={["write_content — Publier des articles de blog", "read_content — Lire les blogs existants"]}
                requiredPermissionsLabel={t.onboarding.requiredPermissions}
                attentionLabel={t.onboarding.attention}
              />
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
