"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type FormData = {
  business_name: string;
  industry: string;
  cms: "wordpress" | "shopify" | "wix" | "custom" | "";
  site_url: string;
  wp_username: string;
  wp_app_password: string;
  shopify_api_key: string;
  wix_api_key: string;
  wix_site_id: string;
  custom_api_url: string;
  custom_api_key: string;
  // Strategic fields
  objective: "acquisition" | "notoriete" | "conversion" | "fidelisation" | "";
  main_offer: string;
  target_customer: string;
  geography: "local" | "national" | "international" | "";
  geography_detail: string;
  editorial_tone: "expert" | "accessible" | "humoristique" | "inspirant" | "professionnel" | "";
  keywords: string;
  competitors: string;
  constraints: string;
};

const industries = [
  "Mode & Vêtements", "Beauté & Cosmétiques", "Alimentation & Restauration",
  "Immobilier", "Santé & Bien-être", "Sport & Fitness", "Technologie",
  "Voyage & Tourisme", "Éducation & Formation", "Finance & Assurance",
  "Décoration & Maison", "Automobile", "Services aux entreprises (B2B)",
  "Services aux particuliers", "Juridique & Conseil", "Marketing & Communication",
  "Architecture & Design", "Événementiel", "E-commerce", "Artisanat & Métiers",
  "Médias & Contenu", "Recrutement & RH", "Logistique & Transport", "Autre",
];

// ─── CMS SVG Icons ────────────────────────────────────────────────────────────

function WPIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 1.5c2.33 0 4.463.853 6.1 2.25L4.75 18.1A8.484 8.484 0 0 1 3.5 12c0-4.687 3.813-8.5 8.5-8.5zm0 17c-2.33 0-4.463-.853-6.1-2.25L19.25 5.9A8.484 8.484 0 0 1 20.5 12c0 4.687-3.813 8.5-8.5 8.5z"/>
    </svg>
  );
}

function ShopifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.117-.12-.194-.234-.194s-2.08-.146-2.08-.146-.826-.811-1.457-1.411v-.038C16.04 1.315 14.87.5 13.526.5c-.038 0-.077 0-.117.004-.194-.253-.426-.361-.657-.361C9.74.143 8.4 4.077 7.97 6.096c-1.15.354-1.97.608-2.08.646C5.08 7.077 5.04 7.12 5.02 7.423L3 22.9l12.337 1.079zM14.42 2.558v.077c-.7.215-1.456.45-2.228.687.44-1.69 1.261-2.503 1.982-2.818.195.472.27 1.107.246 2.054zm-1.244-2.15c.137 0 .272.046.407.137-.99.467-2.041 1.637-2.497 3.985-.66.203-1.303.4-1.906.585C9.66 3.112 10.921.408 13.176.408zm-.656 11.113l-.778-2.08c-.77-.37-1.556-.58-2.362-.58-.953 0-1.428.6-1.428 1.178 0 1.283 1.674 1.768 3.022 3.176.73.752 1.12 1.533 1.12 2.36 0 1.804-1.4 2.96-3.297 2.96-1.553 0-2.803-.736-3.567-1.768l.894-1.476c.624.817 1.41 1.283 2.254 1.283.777 0 1.262-.416 1.262-1.02 0-1.496-1.847-1.963-3.061-3.37-.583-.68-.895-1.478-.895-2.37 0-1.726 1.292-2.894 3.217-2.894 1.264 0 2.33.505 3.07 1.283l-.45 1.318z"/>
    </svg>
  );
}

function WixIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.705 5.385c-.408 1.188-1.152 3.35-1.848 5.366L7.71 4.617C7.346 3.52 6.663 3 5.726 3H3.43L7.8 15.43c.364 1.058 1.037 1.565 1.895 1.565.858 0 1.532-.507 1.895-1.565l2.148-6.24 2.148 6.24c.363 1.058 1.037 1.565 1.895 1.565.858 0 1.531-.507 1.895-1.565L24 3h-2.295c-.937 0-1.62.52-1.984 1.617l-2.148 6.134c-.695-2.017-1.44-4.178-1.848-5.366C15.29 1.826 14.285 1 12.997 1c-1.289 0-2.294.826-3.292 4.385z"/>
    </svg>
  );
}

function CustomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  );
}

// ─── Tutorial data ─────────────────────────────────────────────────────────────

const WP_TUTORIAL = {
  title: "Comment connecter WordPress",
  permissions: ["Publier des articles", "Lire les articles existants"],
  steps: [
    { num: "01", title: "Accédez à votre admin WordPress", detail: "Ouvrez votre navigateur et allez sur :", code: "https://votresite.com/wp-admin" },
    { num: "02", title: "Allez dans votre profil", detail: "Dans le menu à gauche, cliquez sur :", path: ["Utilisateurs", "Votre profil"] },
    { num: "03", title: "Créez un mot de passe d'application", detail: "Descendez jusqu'à la section \"Mots de passe d'application\". Dans le champ \"Nom du mot de passe\", tapez :", code: "RankPill" },
    { num: "04", title: "Cliquez sur \"Ajouter\"", detail: "WordPress va générer un mot de passe de type :", code: "xxxx xxxx xxxx xxxx xxxx xxxx" },
    { num: "05", title: "Copiez ce mot de passe", detail: "Ce mot de passe n'est affiché qu'une seule fois. Copiez-le immédiatement et collez-le dans le champ à gauche." },
    { num: "06", title: "Renseignez les champs", detail: "Entrez votre nom d'utilisateur WordPress habituel et le mot de passe généré." },
  ],
  warning: "Si vous ne voyez pas la section \"Mots de passe d'application\", vérifiez que votre WordPress est en version 5.6 minimum.",
};

const SHOPIFY_TUTORIAL = {
  title: "Comment connecter Shopify",
  permissions: ["write_content — Publier des articles de blog", "read_content — Lire les blogs existants"],
  steps: [
    { num: "01", title: "Ouvrez votre admin Shopify", detail: "Connectez-vous à votre boutique Shopify et accédez à :", path: ["Paramètres", "Applications"] },
    { num: "02", title: "Accédez au Dev Dashboard", detail: "Cliquez sur le bouton :", code: "Développer des applications dans le Dev Dashboard" },
    { num: "03", title: "Créez une nouvelle app", detail: "Sur dev.shopify.com, cliquez sur \"Create app\". Donnez-lui le nom :", code: "RankPill" },
    { num: "04", title: "Configurez les accès API", detail: "Dans l'app, allez dans \"Configuration\" → \"Admin API integration\". Activez ces deux autorisations :", permissions: true },
    { num: "05", title: "Créez une version et publiez", detail: "Allez dans \"Versions\" → \"Créer une version\". Entrez l'URL de l'app :", code: "https://www.rankpill.fr" },
    { num: "06", title: "Installez l'app sur votre boutique", detail: "Cliquez sur \"Publier\", puis installez l'app sur votre boutique depuis le lien d'installation." },
    { num: "07", title: "Copiez le token d'accès", detail: "Dans \"Configuration\" → \"API credentials\", copiez le :", code: "Jeton d'accès à l'API Admin (shpat_...)" },
    { num: "08", title: "Collez le token dans le champ", detail: "Revenez ici et collez le token dans le champ \"Clé API Admin Shopify\" à gauche." },
  ],
  warning: "Le token Shopify ne s'affiche qu'une seule fois. Si vous l'avez manqué, supprimez et recréez l'app.",
};

const WIX_TUTORIAL = {
  title: "Comment connecter Wix",
  permissions: ["Blog — Lire et créer des articles", "Site — Lire les informations du site"],
  steps: [
    { num: "01", title: "Ouvrez votre dashboard Wix", detail: "Connectez-vous sur manage.wix.com et sélectionnez votre site." },
    { num: "02", title: "Allez dans les paramètres avancés", detail: "Dans le menu gauche, cliquez sur :", path: ["Paramètres", "Avancé", "Clés API"] },
    { num: "03", title: "Créez une nouvelle clé API", detail: "Cliquez sur \"Générer une clé API\". Donnez-lui le nom :", code: "RankPill" },
    { num: "04", title: "Accordez les permissions Blog", detail: "Activez les permissions : Blog (lecture + écriture). Puis cliquez sur \"Générer\"." },
    { num: "05", title: "Copiez la clé API", detail: "La clé ne s'affiche qu'une seule fois. Copiez-la immédiatement et collez-la dans le champ à gauche." },
    { num: "06", title: "Trouvez votre Site ID dans l'URL", detail: "Retournez sur votre dashboard Wix. Regardez l'URL dans votre navigateur — elle ressemble à :", code: "manage.wix.com/dashboard/XXXXXXXX-XXXX-XXXX-XXXX/home" },
    { num: "07", title: "Copiez uniquement l'UUID", detail: "Le Site ID est la suite de chiffres et lettres entre \"/dashboard/\" et \"/home\".", code: "a1b2c3d4-1234-5678-abcd-ef1234567890" },
  ],
  warning: "La clé API Wix ne s'affiche qu'une seule fois à la création. Si vous l'avez manquée, supprimez-la et générez-en une nouvelle.",
};

const CUSTOM_TUTORIAL = {
  title: "Comment connecter votre API custom (Lovable, etc.)",
  permissions: ["POST articles — Créer des articles via l'API", "Authentification Bearer — Clé API secrète"],
  steps: [
    { num: "01", title: "Créez un endpoint POST sur votre site", detail: "Votre site doit exposer un endpoint qui accepte les requêtes POST avec le body :", code: '{ "title": "...", "content": "...", "meta_description": "..." }' },
    { num: "02", title: "Sécurisez avec un Bearer token", detail: "L'endpoint doit vérifier le header d'autorisation :", code: "Authorization: Bearer VOTRE_CLÉ_API" },
    { num: "03", title: "Retournez l'URL publiée", detail: "Après publication, retournez une réponse JSON avec l'URL de l'article :", code: '{ "url": "https://votresite.com/articles/mon-article" }' },
    { num: "04", title: "Renseignez l'URL de l'endpoint", detail: "Entrez l'URL complète de votre endpoint dans le champ à gauche.", code: "https://votresite.com/api/publish" },
    { num: "05", title: "Renseignez votre clé API", detail: "Entrez la clé secrète que votre endpoint vérifie. RankPill l'enverra dans le header Authorization." },
  ],
  warning: "Ne partagez jamais votre clé API. Elle donne accès à la publication de contenu sur votre site.",
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
  cms: "wordpress" | "shopify" | "wix" | "custom";
  shopifyPermissions?: string[];
  requiredPermissionsLabel: string;
  attentionLabel: string;
}) {
  const tuto = cms === "wordpress" ? WP_TUTORIAL : cms === "shopify" ? SHOPIFY_TUTORIAL : cms === "wix" ? WIX_TUTORIAL : CUSTOM_TUTORIAL;

  const cmsIcon = cms === "wordpress"
    ? <WPIcon className="w-4 h-4" />
    : cms === "shopify"
    ? <ShopifyIcon className="w-4 h-4" />
    : cms === "wix"
    ? <WixIcon className="w-4 h-4" />
    : <CustomIcon className="w-4 h-4" />;

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 h-full animate-[fadeInUp_0.4s_ease-out_both]">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
          {cmsIcon}
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-wide">{tuto.title}</h3>
      </div>

      <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl p-3 mb-5">
        <p className="text-xs font-bold text-orange-400 uppercase tracking-wider mb-2">{requiredPermissionsLabel}</p>
        <ul className="flex flex-col gap-1">
          {tuto.permissions.map((p) => (
            <li key={p} className="flex items-start gap-2 text-xs text-gray-400">
              <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3 mt-0.5 flex-shrink-0 text-orange-400">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-4">
        {(tuto.steps as TutorialStep[]).map((s, i) => (
          <div key={s.num} className="flex gap-3" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-md shadow-orange-500/20">
                {i + 1}
              </div>
              {i < tuto.steps.length - 1 && <div className="w-px flex-1 bg-gradient-to-b from-orange-500/20 to-transparent mt-1 min-h-[12px]" />}
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
                      <span className="w-4 h-4 rounded bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 text-xs">
                        <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                          <path d="M1.5 5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
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

      <div className="mt-5 bg-red-500/5 border border-red-500/15 rounded-xl p-3">
        <p className="text-xs text-red-400/80 leading-relaxed">
          <span className="font-bold flex items-center gap-1.5 mb-1">
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-red-400 flex-shrink-0">
              <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="11" r="0.5" fill="currentColor"/>
            </svg>
            {attentionLabel}
          </span>
          {tuto.warning}
        </p>
      </div>
    </div>
  );
}

// ─── Composants UI step 2 ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-gradient-to-r from-violet-500/30 to-transparent" />
      <span className="text-xs font-black uppercase tracking-widest text-violet-400/70">{children}</span>
      <div className="h-px flex-1 bg-gradient-to-l from-violet-500/30 to-transparent" />
    </div>
  );
}

function ChoiceCard({
  selected, onClick, icon, label, sub
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left px-4 py-3 rounded-xl border transition-all duration-200 overflow-hidden group flex items-start gap-3 ${
        selected
          ? "bg-violet-500/10 border-violet-500/40 shadow-[0_0_20px_rgba(139,92,246,0.12)]"
          : "bg-white/[0.03] border-white/[0.08] hover:border-violet-500/30 hover:bg-violet-500/5"
      }`}
    >
      {selected && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[sweep_2.5s_ease-in-out_infinite]" />
      )}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
        selected ? "bg-violet-500/20 text-violet-300" : "bg-white/[0.06] text-gray-400 group-hover:text-violet-400"
      }`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold transition-colors ${selected ? "text-violet-300" : "text-white"}`}>{label}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{sub}</p>}
      </div>
      {selected && (
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5">
          <path d="M3 8l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [animKey, setAnimKey] = useState(0);
  const [form, setForm] = useState<FormData>({
    business_name: "", industry: "", cms: "", site_url: "",
    wp_username: "", wp_app_password: "", shopify_api_key: "",
    wix_api_key: "", wix_site_id: "",
    custom_api_url: "", custom_api_key: "",
    objective: "", main_offer: "", target_customer: "",
    geography: "", geography_detail: "",
    editorial_tone: "",
    keywords: "", competitors: "", constraints: "",
  });

  function update(key: keyof FormData, value: string | number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function goToStep(n: number) {
    setStep(n);
    setAnimKey(k => k + 1);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function canProceed() {
    if (step === 0) return form.business_name.trim() && form.industry;
    if (step === 1) {
      if (!form.cms || !form.site_url.trim()) return false;
      if (form.cms === "wordpress") return form.wp_username.trim() && form.wp_app_password.trim();
      if (form.cms === "shopify") return form.shopify_api_key.trim();
      if (form.cms === "wix") return form.wix_api_key.trim() && form.wix_site_id.trim();
      if (form.cms === "custom") return form.custom_api_url.trim();
    }
    if (step === 2) {
      return (
        form.objective &&
        form.main_offer.trim() &&
        form.target_customer.trim() &&
        form.geography &&
        form.editorial_tone &&
        form.keywords.trim()
      );
    }
    return false;
  }

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError("");
    const keywords = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const frequency = 1;

    const seo_context = {
      objective: form.objective,
      main_offer: form.main_offer,
      target_customer: form.target_customer,
      geography: form.geography,
      geography_detail: form.geography_detail,
      editorial_tone: form.editorial_tone,
      competitors: form.competitors ? form.competitors.split(",").map(c => c.trim()).filter(Boolean) : [],
      constraints: form.constraints,
    };

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_name: form.business_name,
        industry: form.industry,
        cms: form.cms,
        site_url: form.site_url,
        wp_username: form.wp_username,
        wp_app_password: form.wp_app_password,
        shopify_api_key: form.shopify_api_key,
        wix_api_key: form.wix_api_key,
        wix_site_id: form.wix_site_id,
        custom_api_url: form.custom_api_url,
        custom_api_key: form.custom_api_key,
        keywords,
        frequency,
        seo_context,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || t.onboarding.error); setLoading(false); }
    else router.push("/onboarding/success");
  }

  const STEPS = ["Activité", "Site", "Stratégie"];
  const isWide = step === 1 && form.cms !== "";

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">

      {/* Orbs animés */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-600/6 rounded-full blur-3xl animate-[orb_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-red-600/5 rounded-full blur-3xl animate-[orb_10s_ease-in-out_infinite_reverse]" style={{ animationDelay: "-3s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-500/4 rounded-full blur-2xl animate-[orb_6s_ease-in-out_infinite]" style={{ animationDelay: "-1.5s" }} />
        {step === 2 && (
          <div className="absolute top-1/3 right-1/3 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-3xl animate-[orb_9s_ease-in-out_infinite]" style={{ animationDelay: "-2s" }} />
        )}
      </div>

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className={`relative w-full transition-all duration-500 ${isWide ? "max-w-5xl" : step === 2 ? "max-w-2xl" : "max-w-xl"}`}>

        {/* Logo */}
        <div className="text-center mb-8 animate-[fadeInUp_0.5s_ease-out_both]">
          <Link href="/" className="text-3xl font-black tracking-tight inline-block logo-glow">
            Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent text-shimmer">Pill</span>
          </Link>
          <p className="text-gray-500 mt-2 text-sm">{t.onboarding.subtitle}</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-0 mb-10 animate-[fadeInUp_0.5s_ease-out_0.1s_both]">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black transition-all duration-500 relative ${
                  i < step
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30"
                    : i === step && step < 2
                    ? "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-xl shadow-orange-500/40 scale-110"
                    : i === step && step === 2
                    ? "text-white shadow-xl scale-110"
                    : "bg-white/[0.06] text-gray-500 border border-white/10"
                }`}
                style={i === step && step === 2 ? { background: "linear-gradient(135deg, #7c3aed, #6d28d9)" } : {}}>
                  {i === step && step < 2 && (
                    <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
                  )}
                  {i === step && step === 2 && (
                    <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
                  )}
                  {i < step
                    ? <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5"><path d="M2 7l3.5 3.5 6.5-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    : <span>{i + 1}</span>
                  }
                </div>
                <span className={`text-xs font-bold uppercase tracking-wide transition-colors duration-300 ${
                  i === step && step < 2 ? "text-orange-400"
                  : i === step && step === 2 ? "text-violet-400"
                  : i < step ? "text-orange-500/60"
                  : "text-gray-600"
                }`}>
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="relative w-20 h-px mx-2 mb-5 bg-white/[0.08] overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-700 ${i < step ? "translate-x-0" : "-translate-x-full"}`} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Layout */}
        <div className={`flex gap-5 ${isWide ? "items-start" : "flex-col"}`}>

          {/* ── Card formulaire ─────────────────────────────────────── */}
          <div
            key={animKey}
            className={`bg-white/[0.03] border rounded-2xl p-8 flex flex-col gap-5 animate-[fadeInUp_0.4s_ease-out_both] ${
              isWide ? "w-[420px] flex-shrink-0" : "w-full"
            } ${step === 2 ? "border-violet-500/15" : "border-white/[0.07]"}`}
          >

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
                    className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.industry}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {industries.map((ind, idx) => (
                      <button key={ind} type="button" onClick={() => update("industry", ind)}
                        style={{ animationDelay: `${idx * 30}ms` }}
                        className={`relative text-left text-sm px-4 py-2.5 rounded-xl border transition-all duration-200 overflow-hidden group animate-[fadeInUp_0.3s_ease-out_both] ${
                          form.industry === ind
                            ? "bg-orange-500/10 border-orange-500/40 text-orange-400 font-bold shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                            : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-orange-500/30 hover:text-white"
                        }`}>
                        {form.industry === ind && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[sweep_2.5s_ease-in-out_infinite]" />
                        )}
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
                          style={{ background: "radial-gradient(circle at 50% 50%, rgba(249,115,22,0.06) 0%, transparent 70%)" }} />
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
                  <div className="grid grid-cols-2 gap-3">
                    {(["wordpress", "shopify", "wix", "custom"] as const).map((cms, idx) => (
                      <button key={cms} type="button" onClick={() => update("cms", cms)}
                        style={{ animationDelay: `${idx * 60}ms` }}
                        className={`relative py-4 rounded-xl border font-bold text-sm uppercase tracking-wide transition-all duration-200 overflow-hidden group animate-[fadeInUp_0.3s_ease-out_both] flex flex-col items-center gap-2 ${
                          form.cms === cms
                            ? "bg-orange-500/10 border-orange-500/40 text-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.12)]"
                            : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-orange-500/30 hover:text-white"
                        }`}>
                        {form.cms === cms && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[sweep_2.5s_ease-in-out_infinite]" />
                        )}
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                          style={{ background: "radial-gradient(circle at 50% 50%, rgba(249,115,22,0.06) 0%, transparent 70%)" }} />
                        {cms === "wordpress" ? <WPIcon className="w-5 h-5" /> : cms === "shopify" ? <ShopifyIcon className="w-5 h-5" /> : cms === "wix" ? <WixIcon className="w-5 h-5" /> : <CustomIcon className="w-5 h-5" />}
                        {cms === "wordpress" ? "WordPress" : cms === "shopify" ? "Shopify" : cms === "wix" ? "Wix" : "Custom API"}
                      </button>
                    ))}
                  </div>
                </div>

                {form.cms && (
                  <div className="flex flex-col gap-5 animate-[fadeInUp_0.3s_ease-out_both]">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.siteUrl}</label>
                      <input
                        type="url"
                        value={form.site_url}
                        onChange={(e) => update("site_url", e.target.value)}
                        placeholder={form.cms === "shopify" ? "https://maboutique.myshopify.com" : "https://votresite.com"}
                        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
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
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.wpPassword}</label>
                          <input
                            type="password"
                            value={form.wp_app_password}
                            onChange={(e) => update("wp_app_password", e.target.value)}
                            placeholder={t.onboarding.wpPasswordPlaceholder}
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
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
                          className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
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
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">{t.onboarding.wixSiteId}</label>
                          <input
                            type="text"
                            value={form.wix_site_id}
                            onChange={(e) => update("wix_site_id", e.target.value)}
                            placeholder={t.onboarding.wixSiteIdPlaceholder}
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
                          />
                          <p className="text-gray-600 text-xs mt-1.5">{t.onboarding.tutorialHint}</p>
                        </div>
                      </>
                    )}

                    {form.cms === "custom" && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Endpoint URL</label>
                          <input
                            type="text"
                            autoComplete="off"
                            value={form.custom_api_url}
                            onChange={(e) => update("custom_api_url", e.target.value)}
                            placeholder="https://votresite.com/api/publish"
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Clé API (Bearer) <span className="text-gray-600 font-normal normal-case">(optionnel)</span></label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            value={form.custom_api_key}
                            onChange={(e) => update("custom_api_key", e.target.value)}
                            placeholder="votre-clé-api-secrète"
                            className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 focus:shadow-[0_0_0_3px_rgba(249,115,22,0.08)] transition-all"
                          />
                          <p className="text-gray-600 text-xs mt-1.5">{t.onboarding.tutorialHint}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Step 2 : Stratégie intelligente */}
            {step === 2 && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(109,40,217,0.1))", border: "1px solid rgba(139,92,246,0.3)" }}>
                      <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-violet-400">
                        <path d="M8 1.5L9.5 6h4.5L10.5 9l1.5 4.5L8 11l-4 2.5L5.5 9 2 6h4.5L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <h2 className="text-xl font-black">Stratégie SEO</h2>
                  </div>
                  <p className="text-gray-500 text-sm">Ces réponses permettent à RankPill de personnaliser entièrement votre automatisation.</p>
                </div>

                {/* ── Objectif principal ── */}
                <div>
                  <SectionLabel>Objectif business</SectionLabel>
                  <div className="grid grid-cols-2 gap-2">
                    <ChoiceCard
                      selected={form.objective === "acquisition"}
                      onClick={() => update("objective", "acquisition")}
                      icon={<svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="8" cy="8" r="2" fill="currentColor" opacity=".3"/></svg>}
                      label="Acquisition"
                      sub="Attirer de nouveaux visiteurs"
                    />
                    <ChoiceCard
                      selected={form.objective === "conversion"}
                      onClick={() => update("objective", "conversion")}
                      icon={<svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M3 13l4-6 3 3 3-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="13" cy="4" r="1.5" fill="currentColor"/></svg>}
                      label="Conversion"
                      sub="Transformer les visiteurs en clients"
                    />
                    <ChoiceCard
                      selected={form.objective === "notoriete"}
                      onClick={() => update("objective", "notoriete")}
                      icon={<svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M8 3l1.5 3 3.5.5-2.5 2.5.5 3.5L8 11l-3 1.5.5-3.5L3 6.5l3.5-.5L8 3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>}
                      label="Notoriété"
                      sub="Asseoir l'autorité de la marque"
                    />
                    <ChoiceCard
                      selected={form.objective === "fidelisation"}
                      onClick={() => update("objective", "fidelisation")}
                      icon={<svg viewBox="0 0 16 16" fill="none" className="w-4 h-4"><path d="M8 13s-5-3-5-7a3 3 0 0 1 5-2.24A3 3 0 0 1 13 6c0 4-5 7-5 7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>}
                      label="Fidélisation"
                      sub="Engager et retenir les clients"
                    />
                  </div>
                </div>

                {/* ── Offre & cible ── */}
                <div className="flex flex-col gap-4">
                  <SectionLabel>Offre & audience</SectionLabel>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Offre / service prioritaire <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={form.main_offer}
                      onChange={(e) => update("main_offer", e.target.value)}
                      placeholder="ex: Logiciel de gestion RH pour PME"
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Cible client <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={form.target_customer}
                      onChange={(e) => update("target_customer", e.target.value)}
                      placeholder="ex: DRH de PME 50-500 salariés, secteur industrie"
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)] transition-all"
                    />
                  </div>
                </div>

                {/* ── Zone géographique ── */}
                <div>
                  <SectionLabel>Zone géographique</SectionLabel>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {([
                      { val: "local", label: "Locale", icon: "📍" },
                      { val: "national", label: "Nationale", icon: "🇫🇷" },
                      { val: "international", label: "Internationale", icon: "🌍" },
                    ] as const).map(({ val, label, icon }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => update("geography", val)}
                        className={`relative py-3 px-2 rounded-xl border text-center text-sm font-bold transition-all duration-200 overflow-hidden ${
                          form.geography === val
                            ? "bg-violet-500/10 border-violet-500/40 text-violet-300 shadow-[0_0_15px_rgba(139,92,246,0.12)]"
                            : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-violet-500/30 hover:text-white"
                        }`}
                      >
                        {form.geography === val && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[sweep_2.5s_ease-in-out_infinite]" />
                        )}
                        <div className="text-base mb-0.5">{icon}</div>
                        <div className="text-xs">{label}</div>
                      </button>
                    ))}
                  </div>
                  {form.geography === "local" && (
                    <input
                      type="text"
                      value={form.geography_detail}
                      onChange={(e) => update("geography_detail", e.target.value)}
                      placeholder="ex: Lyon, Rhône-Alpes, Grand Ouest..."
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-all animate-[fadeInUp_0.2s_ease-out_both]"
                    />
                  )}
                </div>

                {/* ── Ton éditorial ── */}
                <div>
                  <SectionLabel>Ton éditorial</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { val: "expert", label: "Expert", desc: "Précis, technique, autorité" },
                      { val: "accessible", label: "Accessible", desc: "Clair, pédagogique, sans jargon" },
                      { val: "inspirant", label: "Inspirant", desc: "Storytelling, émotionnel, vision" },
                      { val: "professionnel", label: "Professionnel", desc: "Neutre, sérieux, B2B" },
                      { val: "humoristique", label: "Décalé", desc: "Ton léger, proximité, créatif" },
                    ] as const).map(({ val, label, desc }) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => update("editorial_tone", val)}
                        title={desc}
                        className={`relative px-4 py-2 rounded-xl border text-sm font-bold transition-all duration-200 overflow-hidden ${
                          form.editorial_tone === val
                            ? "bg-violet-500/15 border-violet-500/50 text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.15)]"
                            : "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-violet-500/30 hover:text-white"
                        }`}
                      >
                        {form.editorial_tone === val && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[sweep_2.5s_ease-in-out_infinite]" />
                        )}
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Mots-clés ── */}
                <div>
                  <SectionLabel>Mots-clés & SEO</SectionLabel>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Mots-clés prioritaires <span className="text-red-400">*</span></label>
                    <textarea
                      value={form.keywords}
                      onChange={(e) => update("keywords", e.target.value)}
                      placeholder="ex: logiciel RH, gestion des congés, paie en ligne, SIRH PME"
                      rows={3}
                      className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 focus:shadow-[0_0_0_3px_rgba(139,92,246,0.08)] transition-all resize-none text-sm"
                    />
                    <p className="text-gray-600 text-xs mt-1.5">Séparés par des virgules — utilisés pour guider la génération d&apos;articles</p>
                  </div>
                </div>

                {/* ── Optionnel ── */}
                <div>
                  <SectionLabel>Paramètres avancés <span className="text-gray-600 font-normal normal-case">(optionnel)</span></SectionLabel>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Concurrents principaux</label>
                      <input
                        type="text"
                        value={form.competitors}
                        onChange={(e) => update("competitors", e.target.value)}
                        placeholder="ex: concurrent1.com, concurrent2.fr"
                        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-all text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Contraintes business / légales</label>
                      <input
                        type="text"
                        value={form.constraints}
                        onChange={(e) => update("constraints", e.target.value)}
                        placeholder="ex: ne pas mentionner les prix, marché réglementé"
                        className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500/50 transition-all text-sm"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Erreur */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 animate-[fadeInUp_0.3s_ease-out_both]">
                <p className="text-red-400 text-sm font-medium">{error}</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-2">
              {step > 0 ? (
                <button onClick={() => goToStep(step - 1)}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-white text-sm font-bold transition-colors group">
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform">
                    <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {t.onboarding.back}
                </button>
              ) : <div />}

              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => canProceed() && goToStep(step + 1)}
                  disabled={!canProceed()}
                  className={`relative overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all uppercase tracking-wide text-sm shadow-lg group ${
                    step === 1
                      ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-orange-500/20"
                      : "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-orange-500/20"
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  <span className="flex items-center gap-2">
                    {t.onboarding.next}
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 group-hover:translate-x-0.5 transition-transform">
                      <path d="M6 4l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!canProceed() || loading}
                  className="relative overflow-hidden disabled:opacity-30 disabled:cursor-not-allowed text-white font-black px-8 py-3 rounded-xl transition-all uppercase tracking-wide text-sm shadow-lg group"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 8px 24px rgba(139,92,246,0.25)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  <span className="flex items-center gap-2">
                    {loading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Lancement...
                      </>
                    ) : (
                      <>
                        Lancer RankPill
                        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                          <path d="M8 2l6 6-6 6M2 8h12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </>
                    )}
                  </span>
                </button>
              )}
            </div>

          </div>

          {/* ── Tutoriel (colonne droite) ────────────────────────────── */}
          {isWide && form.cms && (
            <div className="flex-1">
              <Tutorial
                cms={form.cms as "wordpress" | "shopify" | "wix" | "custom"}
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
