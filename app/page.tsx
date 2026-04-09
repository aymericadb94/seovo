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

// ─── ProofSection ─────────────────────────────────────────────────────────────

function useTypingText(text: string, active: boolean, speed = 45) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!active) { setDisplayed(""); return; }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [active, text, speed]);
  return displayed;
}

function ProofSection() {
  const { t } = useLanguage();
  const { ref, inView } = useInView(0.1);
  // Phases: 0=idle, 1=typing URL, 2=scanning pages, 3=analyzing keywords, 4=generating plan, 5=done
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!inView || phase > 0) return;
    setPhase(1);
    const timers = [
      setTimeout(() => setPhase(2), 1400),   // URL typed → scan pages
      setTimeout(() => setPhase(3), 3800),    // pages scanned → keyword analysis
      setTimeout(() => setPhase(4), 6200),    // keywords done → plan generation
      setTimeout(() => setPhase(5), 8000),    // plan done → final state
    ];
    return () => timers.forEach(clearTimeout);
  }, [inView, phase]);

  const typedUrl = useTypingText("votresite.com", phase >= 1, 70);
  const c1 = useCounter(14, phase >= 5, 1400);
  const c2 = useCounter(6, phase >= 5, 1200);
  const c3 = useCounter(3, phase >= 5, 1000);

  // Fake pages found during scan
  const scanPages = [
    { path: "/", label: "Accueil", status: "ok" },
    { path: "/produits", label: "Produits", status: "ok" },
    { path: "/blog", label: "Blog", status: "warning" },
    { path: "/a-propos", label: "À propos", status: "ok" },
    { path: "/contact", label: "Contact", status: "ok" },
    { path: "/blog/article-1", label: "Article SEO #1", status: "warning" },
    { path: "/blog/article-2", label: "Article SEO #2", status: "error" },
    { path: "/produits/cat-1", label: "Catégorie 1", status: "ok" },
  ];

  // Fake keywords discovered
  const keywords = [
    { kw: "assurance auto pas cher", vol: "12 400", pos: "—", opp: "high" },
    { kw: "comparateur assurance", vol: "8 100", pos: "14", opp: "high" },
    { kw: "meilleure assurance 2025", vol: "6 600", pos: "—", opp: "high" },
    { kw: "assurance jeune conducteur", vol: "4 400", pos: "22", opp: "medium" },
    { kw: "devis assurance en ligne", vol: "3 200", pos: "18", opp: "high" },
    { kw: "assurance tous risques", vol: "2 900", pos: "31", opp: "medium" },
  ];

  // Progress percentage
  const progress = phase === 0 ? 0 : phase === 1 ? 12 : phase === 2 ? 38 : phase === 3 ? 65 : phase === 4 ? 88 : 100;
  const statusLabels = ["", t.proof.scanRunning, t.proof.scanRunning, t.proof.scanRunning, t.proof.scanRunning, t.proof.scanDone];
  const stepLabels = [
    "",
    "Connexion au site...",
    "Scan des pages...",
    "Analyse des mots-clés...",
    "Génération du plan d'action...",
    "",
  ];

  return (
    <section id="demo" className="py-28 px-6 relative overflow-hidden">
      {/* Background halos */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px]"
          style={{ background: "radial-gradient(ellipse at top center, rgba(249,115,22,0.06), transparent 65%)" }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px]"
          style={{ background: "radial-gradient(ellipse at bottom right, rgba(239,68,68,0.04), transparent 65%)" }} />
      </div>

      <div className="max-w-4xl mx-auto" ref={ref}>

        {/* Header */}
        <div className={`text-center mb-14 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-wider uppercase"
            style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", color: "#f97316" }}>
            <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 3.5v3l2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {t.proof.badge}
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.proof.title}</h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">{t.proof.subtitle}</p>
        </div>

        {/* Main analysis panel */}
        <div className={`relative rounded-2xl overflow-hidden transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          style={{ transitionDelay: "200ms", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 0 80px rgba(249,115,22,0.06), 0 24px 60px rgba(0,0,0,0.4)" }}>

          {/* Glow interne orange */}
          <div className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{ background: "radial-gradient(ellipse at top center, rgba(249,115,22,0.05) 0%, transparent 55%)" }} />

          {/* Window chrome */}
          <div className="relative flex items-center justify-between px-5 py-3.5"
            style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: "rgba(239,68,68,0.55)" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "rgba(234,179,8,0.55)" }} />
                <div className="w-3 h-3 rounded-full transition-colors duration-700" style={{ background: phase >= 5 ? "rgba(34,197,94,0.8)" : "rgba(34,197,94,0.25)" }} />
              </div>
              <span className="text-gray-500 text-xs font-mono">rankpill.fr — analyse SEO</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${phase >= 5 ? "bg-green-400" : phase >= 1 ? "bg-orange-400 animate-pulse" : "bg-gray-600"}`} />
              <span className={`text-xs font-bold transition-colors duration-500 ${phase >= 5 ? "text-green-400" : phase >= 1 ? "text-orange-400" : "text-gray-600"}`}>
                {statusLabels[phase]}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-[2px] overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="h-full rounded-full transition-all ease-out"
              style={{
                width: `${progress}%`,
                transitionDuration: phase <= 1 ? "600ms" : "1800ms",
                background: phase >= 5 ? "linear-gradient(90deg, #22c55e, #4ade80)" : "linear-gradient(90deg, #f97316, #ef4444, #fb923c)",
              }} />
          </div>

          <div className="p-6 md:p-8">

            {/* ── Phase 1: URL typing ── */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-gray-500 flex-shrink-0">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M8 1.5C8 1.5 5.5 4.5 5.5 8s2.5 6.5 2.5 6.5M8 1.5C8 1.5 10.5 4.5 10.5 8S8 14.5 8 14.5M1.5 8h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span className="text-gray-400 text-xs font-mono">
                  {typedUrl}
                  {phase === 1 && <span className="animate-pulse text-orange-400">|</span>}
                </span>
              </div>
              {phase >= 5 && (
                <div className="flex items-center gap-1.5 animate-[fadeSlideIn_0.4s_ease-out]">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
                    <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5">
                      <path d="M1.5 4l2 2L6.5 2" stroke="#4ade80" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-green-400 text-xs font-bold">{t.proof.scanDone}</span>
                </div>
              )}
              {phase >= 1 && phase < 5 && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1 h-1 rounded-full bg-orange-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }} />
                    ))}
                  </div>
                  <span className="text-gray-500 text-[10px] font-mono">{stepLabels[phase]}</span>
                </div>
              )}
            </div>

            {/* ── Phase 2: Page scan — live crawl feed ── */}
            <div className={`mb-6 transition-all duration-500 ${phase >= 2 ? "opacity-100 max-h-[220px]" : "opacity-0 max-h-0"} overflow-hidden`}>
              <div className="flex items-center gap-2 mb-3">
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-orange-400">
                  <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M1 5h14M5 5v10" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">Pages détectées</span>
                <span className="text-gray-600 text-[10px] font-mono ml-auto">{phase >= 3 ? scanPages.length : phase >= 2 ? Math.min(Math.floor((phase - 1.5) * 10), scanPages.length) : 0} pages</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                {scanPages.map((page, i) => {
                  const visible = phase >= 2;
                  const delay = 200 + i * 180;
                  return (
                    <div key={i}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-400 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
                      style={{
                        transitionDelay: `${delay}ms`,
                        background: "rgba(255,255,255,0.025)",
                        border: `1px solid ${page.status === "error" ? "rgba(239,68,68,0.2)" : page.status === "warning" ? "rgba(234,179,8,0.15)" : "rgba(255,255,255,0.06)"}`,
                      }}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${page.status === "error" ? "bg-red-400" : page.status === "warning" ? "bg-yellow-400" : "bg-green-400"}`} />
                      <div className="min-w-0">
                        <p className="text-white text-[11px] font-medium truncate">{page.label}</p>
                        <p className="text-gray-600 text-[9px] font-mono truncate">{page.path}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Phase 3: Keyword analysis — keywords table ── */}
            <div className={`mb-6 transition-all duration-500 ${phase >= 3 ? "opacity-100 max-h-[300px]" : "opacity-0 max-h-0"} overflow-hidden`}>
              <div className="flex items-center gap-2 mb-3">
                <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-orange-400">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M10 10l4.5 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-400">Opportunités SEO identifiées</span>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_60px_70px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-bold"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  <span>Mot-clé</span>
                  <span className="text-right">Volume</span>
                  <span className="text-right">Position</span>
                  <span className="text-right">Potentiel</span>
                </div>
                {keywords.map((kw, i) => {
                  const delay = 300 + i * 200;
                  return (
                    <div key={i}
                      className={`grid grid-cols-[1fr_80px_60px_70px] gap-2 px-3 py-2.5 transition-all duration-400 ${phase >= 3 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3"}`}
                      style={{
                        transitionDelay: `${delay}ms`,
                        background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                        borderTop: "1px solid rgba(255,255,255,0.04)",
                      }}>
                      <span className="text-white text-xs font-medium truncate">{kw.kw}</span>
                      <span className="text-gray-400 text-xs text-right font-mono">{kw.vol}</span>
                      <span className={`text-xs text-right font-bold ${kw.pos === "—" ? "text-gray-600" : "text-orange-400"}`}>{kw.pos}</span>
                      <div className="flex justify-end">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kw.opp === "high" ? "bg-green-400/10 text-green-400 border border-green-400/20" : "bg-yellow-400/10 text-yellow-400 border border-yellow-400/20"}`}>
                          {kw.opp === "high" ? "Fort" : "Moyen"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Phase 4+5: Metrics + Plan ── */}
            <div className={`transition-all duration-500 ${phase >= 4 ? "opacity-100 max-h-[600px]" : "opacity-0 max-h-0"} overflow-hidden`}>

              {/* Divider */}
              <div className="mb-5" style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

              {/* Metrics grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                <div className={`relative rounded-xl p-4 transition-all duration-700 overflow-hidden ${phase >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                  style={{ transitionDelay: "0ms", background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.15)" }}>
                  <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at top right, rgba(249,115,22,0.12), transparent 70%)" }} />
                  <p className="text-3xl font-black text-white mb-0.5 relative">{phase >= 5 ? c1 : "—"}</p>
                  <p className="text-orange-400 text-xs font-bold leading-tight relative">{t.proof.metrics[0].label}</p>
                  <p className="text-gray-600 text-[10px] mt-0.5 relative">{t.proof.metrics[0].sub}</p>
                </div>

                <div className={`relative rounded-xl p-4 transition-all duration-700 overflow-hidden ${phase >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                  style={{ transitionDelay: "100ms", background: "rgba(249,115,22,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-3xl font-black text-white mb-0.5">{phase >= 5 ? c2 : "—"}</p>
                  <p className="text-gray-300 text-xs font-bold leading-tight">{t.proof.metrics[1].label}</p>
                  <p className="text-gray-600 text-[10px] mt-0.5">{t.proof.metrics[1].sub}</p>
                </div>

                <div className={`relative rounded-xl p-4 transition-all duration-700 overflow-hidden ${phase >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                  style={{ transitionDelay: "200ms", background: "rgba(249,115,22,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-3xl font-black text-white mb-0.5">{phase >= 5 ? c3 : "—"}</p>
                  <p className="text-gray-300 text-xs font-bold leading-tight">{t.proof.metrics[2].label}</p>
                  <p className="text-gray-600 text-[10px] mt-0.5">{t.proof.metrics[2].sub}</p>
                </div>

                <div className={`relative rounded-xl p-4 transition-all duration-700 overflow-hidden ${phase >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                  style={{ transitionDelay: "300ms", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)" }}>
                  <div className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at top right, rgba(34,197,94,0.12), transparent 70%)" }} />
                  <p className="text-xl font-black text-green-400 mb-0.5 leading-tight relative">{phase >= 5 ? t.proof.metrics[3].value : "—"}</p>
                  <p className="text-green-400/80 text-xs font-bold leading-tight relative">{t.proof.metrics[3].label}</p>
                  <p className="text-gray-600 text-[10px] mt-0.5 relative">{t.proof.metrics[3].sub}</p>
                </div>
              </div>

              {/* Plan header */}
              <div className={`flex items-center gap-2 mb-4 transition-all duration-500 ${phase >= 5 ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDelay: "400ms" }}>
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-orange-400 flex-shrink-0">
                  <path d="M13 3L6 10.5 3 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: "#f97316" }}>{t.proof.planTitle}</p>
              </div>

              {/* Actions grid */}
              <div className="grid md:grid-cols-2 gap-2.5 mb-6">
                {t.proof.actions.map((action, i) => (
                  <div key={i}
                    className={`flex items-start gap-3 p-3.5 rounded-xl transition-all duration-500 ${phase >= 5 ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3"}`}
                    style={{ transitionDelay: `${450 + i * 100}ms`, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-sm"
                      style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(239,68,68,0.1))", color: "#f97316", border: "1px solid rgba(249,115,22,0.25)" }}>
                      {action.n}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm leading-tight">{action.label}</p>
                      <p className="text-gray-500 text-xs leading-snug mt-0.5 truncate">{action.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Interpretation */}
              <div className={`rounded-xl p-4 transition-all duration-500 ${phase >= 5 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
                style={{ transitionDelay: "900ms", background: "rgba(249,115,22,0.05)", border: "1px solid rgba(249,115,22,0.15)" }}>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(249,115,22,0.15)", border: "1px solid rgba(249,115,22,0.3)" }}>
                    <svg viewBox="0 0 10 10" fill="none" className="w-3 h-3">
                      <path d="M5 1v4M5 7.5v1" stroke="#f97316" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{t.proof.interpretation}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className={`text-center mt-10 transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
          style={{ transitionDelay: "400ms" }}>
          <a href="/signup"
            className="group relative inline-flex items-center gap-2.5 overflow-hidden bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-9 py-4 rounded-xl text-sm uppercase tracking-wide transition-all shadow-2xl shadow-orange-500/25 hover:shadow-orange-500/45 hover:scale-[1.03]">
            <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 relative">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span className="relative">{t.proof.cta}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="w-4 h-4 relative group-hover:translate-x-1 transition-transform">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </a>
          <p className="text-gray-600 text-xs mt-3">{t.proof.ctaNote}</p>
        </div>

      </div>

      {/* Keyframe for fadeSlideIn */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </section>
  );
}

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
                "RankPill lit vos données GSC et agit — pas un générateur d'articles",
                "Positions 5–20 détectées automatiquement · Contenu publié · Trafic capté",
                "Connecte WordPress, Shopify, Wix ou ton API en 3 minutes",
                "RankPill comprend votre SEO avant d'écrire le premier mot",
                "Analyse réelle · Opportunités priorisées · Publication automatique",
                "Sans rédacteur · Sans agence · Sans effort · Avec de vraies données",
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

        <div className="relative max-w-4xl mx-auto">
          {/* Badge */}
          <div className="animate-fade-in-up inline-flex items-center gap-2 bg-white/[0.04] border border-white/10 text-gray-400 text-xs font-semibold px-4 py-2 rounded-full mb-10 tracking-wide uppercase">
            <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse flex-shrink-0" />
            {t.hero.badge}
          </div>

          {/* Headline */}
          <h1 className="animate-fade-in-up text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-3" style={{ animationDelay: "100ms" }}>
            {t.hero.title1}
          </h1>
          <h1 className="animate-fade-in-up text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-8"
            style={{ animationDelay: "200ms", background: "linear-gradient(90deg, #f97316, #ef4444, #fb923c, #f97316)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "fadeInUp 0.5s cubic-bezier(0.16,1,0.3,1) 200ms both, shimmer 4s linear infinite" }}>
            {t.hero.title2}
          </h1>

          {/* Subtitle */}
          <p className="animate-fade-in-up text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed" style={{ animationDelay: "300ms" }}>
            {t.hero.subtitle}
          </p>

          {/* Bullets */}
          <ul className="animate-fade-in-up flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mb-12" style={{ animationDelay: "420ms" }}>
            {t.hero.bullets.map((bullet, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(239,68,68,0.1))", border: "1px solid rgba(249,115,22,0.35)" }}>
                  <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5 text-orange-400">
                    <path d="M2 5.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {/* CTAs */}
          <div className="animate-fade-in-up flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: "550ms" }}>
            <Link href="/signup" className="group relative overflow-hidden bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-9 py-4 rounded-xl text-base transition-all shadow-2xl shadow-orange-500/30 uppercase tracking-wide hover:shadow-orange-500/50 hover:scale-[1.03]">
              <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)" }} />
              <span className="relative flex items-center gap-2">
                {t.hero.cta}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 group-hover:translate-x-1 transition-transform">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </span>
            </Link>
            <a href="#comment" className="group text-gray-400 hover:text-white font-medium px-7 py-4 rounded-xl transition-all border border-white/10 hover:border-white/25 hover:bg-white/[0.03] flex items-center gap-2 text-sm">
              {t.hero.ctaSecondary}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 group-hover:translate-y-0.5 transition-transform">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </a>
          </div>

          {/* Micro preuve */}
          <p className="animate-fade-in text-gray-600 text-xs mt-6 tracking-wide" style={{ animationDelay: "700ms" }}>{t.hero.note}</p>

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
        <div className="absolute top-0 right-0 w-[500px] h-[500px] pointer-events-none" style={{ background: "radial-gradient(ellipse at top right, rgba(249,115,22,0.05), transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] pointer-events-none" style={{ background: "radial-gradient(ellipse at bottom left, rgba(239,68,68,0.04), transparent 65%)" }} />

        <div className="max-w-5xl mx-auto" ref={stepsSection.ref}>
          <div className={`text-center mb-20 transition-all duration-700 ${stepsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            {/* Badge intro */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6 text-xs font-bold tracking-wider uppercase"
              style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.2)", color: "#f97316" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Fonctionnement
            </div>
            <h2 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">{t.howItWorks.title}</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">{t.howItWorks.subtitle}</p>
          </div>

          {/* Desktop : flex avec connecteurs inline */}
          <div className="hidden md:flex items-start">
            {t.howItWorks.steps.map((step, i) => (
              <>
                {/* Colonne step */}
                <div
                  key={step.number}
                  className={`flex-1 flex flex-col items-center transition-all duration-700 ${stepsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
                  style={{ transitionDelay: `${i * 200}ms` }}
                >
                  {/* Badge */}
                  <div className="relative w-20 h-20 mb-8 flex-shrink-0">
                    <div className="absolute inset-0 rounded-full blur-xl" style={{ background: "rgba(249,115,22,0.2)" }} />
                    <div className="absolute inset-[-8px] rounded-full border border-dashed animate-[spin_12s_linear_infinite]" style={{ borderColor: "rgba(249,115,22,0.35)" }} />
                    <div className="relative w-full h-full rounded-full flex items-center justify-center"
                      style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(239,68,68,0.08))", border: "1.5px solid rgba(249,115,22,0.5)", boxShadow: "0 0 24px rgba(249,115,22,0.15), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                      <span className="text-2xl font-black text-white tracking-tight">{step.number}</span>
                    </div>
                  </div>

                  {/* Carte */}
                  <div className="relative w-full rounded-2xl p-6 group overflow-hidden text-left"
                    style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: "radial-gradient(ellipse at top center, rgba(249,115,22,0.08), transparent 65%)" }} />
                    <div className="absolute bottom-0 left-6 right-6 h-px overflow-hidden">
                      <div className="h-full w-0 group-hover:w-full transition-all duration-500"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.5), transparent)" }} />
                    </div>
                    <h3 className="text-base font-black mb-2 transition-colors duration-300 group-hover:text-orange-400">{step.title}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                    {step.bullets.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {step.bullets.map((bullet, bi) => (
                          <li key={bi} className="flex items-start gap-2.5 text-xs text-gray-400">
                            <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)" }}>
                              <svg viewBox="0 0 8 8" fill="none" className="w-2.5 h-2.5 text-orange-400">
                                <path d="M1.5 4l2 2L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Connecteur */}
                {i < t.howItWorks.steps.length - 1 && (
                  <div className="flex-shrink-0 w-16 overflow-hidden" style={{ marginTop: "39px", height: "2px" }}>
                    <div className="h-full transition-all duration-700 rounded-full"
                      style={{ background: "linear-gradient(90deg, rgba(249,115,22,0.7), rgba(249,115,22,0.3))", width: stepsSection.inView ? "100%" : "0%", transitionDelay: `${i * 200 + 400}ms` }} />
                  </div>
                )}
              </>
            ))}
          </div>

          {/* Mobile : vertical */}
          <div className="md:hidden flex flex-col gap-8">
            {t.howItWorks.steps.map((step, i) => (
              <div key={step.number}
                className={`flex gap-5 transition-all duration-700 ${stepsSection.inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
                style={{ transitionDelay: `${i * 150}ms` }}>
                <div className="relative w-14 h-14 flex-shrink-0">
                  <div className="absolute inset-0 rounded-full blur-lg" style={{ background: "rgba(249,115,22,0.2)" }} />
                  <div className="relative w-full h-full rounded-full flex items-center justify-center"
                    style={{ background: "rgba(249,115,22,0.1)", border: "1.5px solid rgba(249,115,22,0.45)" }}>
                    <span className="text-lg font-black text-white">{step.number}</span>
                  </div>
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="text-base font-black mb-1">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                  {step.bullets.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5">
                      {step.bullets.map((bullet, bi) => (
                        <li key={bi} className="flex items-start gap-2 text-xs text-gray-500">
                          <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.2)" }}>
                            <svg viewBox="0 0 8 8" fill="none" className="w-2 h-2 text-orange-400">
                              <path d="M1.5 4l2 2L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Preuve produit / simulation ──────────────────────────────────── */}
      <ProofSection />

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
          <div className="flex flex-wrap gap-5 text-sm text-gray-500">
            <a href="/mentions-legales" className="hover:text-white transition-colors">Mentions légales</a>
            <a href="/cgu" className="hover:text-white transition-colors">CGU</a>
            <a href="/cgv" className="hover:text-white transition-colors">CGV</a>
            <a href="/confidentialite" className="hover:text-white transition-colors">Confidentialité</a>
            <a href="mailto:contact@rankpill.fr" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
