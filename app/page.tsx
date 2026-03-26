"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LOCALES, localeFlags, localeNames, type Locale } from "@/lib/i18n/translations";
import { useState } from "react";

const testimonials = [
  { name: "Sophie M.", role: "Fondatrice, Boutique Léonie", content: "En 3 mois, mon trafic organique a augmenté de 340%. Je n'ai rien eu à faire — SEOVO s'est occupé de tout.", avatar: "S" },
  { name: "Thomas R.", role: "Directeur Marketing, TechFlow", content: "On économise 15h par semaine sur la création de contenu. Le ROI est évident dès le premier mois.", avatar: "T" },
  { name: "Camille D.", role: "CEO, Studio Créatif", content: "La qualité des articles générés est bluffante. Nos clients pensent qu'on a une équipe de rédacteurs SEO.", avatar: "C" },
];

function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-all"
      >
        <span>{localeFlags[locale]}</span>
        <span className="hidden sm:inline">{localeNames[locale]}</span>
        <span className="text-xs opacity-50">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-xl z-50 min-w-[140px]">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              onClick={() => { setLocale(l); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                l === locale ? "bg-orange-500/10 text-orange-400" : "text-gray-300 hover:bg-white/5"
              }`}
            >
              <span>{localeFlags[l]}</span>
              <span>{localeNames[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const plans = [
  {
    name: "Starter",
    price: "49",
    descKey: "Pour les indépendants et petites boutiques",
    features: ["1 site connecté", "1 article / jour", "10 mots-clés max", "WordPress ou Shopify", "Dashboard basique", "Support email"],
    featuresEn: ["1 connected site", "1 article / day", "10 keywords max", "WordPress or Shopify", "Basic dashboard", "Email support"],
    featuresEs: ["1 sitio conectado", "1 artículo / día", "10 palabras clave máx.", "WordPress o Shopify", "Dashboard básico", "Soporte por email"],
    featuresDe: ["1 Website verbunden", "1 Artikel / Tag", "Maximal 10 Keywords", "WordPress oder Shopify", "Basis-Dashboard", "E-Mail-Support"],
    featuresIt: ["1 sito connesso", "1 articolo / giorno", "10 parole chiave max", "WordPress o Shopify", "Dashboard base", "Supporto email"],
    cta: { fr: "Démarrer en Beta", en: "Start in Beta", es: "Empezar en Beta", de: "Beta starten", it: "Inizia in Beta" },
    highlighted: false,
    badge: null,
    langLimit: 1,
  },
  {
    name: "Premium",
    price: "149",
    descKey: "Pour les PME et e-commerçants actifs",
    features: ["5 sites connectés", "2 articles / jour par site", "30 mots-clés max", "WordPress + Shopify", "Découverte IA des mots-clés", "Dashboard complet", "Support prioritaire"],
    featuresEn: ["5 connected sites", "2 articles / day per site", "30 keywords max", "WordPress + Shopify", "AI keyword discovery", "Full dashboard", "Priority support"],
    featuresEs: ["5 sitios conectados", "2 artículos / día por sitio", "30 palabras clave máx.", "WordPress + Shopify", "Descubrimiento IA de palabras clave", "Dashboard completo", "Soporte prioritario"],
    featuresDe: ["5 Websites verbunden", "2 Artikel / Tag pro Website", "Maximal 30 Keywords", "WordPress + Shopify", "KI-Keyword-Entdeckung", "Volles Dashboard", "Prioritäts-Support"],
    featuresIt: ["5 siti connessi", "2 articoli / giorno per sito", "30 parole chiave max", "WordPress + Shopify", "Scoperta IA delle parole chiave", "Dashboard completo", "Supporto prioritario"],
    cta: { fr: "Démarrer en Beta", en: "Start in Beta", es: "Empezar en Beta", de: "Beta starten", it: "Inizia in Beta" },
    highlighted: true,
    badge: { fr: "Le plus populaire", en: "Most popular", es: "El más popular", de: "Beliebteste", it: "Il più popolare" },
    langLimit: 3,
  },
  {
    name: "Elite",
    price: "399",
    descKey: "Pour les agences et grands comptes",
    features: ["20 sites connectés", "5 articles / jour par site", "Mots-clés illimités", "WordPress + Shopify", "Découverte IA avancée", "Dashboard complet + analytics", "Account manager dédié"],
    featuresEn: ["20 connected sites", "5 articles / day per site", "Unlimited keywords", "WordPress + Shopify", "Advanced AI discovery", "Full dashboard + analytics", "Dedicated account manager"],
    featuresEs: ["20 sitios conectados", "5 artículos / día por sitio", "Palabras clave ilimitadas", "WordPress + Shopify", "Descubrimiento IA avanzado", "Dashboard completo + analíticas", "Account manager dedicado"],
    featuresDe: ["20 Websites verbunden", "5 Artikel / Tag pro Website", "Unbegrenzte Keywords", "WordPress + Shopify", "Erweiterte KI-Entdeckung", "Volles Dashboard + Analytics", "Dedizierter Account Manager"],
    featuresIt: ["20 siti connessi", "5 articoli / giorno per sito", "Parole chiave illimitate", "WordPress + Shopify", "Scoperta IA avanzata", "Dashboard completo + analytics", "Account manager dedicato"],
    cta: { fr: "Nous contacter", en: "Contact us", es: "Contáctanos", de: "Kontakt aufnehmen", it: "Contattaci" },
    highlighted: false,
    badge: null,
    langLimit: 5,
  },
];

function FaqSection() {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-28 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.faq.title}</h2>
          <p className="text-gray-400 text-lg">{t.faq.subtitle}</p>
        </div>

        <div className="flex flex-col gap-3">
          {t.faq.items.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
                  isOpen
                    ? "bg-white/[0.04] border-orange-500/30"
                    : "bg-white/[0.02] border-white/[0.07] hover:border-white/[0.15]"
                }`}
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left gap-4"
                >
                  <span className={`font-bold text-sm md:text-base transition-colors ${isOpen ? "text-white" : "text-gray-300"}`}>
                    {item.q}
                  </span>
                  <span className={`text-xl flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-45 text-orange-400" : "text-gray-600"}`}>
                    +
                  </span>
                </button>
                {isOpen && (
                  <div className="px-6 pb-5">
                    <p className="text-gray-400 text-sm leading-relaxed border-t border-white/[0.06] pt-4">
                      {item.a}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Reassurance badge */}
        <div className="mt-10 flex items-center justify-center gap-3 bg-orange-500/5 border border-orange-500/15 rounded-2xl p-5">
          <span className="text-2xl">🔒</span>
          <p className="text-gray-400 text-sm">
            <span className="text-white font-bold">Vos identifiants restent sous votre contrôle total.</span>{" "}
            Révoquez l&apos;accès à tout moment depuis votre WordPress. Aucune donnée partagée avec des tiers.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { t, locale } = useLanguage();

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
    <div className="bg-black text-white min-h-screen">

      {/* Bannière Beta */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-orange-500/90 to-red-500/90 backdrop-blur-sm text-white text-xs font-bold text-center py-2 px-4 tracking-wide">
        {t.beta.banner} · <Link href="/signup" className="underline underline-offset-2 hover:text-orange-100 transition-colors">{t.beta.join}</Link>
      </div>

      {/* Navigation */}
      <nav className="fixed top-8 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight">
              SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest bg-orange-500/15 border border-orange-500/30 text-orange-400 px-2 py-0.5 rounded-full">Beta</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#comment" className="hover:text-white transition-colors">{t.nav.howItWorks}</a>
            <a href="#fonctionnalites" className="hover:text-white transition-colors">{t.nav.features}</a>
            <a href="#tarifs" className="hover:text-white transition-colors">{t.nav.pricing}</a>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/signup"
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-orange-500/20"
            >
              {t.nav.cta}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-28 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[700px] h-[700px] bg-orange-600/10 rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
          <div className="w-[500px] h-[300px] bg-red-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-sm font-medium px-4 py-2 rounded-full mb-8">
            <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
            {t.hero.badge}
          </div>
          <h1 className="text-6xl md:text-8xl font-black leading-none tracking-tight mb-6">
            {t.hero.title1}{" "}
            <br />
            <span className="bg-gradient-to-r from-orange-400 via-red-400 to-red-500 bg-clip-text text-transparent">
              {t.hero.title2}
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t.hero.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black px-10 py-4 rounded-xl text-lg transition-all shadow-xl shadow-orange-500/25 uppercase tracking-wide"
            >
              {t.hero.cta}
            </Link>
            <a
              href="#comment"
              className="text-gray-400 hover:text-white font-medium px-8 py-4 rounded-xl transition-colors border border-white/10 hover:border-white/20"
            >
              {t.hero.ctaSecondary}
            </a>
          </div>
          <p className="text-gray-600 text-sm mt-6">{t.hero.note}</p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-6 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {t.stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl md:text-4xl font-black text-white mb-1">{stat.value}</p>
              <p className="text-gray-500 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment" className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.howItWorks.title}</h2>
            <p className="text-gray-400 text-lg">{t.howItWorks.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {t.howItWorks.steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-7xl font-black bg-gradient-to-b from-white/10 to-transparent bg-clip-text text-transparent mb-4 leading-none">
                  {step.number}
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-gray-400 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="py-28 px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.features.title}</h2>
            <p className="text-gray-400 text-lg">{t.features.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {t.features.items.map((feature) => (
              <div
                key={feature.title}
                className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 hover:border-orange-500/30 hover:bg-orange-500/5 transition-all group"
              >
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold mb-2 group-hover:text-orange-400 transition-colors">{feature.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Témoignages */}
      <section className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.testimonials.title}</h2>
            <p className="text-gray-400 text-lg">{t.testimonials.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((testimonial) => (
              <div key={testimonial.name} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
                <p className="text-gray-300 leading-relaxed mb-6">&ldquo;{testimonial.content}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-full flex items-center justify-center font-bold text-sm">
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

      {/* FAQ */}
      <FaqSection />

      {/* Tarifs */}
      <section id="tarifs" className="py-28 px-6 bg-white/[0.02]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.pricing.title}</h2>
            <p className="text-gray-400 text-lg">{t.pricing.subtitle}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 flex flex-col ${
                  plan.highlighted
                    ? "bg-gradient-to-b from-orange-500/20 to-red-500/10 border-2 border-orange-500/50 shadow-xl shadow-orange-500/10"
                    : "bg-white/[0.03] border border-white/[0.07]"
                }`}
              >
                {plan.badge && (
                  <span className="text-xs font-black bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full w-fit mb-4 uppercase tracking-wider">
                    {plan.badge[locale as keyof typeof plan.badge] ?? plan.badge.fr}
                  </span>
                )}
                <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                <p className="text-sm text-gray-400 mb-6">{plan.descKey}</p>
                <div className="mb-6">
                  <span className={`text-5xl font-black ${plan.highlighted ? "text-orange-400" : "text-white"}`}>
                    {plan.price}€
                  </span>
                  <span className="text-sm text-gray-400 ml-1">{t.pricing.perMonth}</span>
                </div>
                {/* Langue badge */}
                <div className="mb-4 flex items-center gap-2">
                  <span className="text-xs font-bold bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2.5 py-1 rounded-full">
                    🌍 {getLangLabel(plan.langLimit)}
                  </span>
                </div>
                <ul className="flex flex-col gap-3 mb-8 flex-1">
                  {getPlanFeatures(plan).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                      <span className="text-orange-400 font-bold">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`text-center font-black py-3 rounded-xl transition-all uppercase tracking-wide text-sm ${
                    plan.highlighted
                      ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/20"
                      : "bg-white/[0.07] hover:bg-white/[0.12] text-white"
                  }`}
                >
                  {plan.cta[locale as keyof typeof plan.cta] ?? plan.cta.fr}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-28 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[600px] h-[400px] bg-orange-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <h2 className="text-5xl md:text-6xl font-black mb-6 tracking-tight leading-none">
            {t.finalCta.title1}{" "}
            {t.finalCta.highlighted && (
              <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                {t.finalCta.highlighted}
              </span>
            )}{" "}
            {t.finalCta.title2}
          </h2>
          <p className="text-gray-400 text-xl mb-10">{t.finalCta.subtitle}</p>
          <Link
            href="/signup"
            className="inline-block bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black px-12 py-5 rounded-xl text-xl transition-all shadow-2xl shadow-orange-500/30 uppercase tracking-wide"
          >
            {t.finalCta.cta}
          </Link>
          <p className="text-gray-600 text-sm mt-5">{t.finalCta.note}</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-lg font-black tracking-tight">
            SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
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
