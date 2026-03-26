"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type FormData = {
  business_name: string;
  industry: string;
  cms: "wordpress" | "shopify" | "";
  site_url: string;
  wp_username: string;
  wp_app_password: string;
  shopify_api_key: string;
  keywords: string;
  frequency: number;
};

const industries = [
  "Mode & Vêtements", "Beauté & Cosmétiques", "Alimentation & Restauration",
  "Immobilier", "Santé & Bien-être", "Sport & Fitness", "Technologie",
  "Voyage & Tourisme", "Éducation & Formation", "Finance & Assurance",
  "Décoration & Maison", "Automobile", "Autre",
];

const STEPS = ["Votre activité", "Votre site", "Mots-clés"];

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
      code: "SEOVO",
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
      path: ["Paramètres", "Applications et canaux de vente"],
    },
    {
      num: "02",
      title: "Accédez au développement d'apps",
      detail: "En bas de la page, cliquez sur :",
      code: "Développer des apps",
    },
    {
      num: "03",
      title: "Activez le développement d'apps",
      detail: "Si c'est la première fois, Shopify vous demande de confirmer. Cliquez sur \"Autoriser le développement d'apps personnalisées\".",
    },
    {
      num: "04",
      title: "Créez une nouvelle app",
      detail: "Cliquez sur \"Créer une app\". Donnez-lui le nom :",
      code: "SEOVO",
    },
    {
      num: "05",
      title: "Configurez les autorisations API",
      detail: "Cliquez sur \"Configurer les étendues de l'API Admin\". Activez ces deux autorisations :",
      permissions: true,
    },
    {
      num: "06",
      title: "Installez l'app et copiez le token",
      detail: "Cliquez sur \"Enregistrer\", puis \"Installer l'app\". Dans l'onglet \"API credentials\", copiez le :",
      code: "Jeton d'accès à l'API Admin (shpat_...)",
    },
    {
      num: "07",
      title: "Collez le token dans le champ",
      detail: "Revenez ici et collez le token dans le champ \"Clé API Admin Shopify\" à gauche.",
    },
  ],
  warning: "Le token Shopify ne s'affiche qu'une seule fois. Si vous l'avez manqué, vous devrez désinstaller et réinstaller l'app pour en générer un nouveau.",
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

function Tutorial({ cms, shopifyPermissions }: { cms: "wordpress" | "shopify"; shopifyPermissions?: string[] }) {
  const tuto = cms === "wordpress" ? WP_TUTORIAL : SHOPIFY_TUTORIAL;

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 h-full">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-base">
          {cms === "wordpress" ? "🔧" : "🛍️"}
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-wide">{tuto.title}</h3>
      </div>

      {/* Autorisations requises */}
      <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl p-3 mb-5">
        <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-2">Autorisations requises</p>
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
          <span className="font-bold">⚠️ Attention : </span>
          {tuto.warning}
        </p>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormData>({
    business_name: "", industry: "", cms: "", site_url: "",
    wp_username: "", wp_app_password: "", shopify_api_key: "",
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
    }
    if (step === 2) return form.keywords.trim().length > 0;
    return false;
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    const keywords = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, keywords }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Une erreur est survenue"); setLoading(false); }
    else router.push("/onboarding/success");
  }

  // Largeur dynamique : plus large à l'étape "site" si un CMS est sélectionné
  const isWide = step === 1 && form.cms !== "";

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl" />
      </div>

      <div className={`relative w-full transition-all duration-500 ${isWide ? "max-w-5xl" : "max-w-xl"}`}>

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black tracking-tight">
            SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
          </Link>
          <p className="text-gray-500 mt-2 text-sm">Configuration de votre espace</p>
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
                  <h2 className="text-xl font-black mb-1">Parlez-nous de votre activité</h2>
                  <p className="text-gray-500 text-sm">Ces informations permettront à l&apos;IA de générer du contenu pertinent.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Nom de l&apos;entreprise</label>
                  <input
                    type="text"
                    value={form.business_name}
                    onChange={(e) => update("business_name", e.target.value)}
                    placeholder="Ex: Tagz Vintage"
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Secteur d&apos;activité</label>
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
                  <h2 className="text-xl font-black mb-1">Connectez votre site</h2>
                  <p className="text-gray-500 text-sm">L&apos;IA publiera directement sur votre site chaque jour.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Votre CMS</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["wordpress", "shopify"] as const).map((cms) => (
                      <button key={cms} type="button" onClick={() => update("cms", cms)}
                        className={`py-4 rounded-xl border font-bold text-sm uppercase tracking-wide transition-all ${
                          form.cms === cms ? "bg-orange-500/10 border-orange-500/40 text-orange-400" : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-white/20"
                        }`}>
                        {cms === "wordpress" ? "WordPress" : "Shopify"}
                      </button>
                    ))}
                  </div>
                </div>

                {form.cms && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">URL du site</label>
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
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Nom d&apos;utilisateur WordPress</label>
                          <input
                            type="text"
                            value={form.wp_username}
                            onChange={(e) => update("wp_username", e.target.value)}
                            placeholder="admin"
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Mot de passe d&apos;application</label>
                          <input
                            type="password"
                            value={form.wp_app_password}
                            onChange={(e) => update("wp_app_password", e.target.value)}
                            placeholder="xxxx xxxx xxxx xxxx"
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                          />
                          <p className="text-gray-600 text-xs mt-1.5">Suivez le tutoriel à droite →</p>
                        </div>
                      </>
                    )}

                    {form.cms === "shopify" && (
                      <div>
                        <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Clé API Admin Shopify</label>
                        <input
                          type="password"
                          value={form.shopify_api_key}
                          onChange={(e) => update("shopify_api_key", e.target.value)}
                          placeholder="shpat_xxxxxxxxxxxx"
                          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
                        />
                        <p className="text-gray-600 text-xs mt-1.5">Suivez le tutoriel à droite →</p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Step 2 : Mots-clés */}
            {step === 2 && (
              <>
                <div>
                  <h2 className="text-xl font-black mb-1">Définissez vos cibles SEO</h2>
                  <p className="text-gray-500 text-sm">L&apos;IA utilisera ces mots-clés pour générer du contenu stratégique.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Mots-clés cibles</label>
                  <textarea
                    value={form.keywords}
                    onChange={(e) => update("keywords", e.target.value)}
                    placeholder="grossiste vêtements seconde main, mode vintage Paris, friperie en gros..."
                    rows={4}
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors resize-none"
                  />
                  <p className="text-gray-600 text-xs mt-1.5">Séparez les mots-clés par des virgules</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Fréquence de publication</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[{ value: 1, label: "1 article / jour", sub: "Recommandé" }, { value: 2, label: "2 articles / jour", sub: "Croissance rapide" }].map((opt) => (
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
                  ← Retour
                </button>
              ) : <div />}
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => canProceed() && setStep(step + 1)}
                  disabled={!canProceed()}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all uppercase tracking-wide text-sm shadow-lg shadow-orange-500/20"
                >
                  Continuer →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canProceed() || loading}
                  className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all uppercase tracking-wide text-sm shadow-lg shadow-orange-500/20"
                >
                  {loading ? "Vérification..." : "Lancer SEOVO →"}
                </button>
              )}
            </div>
          </div>

          {/* ── Tutoriel (colonne droite) ────────────────────────────── */}
          {isWide && form.cms && (
            <div className="flex-1">
              <Tutorial
                cms={form.cms as "wordpress" | "shopify"}
                shopifyPermissions={["write_content — Publier des articles de blog", "read_content — Lire les blogs existants"]}
              />
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
