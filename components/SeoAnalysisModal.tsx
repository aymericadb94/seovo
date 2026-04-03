"use client";

import { useState, useEffect, useRef } from "react";

type SeoScore = {
  overall: number;
  breakdown: {
    qualite_contenu: number;
    optimisation_meta: number;
    ciblage_mots_cles: number;
    potentiel_croissance: number;
  };
  verdict: string;
};

type AnalysisResult = {
  seo_score: SeoScore;
  strategy_summary: string;
  semantic_cocoon: {
    pillar: string;
    clusters: { theme: string; keywords: string[] }[];
  };
  priority_keywords: {
    keyword: string;
    intent: string;
    difficulty: string;
    priority: string;
    rationale: string;
  }[];
  quick_wins: string[];
  content_angles: string[];
};

type Props = {
  onComplete: () => void;
  prefilledStrengths?: string;
  prefilledDifferentiators?: string;
};

const STEPS = [
  { id: "intro", label: "Bienvenue" },
  { id: "analyzing", label: "Analyse" },
  { id: "results", label: "Stratégie" },
];

const intentColors: Record<string, string> = {
  transactional: "#22c55e",
  commercial: "#f97316",
  informational: "#60a5fa",
  navigational: "#a78bfa",
};

const difficultyLabel: Record<string, string> = {
  easy: "Facile",
  medium: "Moyen",
  hard: "Difficile",
};

const MATRIX_CHARS = "アイウエオカキクケコ01234ABCDEF#$<>{}|\\~_+=?!@";

function randomChar() {
  return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

function ScrambleLine({ text, isLast }: { text: string; isLast: boolean }) {
  const [chars, setChars] = useState<string[]>(() => text.split("").map(() => randomChar()));
  const [done, setDone] = useState(false);
  const stepRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      stepRef.current += 0.6;
      const resolved = Math.floor(stepRef.current);
      if (resolved >= text.length) {
        setChars(text.split(""));
        setDone(true);
        clearInterval(interval);
        return;
      }
      setChars(
        text.split("").map((c, i) => (i < resolved ? c : randomChar()))
      );
    }, 28);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <div className="flex items-center gap-2 min-h-[20px]">
      <span
        className="text-xs flex-shrink-0 transition-colors duration-300"
        style={{ color: done ? "#f97316" : "#fb923c99" }}
      >
        ▸
      </span>
      <span
        className="text-xs font-mono tracking-wide transition-colors duration-500"
        style={{ color: done ? "#d1d5db" : "#fb923ccc" }}
      >
        {chars.join("")}
      </span>
      {isLast && !done && (
        <span
          className="inline-block flex-shrink-0 animate-pulse"
          style={{ width: 6, height: 12, background: "#fb923c", marginLeft: 2 }}
        />
      )}
    </div>
  );
}

function ScoreCircle({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 38;
  const circumference = 2 * Math.PI * r;
  const color = score >= 66 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";
  const label = score >= 66 ? "Bon" : score >= 40 ? "Moyen" : "Faible";

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(t);
  }, [score]);

  const offset = circumference * (1 - animated / 100);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={96} height={96} viewBox="0 0 96 96">
        {/* Track */}
        <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
        {/* Progress */}
        <circle
          cx={48}
          cy={48}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1), stroke 0.5s" }}
        />
        <text x={48} y={44} textAnchor="middle" fill="white" fontSize={20} fontWeight="900" fontFamily="inherit">
          {animated}
        </text>
        <text x={48} y={60} textAnchor="middle" fill="rgba(156,163,175,0.8)" fontSize={10} fontFamily="inherit">
          / 100
        </text>
      </svg>
      <span className="text-xs font-bold" style={{ color }}>{label}</span>
    </div>
  );
}

function BreakdownBar({ label, score }: { label: string; score: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 66 ? "#22c55e" : score >= 40 ? "#f97316" : "#ef4444";

  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 200);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-gray-500 text-xs">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: color,
            transition: "width 1s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: `0 0 8px ${color}60`,
          }}
        />
      </div>
    </div>
  );
}

export default function SeoAnalysisModal({ onComplete, prefilledStrengths = "", prefilledDifferentiators = "" }: Props) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const answers = { strengths: prefilledStrengths, differentiators: prefilledDifferentiators };
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanLines, setScanLines] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => {
      clearTimeout(t);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function runAnalysis() {
    setStep(1);
    setError(null);
    setScanLines([]);

    const lines = [
      "Connexion au site en cours...",
      "Analyse de la page d'accueil...",
      "Extraction des signaux SEO...",
      "Analyse concurrentielle...",
      "Construction du cocon sémantique...",
      "Priorisation des mots-clés...",
      "Génération de la stratégie...",
    ];
    // Étaler les lignes sur ~28s pour couvrir la durée réelle de l'API
    let i = 0;
    const INTERVAL_MS = 3500;
    const interval = setInterval(() => {
      if (i < lines.length) {
        setScanLines(prev => [...prev, lines[i]]);
        i++;
      }
    }, INTERVAL_MS);
    intervalRef.current = interval;

    try {
      const res = await fetch("/api/seo-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      clearInterval(interval);
      intervalRef.current = null;

      // Afficher rapidement les lignes restantes avant de transitionner
      const remaining = lines.slice(i);
      for (let j = 0; j < remaining.length; j++) {
        await new Promise(r => setTimeout(r, 120));
        setScanLines(prev => [...prev, remaining[j]]);
      }

      if (json.error) {
        setError(json.error);
        setStep(0);
      } else {
        await new Promise(r => setTimeout(r, 700));
        setResult(json.analysis);
        setStep(2);
      }
    } catch {
      clearInterval(interval);
      setError("Erreur de connexion");
      setStep(0);
    }
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onComplete, 400);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.92)",
        backdropFilter: "blur(12px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}
    >
      {/* Orbs */}
      <div className="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full bg-orange-500/8 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full bg-red-500/6 blur-[100px] pointer-events-none" />

      <div
        className="relative w-full max-w-2xl bg-[#0d0d0d] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl"
        style={{
          transform: visible ? "translateY(0) scale(1)" : "translateY(40px) scale(0.96)",
          transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Header gradient bar */}
        <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />

        {/* Erreur globale — visible sur step 0 après échec */}
        {error && step === 0 && (
          <div className="mx-8 mt-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-bold">⚠ Erreur : {error}</p>
            <p className="text-red-400/70 text-xs mt-0.5">Veuillez réessayer ou vérifier votre connexion.</p>
          </div>
        )}

        <div className="px-8 pb-8 pt-2">

          {/* ── Step 0: Intro ─────────────────────────────────── */}
          {step === 0 && (
            <div className="text-center py-4">

              {/* Icône animée */}
              <div className="relative inline-flex items-center justify-center mb-7 animate-[fadeInUp_0.5s_cubic-bezier(0.16,1,0.3,1)_both]" style={{ width: 80, height: 80 }}>
                {/* Anneaux pulsants */}
                <div className="absolute rounded-full" style={{ inset: -10, border: "1px solid rgba(249,115,22,0.2)", animation: "ringPulse 2.4s ease-out infinite" }} />
                <div className="absolute rounded-full" style={{ inset: -4, border: "1px solid rgba(249,115,22,0.15)", animation: "ringPulse 2.4s ease-out infinite 0.9s" }} />
                {/* Rayons */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ animation: "spin 10s linear infinite" }}>
                  {[0,60,120,180,240,300].map((deg) => (
                    <div key={deg} className="absolute" style={{
                      width: 1,
                      height: 14,
                      background: "linear-gradient(to top, rgba(249,115,22,0.5), transparent)",
                      transformOrigin: "bottom center",
                      bottom: "50%",
                      left: "calc(50% - 0.5px)",
                      transform: `rotate(${deg}deg) translateY(calc(-50% - 44px))`,
                    }} />
                  ))}
                </div>
                {/* Centre */}
                <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden" style={{
                  background: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(239,68,68,0.1))",
                  border: "1px solid rgba(249,115,22,0.35)",
                  boxShadow: "0 0 28px rgba(249,115,22,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent animate-[sweep_3s_ease-in-out_infinite]" />
                  <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 relative z-10" style={{ filter: "drop-shadow(0 0 8px rgba(249,115,22,0.9))" }}>
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" fill="url(#sg)" />
                    <defs>
                      <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#f97316" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              {/* Titre */}
              <h2 className="text-2xl font-black text-white mb-3 animate-[fadeInUp_0.5s_cubic-bezier(0.16,1,0.3,1)_0.1s_both]">
                Analyse SEO de votre site
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto mb-2 animate-[fadeInUp_0.5s_cubic-bezier(0.16,1,0.3,1)_0.18s_both]">
                Bienvenue ! Pour maximiser vos résultats SEO, nous allons analyser votre site et créer une stratégie sur-mesure.
              </p>
              <p className="text-gray-600 text-xs mb-8 animate-[fadeIn_0.5s_ease_0.26s_both]">
                3 minutes · Gratuit · Résultats immédiats
              </p>

              {/* Feature cards */}
              <div className="grid grid-cols-3 gap-3 mb-8 text-left">
                {[
                  {
                    icon: <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5"><circle cx="9" cy="9" r="5.5" stroke="#f97316" strokeWidth="1.5"/><path d="M13.5 13.5L17 17" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/></svg>,
                    label: "Analyse du site",
                    desc: "Signaux techniques réels",
                    delay: "0.28s",
                  },
                  {
                    icon: <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5"><circle cx="10" cy="5.5" r="2" stroke="#fb923c" strokeWidth="1.4"/><circle cx="4" cy="14.5" r="2" stroke="#fb923c" strokeWidth="1.4"/><circle cx="16" cy="14.5" r="2" stroke="#fb923c" strokeWidth="1.4"/><path d="M10 7.5v4M10 11.5l-4.5 1.5M10 11.5l4.5 1.5" stroke="#fb923c" strokeWidth="1.2" strokeLinecap="round"/></svg>,
                    label: "Cocon sémantique",
                    desc: "Structure thématique complète",
                    delay: "0.36s",
                  },
                  {
                    icon: <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5"><path d="M10 2l1.8 5.5H18l-4.7 3.4 1.8 5.5L10 13l-5.1 3.4 1.8-5.5L2 7.5h6.2L10 2z" stroke="#ef4444" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
                    label: "25 mots-clés",
                    desc: "Classés par potentiel SEO",
                    delay: "0.44s",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="relative bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 overflow-hidden group transition-all duration-300 hover:border-orange-500/25 hover:bg-orange-500/[0.04] hover:-translate-y-0.5 animate-[fadeInUp_0.5s_cubic-bezier(0.16,1,0.3,1)_both]"
                    style={{ animationDelay: item.delay }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <div className="mb-2">{item.icon}</div>
                    <p className="text-white text-xs font-bold mb-0.5">{item.label}</p>
                    <p className="text-gray-600 text-xs leading-snug">{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="animate-[fadeInUp_0.5s_cubic-bezier(0.16,1,0.3,1)_0.5s_both]">
                <button
                  onClick={runAnalysis}
                  className="relative w-full py-4 text-white font-black rounded-xl text-sm uppercase tracking-widest overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
                    boxShadow: "0 8px 32px rgba(249,115,22,0.35), 0 0 0 1px rgba(249,115,22,0.25)",
                    transition: "box-shadow 0.3s ease, transform 0.2s ease",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 12px 40px rgba(249,115,22,0.5), 0 0 0 1px rgba(249,115,22,0.35)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 32px rgba(249,115,22,0.35), 0 0 0 1px rgba(249,115,22,0.25)"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative flex items-center justify-center gap-2">
                    Lancer l&apos;analyse
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300">
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1: Analyzing ─────────────────────────────── */}
          {step === 1 && (
            <div className="py-2">
              <div className="text-center mb-6">
                {/* Animated logo */}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 relative"
                  style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(239,68,68,0.1))", border: "1px solid rgba(249,115,22,0.25)" }}
                >
                  {/* Rotating ring */}
                  <svg className="absolute inset-0" width={64} height={64} viewBox="0 0 64 64">
                    <circle cx={32} cy={32} r={28} fill="none" stroke="rgba(249,115,22,0.15)" strokeWidth={2} />
                    <circle
                      cx={32} cy={32} r={28} fill="none"
                      stroke="url(#ringGrad)" strokeWidth={2}
                      strokeLinecap="round"
                      strokeDasharray="40 136"
                      style={{ animation: "spin 1.2s linear infinite", transformOrigin: "32px 32px" }}
                    />
                    <defs>
                      <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f97316" />
                        <stop offset="100%" stopColor="#ef4444" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="text-2xl font-black" style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    R
                  </span>
                </div>
                <h2 className="text-xl font-black text-white mb-1">Analyse en cours</h2>
                <p className="text-gray-600 text-xs">
                  {scanLines.length} / 7 signaux analysés
                </p>
              </div>

              {/* Terminal */}
              <div
                className="rounded-xl p-5 font-mono text-xs space-y-2.5 min-h-[180px] relative overflow-hidden"
                style={{
                  background: "#060606",
                  border: "1px solid rgba(249,115,22,0.12)",
                  boxShadow: "inset 0 0 40px rgba(249,115,22,0.03)",
                }}
              >
                {/* Scanline CRT overlay */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)",
                    zIndex: 1,
                  }}
                />
                {/* Glow */}
                <div className="absolute top-0 left-0 right-0 h-8 pointer-events-none"
                  style={{ background: "linear-gradient(180deg, rgba(249,115,22,0.04), transparent)", zIndex: 0 }} />

                <div className="relative z-10 space-y-2">
                  {scanLines.map((line, i) => (
                    <ScrambleLine
                      key={i}
                      text={line}
                      isLast={i === scanLines.length - 1}
                    />
                  ))}
                  {scanLines.length === 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-orange-500 text-xs">▸</span>
                      <span
                        className="inline-block animate-pulse"
                        style={{ width: 6, height: 12, background: "#f97316" }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(scanLines.length / 7) * 100}%`,
                    background: "linear-gradient(90deg, #f97316, #ef4444)",
                    transition: "width 0.8s ease",
                    boxShadow: "0 0 8px rgba(249,115,22,0.5)",
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Step 6: Results ───────────────────────────────── */}
          {step === 2 && result && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20 flex items-center justify-center text-sm">
                  ✦
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Stratégie SEO générée</h2>
                  <p className="text-gray-600 text-xs">Vos mots-clés ont été mis à jour automatiquement</p>
                </div>
              </div>

              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>

                {/* SEO Score Card */}
                {result.seo_score && (
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      background: "linear-gradient(135deg, rgba(15,15,15,1), rgba(20,20,20,1))",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-4">
                      Score SEO actuel — avant RankPill
                    </p>
                    <div className="flex items-start gap-6">
                      <ScoreCircle score={result.seo_score.overall} />
                      <div className="flex-1 space-y-2.5">
                        <BreakdownBar label="Qualité du contenu" score={result.seo_score.breakdown.qualite_contenu} />
                        <BreakdownBar label="Optimisation meta" score={result.seo_score.breakdown.optimisation_meta} />
                        <BreakdownBar label="Ciblage mots-clés" score={result.seo_score.breakdown.ciblage_mots_cles} />
                        <BreakdownBar label="Potentiel de croissance" score={result.seo_score.breakdown.potentiel_croissance} />
                      </div>
                    </div>
                    {result.seo_score.verdict && (
                      <p className="text-gray-500 text-xs mt-4 pt-4 border-t border-white/[0.05] leading-relaxed">
                        {result.seo_score.verdict}
                      </p>
                    )}
                  </div>
                )}

                {/* Strategy summary */}
                <div className="bg-gradient-to-br from-orange-500/10 to-red-500/5 border border-orange-500/20 rounded-xl p-4">
                  <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">Stratégie</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{result.strategy_summary}</p>
                </div>

                {/* Pillar keyword */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Mot-clé pilier</p>
                  <p className="text-white font-black text-lg">{result.semantic_cocoon.pillar}</p>
                </div>

                {/* Semantic clusters */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">Cocon sémantique</p>
                  <div className="space-y-3">
                    {result.semantic_cocoon.clusters.map((cluster, i) => (
                      <div key={i}>
                        <p className="text-white text-xs font-bold mb-1.5">{cluster.theme}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cluster.keywords.map(kw => (
                            <span key={kw} className="px-2 py-0.5 bg-white/[0.05] border border-white/10 rounded-md text-gray-400 text-xs">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Priority keywords */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                  <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-3">
                    Mots-clés prioritaires ({result.priority_keywords.length})
                  </p>
                  <div className="space-y-2">
                    {result.priority_keywords.map((kw, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0">
                        <span className="text-gray-700 text-xs font-mono w-5 flex-shrink-0 pt-0.5">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-white text-sm font-medium">{kw.keyword}</p>
                            <span
                              className="px-1.5 py-0.5 rounded text-xs font-bold"
                              style={{
                                color: intentColors[kw.intent] ?? "#999",
                                background: `${intentColors[kw.intent] ?? "#999"}15`,
                              }}
                            >
                              {kw.intent}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              kw.difficulty === "easy"
                                ? "text-green-400 bg-green-400/10"
                                : kw.difficulty === "medium"
                                ? "text-orange-400 bg-orange-400/10"
                                : "text-red-400 bg-red-400/10"
                            }`}>
                              {difficultyLabel[kw.difficulty] ?? kw.difficulty}
                            </span>
                          </div>
                          {kw.rationale && (
                            <p className="text-gray-600 text-xs mt-0.5">{kw.rationale}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick wins */}
                {result.quick_wins?.length > 0 && (
                  <div className="bg-green-500/5 border border-green-500/15 rounded-xl p-4">
                    <p className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">⚡ Quick Wins</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.quick_wins.map(kw => (
                        <span key={kw} className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 rounded-md text-green-400 text-xs font-medium">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content angles */}
                {result.content_angles?.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-2">Angles de contenu</p>
                    <ul className="space-y-1">
                      {result.content_angles.map((angle, i) => (
                        <li key={i} className="text-gray-400 text-sm flex items-start gap-2">
                          <span className="text-orange-500 mt-0.5">▸</span>
                          {angle}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <button
                onClick={handleClose}
                className="w-full mt-5 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-xl text-sm uppercase tracking-wide shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow"
              >
                Accéder au dashboard →
              </button>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
