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
    features: ["1 site connecté", "1 article / jour", "10 mots-clés max", "Wix (Shopify, WP bientôt)", "Dashboard basique", "Support email"],
    featuresEn: ["1 connected site", "1 article / day", "10 keywords max", "Wix (Shopify, WP coming soon)", "Basic dashboard", "Email support"],
    featuresEs: ["1 sitio conectado", "1 artículo / día", "10 palabras clave máx.", "Wix (Shopify, WP pronto)", "Dashboard básico", "Soporte por email"],
    featuresDe: ["1 Website verbunden", "1 Artikel / Tag", "Maximal 10 Keywords", "Wix (Shopify, WP bald)", "Basis-Dashboard", "E-Mail-Support"],
    featuresIt: ["1 sito connesso", "1 articolo / giorno", "10 parole chiave max", "Wix (Shopify, WP pronto)", "Dashboard base", "Supporto email"],
    cta: { fr: "Démarrer en Beta", en: "Start in Beta", es: "Empezar en Beta", de: "Beta starten", it: "Inizia in Beta" },
    highlighted: false, badge: null, langLimit: 1,
  },
  {
    name: "Premium", price: "149", descKey: "Pour les PME et e-commerçants actifs",
    features: ["5 sites connectés", "2 articles / jour par site", "30 mots-clés max", "Wix (Shopify, WP bientôt)", "Analyse automatique des mots-clés", "Dashboard complet", "Support prioritaire"],
    featuresEn: ["5 connected sites", "2 articles / day per site", "30 keywords max", "Wix (Shopify, WP coming soon)", "Automated keyword analysis", "Full dashboard", "Priority support"],
    featuresEs: ["5 sitios conectados", "2 artículos / día por sitio", "30 palabras clave máx.", "Wix (Shopify, WP pronto)", "Análisis automático de palabras clave", "Dashboard completo", "Soporte prioritario"],
    featuresDe: ["5 Websites verbunden", "2 Artikel / Tag pro Website", "Maximal 30 Keywords", "Wix (Shopify, WP bald)", "Automatische Keyword-Analyse", "Volles Dashboard", "Prioritäts-Support"],
    featuresIt: ["5 siti connessi", "2 articoli / giorno per sito", "30 parole chiave max", "Wix (Shopify, WP pronto)", "Analisi automatica delle parole chiave", "Dashboard completo", "Supporto prioritario"],
    cta: { fr: "Démarrer en Beta", en: "Start in Beta", es: "Empezar en Beta", de: "Beta starten", it: "Inizia in Beta" },
    highlighted: true, badge: { fr: "Le plus populaire", en: "Most popular", es: "El más popular", de: "Beliebteste", it: "Il più popolare" }, langLimit: 3,
  },
  {
    name: "Elite", price: "399", descKey: "Pour les agences et grands comptes",
    features: ["20 sites connectés", "5 articles / jour par site", "Mots-clés illimités", "Wix (Shopify, WP bientôt)", "Analyse avancée des mots-clés", "Dashboard complet + analytics", "Account manager dédié"],
    featuresEn: ["20 connected sites", "5 articles / day per site", "Unlimited keywords", "Wix (Shopify, WP coming soon)", "Advanced keyword analysis", "Full dashboard + analytics", "Dedicated account manager"],
    featuresEs: ["20 sitios conectados", "5 artículos / día por sitio", "Palabras clave ilimitadas", "Wix (Shopify, WP pronto)", "Análisis avanzado de palabras clave", "Dashboard completo + analíticas", "Account manager dedicado"],
    featuresDe: ["20 Websites verbunden", "5 Artikel / Tag pro Website", "Unbegrenzte Keywords", "Wix (Shopify, WP bald)", "Erweiterte Keyword-Analyse", "Volles Dashboard + Analytics", "Dedizierter Account Manager"],
    featuresIt: ["20 siti connessi", "5 articoli / giorno per sito", "Parole chiave illimitate", "Wix (Shopify, WP pronto)", "Analisi avanzata delle parole chiave", "Dashboard completo + analytics", "Account manager dedicato"],
    cta: { fr: "Nous contacter", en: "Contact us", es: "Contáctanos", de: "Kontakt aufnehmen", it: "Contattaci" },
    highlighted: false, badge: null, langLimit: 5,
  },
];

// ─── ProofSection ─────────────────────────────────────────────────────────────

function ProofSection() {
  const { t } = useLanguage();
  const { ref, inView } = useInView(0.08);
  const [tick, setTick] = useState(0); // increments every 120ms for granular animation

  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    const id = setInterval(() => {
      frame++;
      setTick(frame);
      if (frame >= 120) clearInterval(id); // ~14.4s total
    }, 120);
    return () => clearInterval(id);
  }, [inView]);

  // Derived phases from tick
  const phase = tick === 0 ? 0 : tick < 12 ? 1 : tick < 30 ? 2 : tick < 55 ? 3 : tick < 75 ? 4 : 5;
  const done = phase >= 5;

  // Terminal log lines — appear one by one
  const logLines = [
    { t: 1, icon: "→", color: "#f97316", text: "Connexion à votresite.com..." },
    { t: 5, icon: "✓", color: "#4ade80", text: "SSL valide · Temps de réponse 124ms" },
    { t: 8, icon: "→", color: "#f97316", text: "Crawl du sitemap..." },
    { t: 13, icon: "✓", color: "#4ade80", text: "47 pages détectées" },
    { t: 16, icon: "→", color: "#f97316", text: "Analyse des balises title & meta..." },
    { t: 20, icon: "!", color: "#facc15", text: "12 pages sans meta description" },
    { t: 23, icon: "→", color: "#f97316", text: "Extraction des mots-clés positionnés..." },
    { t: 28, icon: "✓", color: "#4ade80", text: "87 mots-clés trouvés (14 en zone de frappe)" },
    { t: 32, icon: "→", color: "#f97316", text: "Analyse SERP concurrentielle..." },
    { t: 37, icon: "!", color: "#facc15", text: "3 requêtes sans page dédiée — fort volume" },
    { t: 40, icon: "→", color: "#f97316", text: "Scoring des opportunités..." },
    { t: 45, icon: "✓", color: "#4ade80", text: "6 pages à fort potentiel identifiées" },
    { t: 50, icon: "→", color: "#f97316", text: "Calcul du trafic estimé..." },
    { t: 55, icon: "✓", color: "#4ade80", text: "+480 à +1 200 clics/mois récupérables" },
    { t: 60, icon: "→", color: "#f97316", text: "Génération du plan d'action..." },
    { t: 68, icon: "★", color: "#f97316", text: "Analyse terminée — 16 actions recommandées" },
  ];
  const visibleLogs = logLines.filter(l => tick >= l.t);

  // Animated counters
  const c1 = useCounter(47, tick >= 13, 1200);
  const c2 = useCounter(14, tick >= 28, 1000);
  const c3 = useCounter(6, tick >= 45, 800);

  // Keyword bars — animated width
  const kwBars = [
    { kw: "assurance auto pas cher", vol: 12400, w: 100, pos: "—" },
    { kw: "comparateur assurance", vol: 8100, w: 72, pos: "14" },
    { kw: "meilleure assurance 2025", vol: 6600, w: 58, pos: "—" },
    { kw: "assurance jeune conducteur", vol: 4400, w: 42, pos: "22" },
    { kw: "devis assurance en ligne", vol: 3200, w: 32, pos: "18" },
  ];

  // Progress
  const progress = Math.min(tick / 68 * 100, 100);

  // Scan line position (oscillates during scanning)
  const scanLineActive = tick >= 8 && tick < 55;

  return (
    <section id="demo" className="py-28 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px]"
          style={{ background: "radial-gradient(ellipse at top center, rgba(249,115,22,0.07), transparent 60%)" }} />
      </div>

      <div className="max-w-5xl mx-auto" ref={ref}>

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

        {/* Main panel */}
        <div className={`relative rounded-2xl overflow-hidden transition-all duration-700 ${inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          style={{ transitionDelay: "200ms", background: "rgba(10,10,12,0.8)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 0 120px rgba(249,115,22,0.08), 0 32px 80px rgba(0,0,0,0.5)" }}>

          {/* Animated glow that follows progress */}
          <div className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: done ? 0 : 0.6, background: `radial-gradient(ellipse at ${Math.min(progress, 100)}% 0%, rgba(249,115,22,0.12) 0%, transparent 50%)` }} />
          {done && <div className="absolute inset-0 pointer-events-none animate-[glowPulse_2s_ease-in-out]"
            style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(34,197,94,0.08) 0%, transparent 60%)" }} />}

          {/* Window chrome */}
          <div className="relative flex items-center justify-between px-5 py-3"
            style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(239,68,68,0.5)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(234,179,8,0.5)" }} />
                <div className="w-2.5 h-2.5 rounded-full transition-colors duration-700" style={{ background: done ? "rgba(34,197,94,0.8)" : "rgba(34,197,94,0.2)" }} />
              </div>
              <span className="text-gray-600 text-[11px] font-mono">rankpill — analyse SEO</span>
            </div>
            <div className="flex items-center gap-3">
              {!done && tick > 0 && (
                <span className="text-[10px] font-mono text-gray-500">{Math.round(progress)}%</span>
              )}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full transition-all duration-500 ${done ? "bg-green-400 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : tick > 0 ? "bg-orange-400 animate-pulse" : "bg-gray-700"}`} />
                <span className={`text-[11px] font-bold transition-colors duration-500 ${done ? "text-green-400" : tick > 0 ? "text-orange-400" : "text-gray-700"}`}>
                  {done ? t.proof.scanDone : tick > 0 ? t.proof.scanRunning : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-[2px] overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="h-full transition-all ease-out relative"
              style={{
                width: `${progress}%`,
                transitionDuration: "300ms",
                background: done ? "linear-gradient(90deg, #22c55e, #4ade80)" : "linear-gradient(90deg, #f97316, #ef4444, #fb923c)",
              }}>
              {!done && <div className="absolute right-0 top-0 w-8 h-full animate-pulse" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6))" }} />}
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid md:grid-cols-[1fr_1fr] min-h-[420px]">

            {/* LEFT — Live terminal */}
            <div className="p-5 md:border-r" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Live Scan</span>
              </div>

              {/* Scan line effect */}
              {scanLineActive && (
                <div className="absolute left-0 w-full h-[1px] pointer-events-none animate-[scanDown_2s_linear_infinite]"
                  style={{ background: "linear-gradient(90deg, transparent 10%, rgba(249,115,22,0.3) 50%, transparent 90%)" }} />
              )}

              <div className="space-y-1 font-mono text-[11px] leading-relaxed overflow-hidden max-h-[360px]">
                {visibleLogs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 animate-[logIn_0.3s_ease-out]">
                    <span className="flex-shrink-0 w-3 text-center" style={{ color: log.color }}>{log.icon}</span>
                    <span className={log.icon === "!" ? "text-yellow-300/80" : log.icon === "★" ? "text-orange-300 font-bold" : "text-gray-400"}>
                      {log.text}
                    </span>
                  </div>
                ))}
                {tick > 0 && !done && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-orange-400 animate-pulse">▸</span>
                    <span className="w-2 h-3 bg-orange-400/60 animate-[blink_0.8s_step-end_infinite]" />
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Visual dashboard building up */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Résultats</span>
              </div>

              {/* Mini metrics row */}
              <div className="grid grid-cols-3 gap-2 mb-5">
                {[
                  { label: "Pages", val: tick >= 13 ? c1 : "—", color: "#f97316", active: tick >= 13 },
                  { label: "Mots-clés", val: tick >= 28 ? c2 : "—", color: "#f97316", active: tick >= 28 },
                  { label: "Opportunités", val: tick >= 45 ? c3 : "—", color: "#22c55e", active: tick >= 45 },
                ].map((m, i) => (
                  <div key={i} className={`rounded-lg p-3 text-center transition-all duration-500 ${m.active ? "opacity-100 scale-100" : "opacity-30 scale-95"}`}
                    style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${m.active ? `${m.color}33` : "rgba(255,255,255,0.04)"}` }}>
                    <p className="text-2xl font-black transition-colors duration-500" style={{ color: m.active ? m.color : "#555" }}>{m.val}</p>
                    <p className="text-[10px] font-bold text-gray-500 mt-0.5">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Keyword bars — appear during phase 3 */}
              <div className={`mb-5 transition-all duration-500 ${tick >= 30 ? "opacity-100" : "opacity-0"}`}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Top mots-clés</p>
                <div className="space-y-1.5">
                  {kwBars.map((kw, i) => {
                    const barActive = tick >= 32 + i * 3;
                    return (
                      <div key={i} className={`transition-all duration-500 ${barActive ? "opacity-100" : "opacity-0 translate-x-[-8px]"}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-gray-300 font-medium truncate mr-2">{kw.kw}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[9px] text-gray-500 font-mono">{kw.vol.toLocaleString()}</span>
                            {kw.pos !== "—" && (
                              <span className="text-[9px] font-bold text-orange-400 bg-orange-400/10 px-1.5 py-0.5 rounded">#{kw.pos}</span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                          <div className="h-full rounded-full transition-all duration-1000 ease-out"
                            style={{
                              width: barActive ? `${kw.w}%` : "0%",
                              background: kw.pos === "—"
                                ? "linear-gradient(90deg, #22c55e, #4ade80)"
                                : "linear-gradient(90deg, #f97316, #fb923c)",
                              transitionDelay: `${i * 100}ms`,
                            }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Traffic estimation — appears late */}
              <div className={`rounded-xl p-3 transition-all duration-700 ${tick >= 58 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
                style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-400 text-[10px] font-bold uppercase tracking-wider">Trafic récupérable</p>
                    <p className="text-green-400 text-xl font-black mt-0.5">+480 à +1 200 <span className="text-sm font-bold text-green-400/60">clics/mois</span></p>
                  </div>
                  <div className="flex items-center gap-1">
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-green-400/40">
                      <path d="M3 17l6-6 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M17 7h4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom action plan — slides up after completion */}
          <div className={`transition-all duration-700 overflow-hidden ${done ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}
            style={{ borderTop: done ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <div className="p-5 md:p-6">

              {/* Plan header */}
              <div className="flex items-center gap-2 mb-4">
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-orange-400">
                  <path d="M13 3L6 10.5 3 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: "#f97316" }}>{t.proof.planTitle}</p>
              </div>

              <div className="grid md:grid-cols-2 gap-2.5 mb-5">
                {t.proof.actions.map((action, i) => (
                  <div key={i}
                    className={`flex items-start gap-3 p-3.5 rounded-xl transition-all duration-500 ${done ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
                    style={{ transitionDelay: `${200 + i * 120}ms`, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 font-black text-sm"
                      style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(239,68,68,0.1))", color: "#f97316", border: "1px solid rgba(249,115,22,0.25)" }}>
                      {action.n}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-bold text-sm leading-tight">{action.label}</p>
                      <p className="text-gray-500 text-xs leading-snug mt-0.5">{action.detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Interpretation */}
              <div className={`rounded-xl p-4 transition-all duration-500 ${done ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDelay: "800ms", background: "rgba(249,115,22,0.04)", border: "1px solid rgba(249,115,22,0.12)" }}>
                <p className="text-gray-400 text-sm leading-relaxed">{t.proof.interpretation}</p>
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

      <style>{`
        @keyframes logIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes scanDown {
          0% { top: 80px; }
          100% { top: 420px; }
        }
        @keyframes glowPulse {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0.3; }
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
                "Compatible Wix · Shopify & WordPress bientôt disponibles",
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

          {/* Compatible CMS */}
          <div className="animate-fade-in-up flex flex-col items-center gap-4 mt-10" style={{ animationDelay: "650ms" }}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-600">Compatible avec</p>
            <div className="flex items-center gap-4">
              {/* Wix — actif */}
              <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border border-orange-500/30 bg-orange-500/[0.06]">
                <svg viewBox="0 0 24 24" fill="#f97316" className="w-5 h-5">
                  <path d="M11.705 5.385c-.408 1.188-1.152 3.35-1.848 5.366L7.71 4.617C7.346 3.52 6.663 3 5.726 3H3.43L7.8 15.43c.364 1.058 1.037 1.565 1.895 1.565.858 0 1.532-.507 1.895-1.565l2.148-6.24 2.148 6.24c.363 1.058 1.037 1.565 1.895 1.565.858 0 1.531-.507 1.895-1.565L24 3h-2.295c-.937 0-1.62.52-1.984 1.617l-2.148 6.134c-.695-2.017-1.44-4.178-1.848-5.366C15.29 1.826 14.285 1 12.997 1c-1.289 0-2.294.826-3.292 4.385z"/>
                </svg>
                <span className="text-sm font-black text-orange-400 uppercase tracking-wide">Wix</span>
              </div>
              {/* Shopify — bientôt */}
              <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] opacity-45">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-500">
                  <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.117-.12-.194-.234-.194s-2.08-.146-2.08-.146-.826-.811-1.457-1.411v-.038C16.04 1.315 14.87.5 13.526.5c-.038 0-.077 0-.117.004-.194-.253-.426-.361-.657-.361C9.74.143 8.4 4.077 7.97 6.096c-1.15.354-1.97.608-2.08.646C5.08 7.077 5.04 7.12 5.02 7.423L3 22.9l12.337 1.079z"/>
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide leading-none">Shopify</span>
                  <span className="text-[9px] text-gray-600 font-medium">Bientôt disponible</span>
                </div>
              </div>
              {/* WordPress — bientôt */}
              <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] opacity-45">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-500">
                  <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 1.5c2.33 0 4.463.853 6.1 2.25L4.75 18.1A8.484 8.484 0 0 1 3.5 12c0-4.687 3.813-8.5 8.5-8.5zm0 17c-2.33 0-4.463-.853-6.1-2.25L19.25 5.9A8.484 8.484 0 0 1 20.5 12c0 4.687-3.813 8.5-8.5 8.5z"/>
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wide leading-none">WordPress</span>
                  <span className="text-[9px] text-gray-600 font-medium">Bientôt disponible</span>
                </div>
              </div>
            </div>
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
