"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useState, useEffect, useRef } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// ─── useInView ────────────────────────────────────────────────────────────────

function useInView(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ─── useCounter ───────────────────────────────────────────────────────────────

function useCounter(target: number, active: boolean, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active || target === 0) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, target, duration]);
  return value;
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
  { name: "Sophie M.", role: "Fondatrice, Boutique Léonie", content: "En 3 mois, mon trafic organique a augmenté de 340%. Je n'ai rien eu à faire — RankPill s'est occupé de tout.", avatar: "S" },
  { name: "Thomas R.", role: "Directeur Marketing, TechFlow", content: "On économise 15h par semaine sur la création de contenu. Le ROI est évident dès le premier mois.", avatar: "T" },
  { name: "Camille D.", role: "CEO, Studio Créatif", content: "La qualité des articles générés est bluffante. Nos clients pensent qu'on a une équipe de rédacteurs SEO.", avatar: "C" },
];

// ─── Plans ────────────────────────────────────────────────────────────────────

const plans = [
  {
    name: "Starter", price: "49", descKey: "Pour les indépendants et petites boutiques",
    features: ["1 site connecté", "1 article / jour", "10 mots-clés max", "WordPress ou Shopify", "Dashboard basique", "Support email"],
    featuresEn: ["1 connected site", "1 article / day", "10 keywords max", "WordPress or Shopify", "Basic dashboard", "Email support"],
    featuresEs: ["1 sitio conectado", "1 artículo / día", "10 palabras clave máx.", "WordPress o Shopify", "Dashboard básico", "Soporte por email"],
    featuresDe: ["1 Website verbunden", "1 Artikel / Tag", "Maximal 10 Keywords", "WordPress oder Shopify", "Basis-Dashboard", "E-Mail-Support"],
    featuresIt: ["1 sito connesso", "1 articolo / giorno", "10 parole chiave max", "WordPress o Shopify", "Dashboard base", "Supporto email"],
    cta: { fr: "Démarrer en Beta", en: "Start in Beta", es: "Empezar en Beta", de: "Beta starten", it: "Inizia in Beta" },
    highlighted: false, badge: null, langLimit: 1,
  },
  {
    name: "Premium", price: "149", descKey: "Pour les PME et e-commerçants actifs",
    features: ["5 sites connectés", "2 articles / jour par site", "30 mots-clés max", "WordPress + Shopify", "Analyse automatique des mots-clés", "Dashboard complet", "Support prioritaire"],
    featuresEn: ["5 connected sites", "2 articles / day per site", "30 keywords max", "WordPress + Shopify", "Automated keyword analysis", "Full dashboard", "Priority support"],
    featuresEs: ["5 sitios conectados", "2 artículos / día por sitio", "30 palabras clave máx.", "WordPress + Shopify", "Análisis automático de palabras clave", "Dashboard completo", "Soporte prioritario"],
    featuresDe: ["5 Websites verbunden", "2 Artikel / Tag pro Website", "Maximal 30 Keywords", "WordPress + Shopify", "Automatische Keyword-Analyse", "Volles Dashboard", "Prioritäts-Support"],
    featuresIt: ["5 siti connessi", "2 articoli / giorno per sito", "30 parole chiave max", "WordPress + Shopify", "Analisi automatica delle parole chiave", "Dashboard completo", "Supporto prioritario"],
    cta: { fr: "Démarrer en Beta", en: "Start in Beta", es: "Empezar en Beta", de: "Beta starten", it: "Inizia in Beta" },
    highlighted: true, badge: { fr: "Le plus populaire", en: "Most popular", es: "El más popular", de: "Beliebteste", it: "Il più popolare" }, langLimit: 3,
  },
  {
    name: "Elite", price: "399", descKey: "Pour les agences et grands comptes",
    features: ["20 sites connectés", "5 articles / jour par site", "Mots-clés illimités", "WordPress + Shopify", "Analyse avancée des mots-clés", "Dashboard complet + analytics", "Account manager dédié"],
    featuresEn: ["20 connected sites", "5 articles / day per site", "Unlimited keywords", "WordPress + Shopify", "Advanced keyword analysis", "Full dashboard + analytics", "Dedicated account manager"],
    featuresEs: ["20 sitios conectados", "5 artículos / día por sitio", "Palabras clave ilimitadas", "WordPress + Shopify", "Análisis avanzado de palabras clave", "Dashboard completo + analíticas", "Account manager dedicado"],
    featuresDe: ["20 Websites verbunden", "5 Artikel / Tag pro Website", "Unbegrenzte Keywords", "WordPress + Shopify", "Erweiterte Keyword-Analyse", "Volles Dashboard + Analytics", "Dedizierter Account Manager"],
    featuresIt: ["20 siti connessi", "5 articoli / giorno per sito", "Parole chiave illimitate", "WordPress + Shopify", "Analisi avanzata delle parole chiave", "Dashboard completo + analytics", "Account manager dedicato"],
    cta: { fr: "Nous contacter", en: "Contact us", es: "Contáctanos", de: "Kontakt aufnehmen", it: "Contattaci" },
    highlighted: false, badge: null, langLimit: 5,
  },
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function FaqSection() {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const { ref, inView } = useInView();

  return (
    <section id="faq" className="py-28 px-6">
      <div className="max-w-3xl mx-auto" ref={ref}>
        <div className={`text-center mb-16 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.faq.title}</h2>
          <p className="text-gray-400 text-lg">{t.faq.subtitle}</p>
        </div>
        <div className="flex flex-col gap-3">
          {t.faq.items.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`border rounded-2xl overflow-hidden transition-all duration-300 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"} ${
                  isOpen ? "bg-white/[0.04] border-orange-500/30" : "bg-white/[0.02] border-white/[0.07] hover:border-white/[0.15]"
                }`}
                style={{ transitionDelay: `${i * 60 + 200}ms` }}
              >
                <button onClick={() => setOpenIndex(isOpen ? null : i)} className="w-full flex items-center justify-between px-6 py-5 text-left gap-4">
                  <span className={`font-bold text-sm md:text-base transition-colors ${isOpen ? "text-white" : "text-gray-300"}`}>{item.q}</span>
                  <span className={`text-xl flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-45 text-orange-400" : "text-gray-600"}`}>+</span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-5">
                    <p className="text-gray-400 text-sm leading-relaxed border-t border-white/[0.06] pt-4">{item.a}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className={`mt-10 flex items-center justify-center gap-3 bg-orange-500/5 border border-orange-500/15 rounded-2xl p-5 transition-all duration-700 delay-500 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <p className="text-gray-400 text-sm">
            <span className="text-white font-bold">{t.faq.badgeBold}</span>{" "}{t.faq.badgeText}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Stats counter card ────────────────────────────────────────────────────────

function StatCard({ value, label, index, active }: { value: string; label: string; index: number; active: boolean }) {
  const isNumeric = /^\d+/.test(value);
  const num = isNumeric ? parseInt(value.replace(/\D/g, "")) : 0;
  const suffix = isNumeric ? value.replace(/^\d+/, "") : value;
  const counted = useCounter(num, active);
  return (
    <div
      className={`text-center transition-all duration-700 ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <p className="text-3xl md:text-4xl font-black text-white mb-1">
        {isNumeric ? `${counted.toLocaleString("fr-FR")}${suffix}` : value}
      </p>
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  );
}

// ─── Feature SVG icons ────────────────────────────────────────────────────────

const featureIcons = [
  // Articles de blog SEO — crayon
  <svg key="pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>,
  // Méta-descriptions & titres — balise code
  <svg key="tag" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>
  </svg>,
  // Maillage interne — réseau de noeuds
  <svg key="link" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>,
  // Analyse de mots-clés — loupe + graphe
  <svg key="chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  </svg>,
  // Publication automatique — éclair
  <svg key="auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>,
  // SEO multilingue — globe
  <svg key="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
  </svg>,
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { t, locale } = useLanguage();
  const statsSection = useInView(0.3);
  const stepsSection = useInView();
  const featuresSection = useInView();
  const testimonialsSection = useInView();
  const pricingSection = useInView();
  const ctaSection = useInView(0.3);

  function getPlanFeatures(plan: typeof plans[0]) {
    if (locale === "en") return plan.featuresEn;
    if (locale === "es") return plan.featuresEs;
    if (locale === "de") return plan.featuresDe;
    if (locale === "it") return plan.featuresIt;
    return plan.features;
  }

  function getLangLabel(limit: number) {
    if (limit >= 5) return t.pricing.allLanguages;
    return `${limit} ${limit === 1 ? t.pricing.languages : t.pricing.languagesPlural}`;
  }

  return (
    <div className="bg-black text-white min-h-screen overflow-x-hidden">

      {/* Bannière ticker */}
      <div className="fixed top-0 left-0 right-0 z-[60] overflow-hidden" style={{ background: "linear-gradient(90deg, #080808 0%, #111 40%, #0f0f0f 60%, #080808 100%)", borderBottom: "1px solid rgba(249,115,22,0.10)", height: "36px" }}>
        {/* Halos */}
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-72 h-10 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(249,115,22,0.10)" }} />
        <div className="absolute top-1/2 right-1/3 -translate-y-1/2 w-56 h-10 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(239,68,68,0.07)" }} />
        {/* Fade bords */}
        <div className="absolute inset-y-0 left-0 w-20 z-10 pointer-events-none" style={{ background: "linear-gradient(90deg, #080808, transparent)" }} />
        <div className="absolute inset-y-0 right-0 w-20 z-10 pointer-events-none" style={{ background: "linear-gradient(270deg, #080808, transparent)" }} />
        {/* Track animé — deux blocs identiques pour loop sans saut */}
        <div className="flex items-center h-full" style={{ animation: "ticker 18s linear infinite", willChange: "transform" }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center flex-shrink-0" aria-hidden={copy === 1 ? "true" : undefined}>
              {[
                "Fais exploser ton référencement SEO de façon automatique",
                "Triple ton trafic organique avec nos outils professionnels",
                "Des articles SEO publiés automatiquement sur ton site chaque jour",
                "RankPill génère du contenu optimisé pendant que tu dors",
                "Connecte WordPress, Shopify, Wix ou ton API en 2 minutes",
                "+340% de trafic organique en moyenne pour nos utilisateurs",
              ].map((msg, i) => (
                <span key={i} className="inline-flex items-center gap-3 px-7 whitespace-nowrap">
                  <span className="text-[11px] font-black tracking-widest uppercase" style={{ color: i % 3 === 0 ? "#f97316" : i % 3 === 1 ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.4)" }}>
                    {msg}
                  </span>
                  <span className="w-[3px] h-[3px] rounded-full flex-shrink-0" style={{ background: "rgba(249,115,22,0.45)" }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav className="fixed left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5 animate-fade-in" style={{ top: "36px" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight logo-glow">
              Rank<span className="text-shimmer">Pill</span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500/15 border border-orange-500/30 text-orange-400 px-2 py-0.5 rounded-full">Beta</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            {[{ href: "#comment", label: t.nav.howItWorks }, { href: "#fonctionnalites", label: t.nav.features }, { href: "#faq", label: t.nav.faq }, { href: "#tarifs", label: t.nav.pricing }].map(link => (
              <a key={link.href} href={link.href} className="hover:text-white transition-colors relative group">
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-px bg-orange-500 group-hover:w-full transition-all duration-300" />
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/login" className="relative overflow-hidden bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:scale-[1.03]">
              <span className="absolute inset-0 animate-[sweep_3s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
              <span className="relative">Se connecter</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-36 pb-28 px-6 text-center relative overflow-hidden">
        {/* Orbes animées */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="animate-orb absolute top-[-100px] left-[-150px] w-[700px] h-[700px] rounded-full bg-orange-600/8 blur-[120px]" />
          <div className="animate-orb absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] rounded-full bg-red-600/8 blur-[100px]" style={{ animationDirection: "reverse", animationDelay: "-4s" }} />
          <div className="animate-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-orange-500/5 blur-[80px]" style={{ animationDelay: "-8s" }} />
        </div>

        {/* Grille subtile */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />

        <div className="relative max-w-5xl mx-auto">
          {/* Badge */}
          <div className="animate-fade-in-up inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium px-4 py-2 rounded-full mb-8">
            <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            {t.hero.badge}
          </div>

          {/* Titre ligne 1 */}
          <h1 className="animate-fade-in-up delay-100 text-6xl md:text-8xl font-black leading-none tracking-tight mb-2" style={{ animationDelay: "100ms" }}>
            {t.hero.title1}
          </h1>

          {/* Titre ligne 2 — gradient animé */}
          <h1 className="animate-fade-in-up text-6xl md:text-8xl font-black leading-none tracking-tight mb-8"
            style={{ animationDelay: "200ms", background: "linear-gradient(90deg, #f97316, #ef4444, #fb923c, #f97316)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) 200ms both, shimmer 4s linear infinite" }}>
            {t.hero.title2}
          </h1>

          {/* Subtitle */}
          <p className="animate-fade-in-up text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed" style={{ animationDelay: "350ms" }}>
            {t.hero.subtitle}
          </p>

          {/* CTA */}
          <div className="animate-fade-in-up flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: "500ms" }}>
            <Link href="/signup" className="group relative overflow-hidden bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-10 py-4 rounded-xl text-lg transition-all shadow-2xl shadow-orange-500/30 uppercase tracking-wide hover:shadow-orange-500/50 hover:scale-[1.03]">
              <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }} />
              <span className="relative flex items-center gap-2">
                {t.hero.cta}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 group-hover:translate-x-1 transition-transform">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </span>
            </Link>
            <a href="#comment" className="group text-gray-400 hover:text-white font-medium px-8 py-4 rounded-xl transition-all border border-white/10 hover:border-white/25 hover:bg-white/[0.03] flex items-center gap-2">
              {t.hero.ctaSecondary}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 group-hover:translate-y-0.5 transition-transform">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </a>
          </div>

          <p className="animate-fade-in text-gray-600 text-sm mt-6" style={{ animationDelay: "700ms" }}>{t.hero.note}</p>

          {/* Floating decoration dots */}
          <div className="absolute top-8 right-0 w-2 h-2 bg-orange-500/40 rounded-full animate-float" style={{ animationDelay: "0s" }} />
          <div className="absolute top-32 right-16 w-1.5 h-1.5 bg-red-500/30 rounded-full animate-float" style={{ animationDelay: "1.5s" }} />
          <div className="absolute bottom-8 left-8 w-2 h-2 bg-orange-400/30 rounded-full animate-float" style={{ animationDelay: "0.8s" }} />
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6 border-y border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(249,115,22,0.04) 0%, transparent 70%)" }} />
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8" ref={statsSection.ref}>
          {t.stats.map((stat, i) => (
            <StatCard key={stat.label} value={stat.value} label={stat.label} index={i} active={statsSection.inView} />
          ))}
        </div>
      </section>

      {/* ── Comment ça marche ────────────────────────────────────────────── */}
      <section id="comment" className="py-28 px-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(249,115,22,0.05), transparent 65%)" }} />
        <div className="max-w-5xl mx-auto" ref={stepsSection.ref}>
          <div className={`text-center mb-16 transition-all duration-700 ${stepsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.howItWorks.title}</h2>
            <p className="text-gray-400 text-lg">{t.howItWorks.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10 relative">
            {/* Ligne de connexion */}
            <div className="hidden md:block absolute top-8 left-1/6 right-1/6 h-px bg-gradient-to-r from-transparent via-orange-500/20 to-transparent" />
            {t.howItWorks.steps.map((step, i) => (
              <div
                key={step.number}
                className={`relative transition-all duration-700 ${stepsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
                style={{ transitionDelay: `${i * 150}ms` }}
              >
                <div className="relative mb-6">
                  <div className="text-7xl font-black leading-none" style={{
                    background: "linear-gradient(180deg, rgba(249,115,22,0.3) 0%, transparent 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text"
                  }}>
                    {step.number}
                  </div>
                  {/* Dot indicateur */}
                  <div className="absolute top-3 left-8 w-3 h-3 bg-orange-500 rounded-full" style={{ boxShadow: "0 0 12px rgba(249,115,22,0.6)" }} />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fonctionnalités ──────────────────────────────────────────────── */}
      <section id="fonctionnalites" className="py-28 px-6 bg-white/[0.02] relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-80 h-80 pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom left, rgba(249,115,22,0.05), transparent 65%)" }} />
        <div className="max-w-5xl mx-auto" ref={featuresSection.ref}>
          <div className={`text-center mb-16 transition-all duration-700 ${featuresSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.features.title}</h2>
            <p className="text-gray-400 text-lg">{t.features.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {t.features.items.map((feature, i) => (
              <div
                key={feature.title}
                className={`relative group bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 hover:border-orange-500/30 transition-all duration-500 overflow-hidden cursor-default ${featuresSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Hover glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{ background: "radial-gradient(ellipse at top left, rgba(249,115,22,0.08), transparent 60%)" }} />
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-all duration-300"
                  style={{ background: "rgba(249,115,22,0.12)", color: "#f97316", boxShadow: "0 0 0 0 rgba(249,115,22,0)" }}
                >
                  {featureIcons[i % featureIcons.length]}
                </div>
                <h3 className="text-lg font-bold mb-2 group-hover:text-orange-400 transition-colors">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                {/* Barre bottom shimmer au hover */}
                <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden">
                  <div className="h-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-[sweep_2s_ease-in-out_infinite]"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Témoignages ──────────────────────────────────────────────────── */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.04), transparent 70%)" }} />
        <div className="max-w-5xl mx-auto" ref={testimonialsSection.ref}>
          <div className={`text-center mb-16 transition-all duration-700 ${testimonialsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.testimonials.title}</h2>
            <p className="text-gray-400 text-lg">{t.testimonials.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((testimonial, i) => (
              <div
                key={testimonial.name}
                className={`group relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 hover:border-orange-500/20 transition-all duration-500 overflow-hidden ${testimonialsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                  style={{ background: "radial-gradient(ellipse at bottom, rgba(249,115,22,0.06), transparent 60%)" }} />
                {/* Quote icon */}
                <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-orange-500/25 mb-4" >
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" fill="currentColor"/>
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" fill="currentColor"/>
                </svg>
                <p className="text-gray-300 leading-relaxed mb-6 text-sm">{testimonial.content}</p>
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                    style={{ boxShadow: "0 0 16px rgba(249,115,22,0.3)" }}>
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-bold text-sm">{testimonial.name}</p>
                    <p className="text-gray-500 text-xs">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <FaqSection />

      {/* ── Tarifs ───────────────────────────────────────────────────────── */}
      <section id="tarifs" className="py-28 px-6 bg-white/[0.02] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(249,115,22,0.05), transparent 65%)" }} />
        <div className="max-w-5xl mx-auto" ref={pricingSection.ref}>
          <div className={`text-center mb-16 transition-all duration-700 ${pricingSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.pricing.title}</h2>
            <p className="text-gray-400 text-lg">{t.pricing.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 flex flex-col overflow-hidden transition-all duration-700 ${pricingSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"} ${
                  plan.highlighted
                    ? "bg-gradient-to-b from-orange-500/20 to-red-500/10 border-2 border-orange-500/50 shadow-xl shadow-orange-500/10"
                    : "bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.15]"
                }`}
                style={{ transitionDelay: `${i * 120}ms` }}
              >
                {/* Shimmer sur le plan highlighted */}
                {plan.highlighted && (
                  <div className="absolute inset-0 pointer-events-none animate-[sweep_4s_ease-in-out_infinite]"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.08), transparent)" }} />
                )}
                {/* Glow top */}
                {plan.highlighted && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 rounded-full"
                    style={{ background: "linear-gradient(90deg, transparent, #f97316, transparent)", filter: "blur(4px)" }} />
                )}

                {plan.badge && (
                  <span className="relative overflow-hidden text-xs font-black bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full w-fit mb-4 uppercase tracking-wider">
                    <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }} />
                    <span className="relative">{plan.badge[locale as keyof typeof plan.badge] ?? plan.badge.fr}</span>
                  </span>
                )}
                <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-400 mb-6">{plan.descKey}</p>
                <div className="mb-6">
                  <span className={`text-5xl font-black ${plan.highlighted ? "text-orange-400" : "text-white"}`}>{plan.price}€</span>
                  <span className="text-sm text-gray-400 ml-1">{t.pricing.perMonth}</span>
                </div>
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-xs font-bold bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2.5 py-1 rounded-full">
                    🌍 {getLangLabel(plan.langLimit)}
                  </span>
                </div>
                <ul className="flex flex-col gap-3 mb-8 flex-1">
                  {getPlanFeatures(plan).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="w-4 h-4 rounded-full bg-orange-500/15 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 12 12" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                          <polyline points="2 6 5 9 10 3"/>
                        </svg>
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`relative overflow-hidden text-center font-black py-3 rounded-xl transition-all uppercase tracking-wide text-sm hover:scale-[1.02] ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/45"
                      : "bg-white/[0.07] hover:bg-white/[0.12] text-white"
                  }`}
                >
                  {plan.highlighted && (
                    <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />
                  )}
                  <span className="relative">{plan.cta[locale as keyof typeof plan.cta] ?? plan.cta.fr}</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Final ────────────────────────────────────────────────────── */}
      <section className="py-28 px-6 text-center relative overflow-hidden" ref={ctaSection.ref}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[400px] rounded-full animate-orb" style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.08) 0%, transparent 65%)", filter: "blur(40px)" }} />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className={`transition-all duration-700 ${ctaSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h2 className="text-5xl md:text-6xl font-black mb-6 tracking-tight leading-none">
              {t.finalCta.title1}{" "}
              {t.finalCta.highlighted && (
                <span style={{ background: "linear-gradient(90deg, #f97316, #ef4444, #fb923c, #f97316)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "shimmer 4s linear infinite" }}>
                  {t.finalCta.highlighted}
                </span>
              )}{" "}
              {t.finalCta.title2}
            </h2>
            <p className="text-gray-400 text-xl mb-10">{t.finalCta.subtitle}</p>
            <Link
              href="/signup"
              className="group relative inline-flex items-center gap-3 overflow-hidden bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-12 py-5 rounded-xl text-xl transition-all shadow-2xl shadow-orange-500/30 uppercase tracking-wide hover:shadow-orange-500/55 hover:scale-[1.04] animate-border-glow"
            >
              <span className="absolute inset-0 animate-[sweep_2s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }} />
              <span className="relative">{t.finalCta.cta}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 relative group-hover:translate-x-1 transition-transform">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>
            <p className="text-gray-600 text-sm mt-6">{t.finalCta.note}</p>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-lg font-black tracking-tight logo-glow">
            Rank<span className="text-shimmer">Pill</span>
          </span>
          <p className="text-gray-600 text-sm">{t.footer.rights}</p>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-white transition-colors">{t.footer.privacy}</a>
            <a href="#" className="hover:text-white transition-colors">{t.footer.terms}</a>
            <a href="#" className="hover:text-white transition-colors">{t.footer.contact}</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
