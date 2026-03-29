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
};

const STEPS = [
  { id: "intro", label: "Bienvenue" },
  { id: "strengths", label: "Points forts" },
  { id: "audience", label: "Audience" },
  { id: "geo", label: "Portée" },
  { id: "competitors", label: "Concurrents" },
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

export default function SeoAnalysisModal({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [answers, setAnswers] = useState({
    strengths: "",
    differentiators: "",
    targetAudience: "",
    geoScope: "national",
    competitors: "",
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanLines, setScanLines] = useState<string[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  async function runAnalysis() {
    setStep(5);
    setAnalyzing(true);
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
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        setScanLines(prev => [...prev, lines[i]]);
        i++;
      }
    }, 800);

    try {
      const res = await fetch("/api/seo-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      clearInterval(interval);
      setScanLines(lines); // show all lines before transitioning
      if (json.error) {
        setError(json.error);
        setStep(4);
      } else {
        await new Promise(r => setTimeout(r, 600));
        setResult(json.analysis);
        setStep(6);
      }
    } catch {
      clearInterval(interval);
      setError("Erreur de connexion");
      setStep(4);
    }
    setAnalyzing(false);
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onComplete, 400);
  }

  const canNext = () => {
    if (step === 1) return answers.strengths.trim().length > 10;
    if (step === 2) return answers.targetAudience.trim().length > 5;
    if (step === 3) return true;
    if (step === 4) return answers.competitors.trim().length > 3;
    return true;
  };

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

        {/* Progress bar */}
        {step < 5 && (
          <div className="px-8 pt-6 pb-0">
            <div className="flex items-center gap-1.5 mb-6">
              {STEPS.slice(0, 5).map((s, i) => (
                <div
                  key={s.id}
                  className="h-1 flex-1 rounded-full transition-all duration-500"
                  style={{
                    background: i <= step
                      ? "linear-gradient(90deg, #f97316, #ef4444)"
                      : "rgba(255,255,255,0.06)",
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="px-8 pb-8 pt-2">

          {/* ── Step 0: Intro ─────────────────────────────────── */}
          {step === 0 && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20 mb-6">
                <span className="text-3xl">✦</span>
              </div>
              <h2 className="text-2xl font-black text-white mb-3">
                Analyse SEO de votre site
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto mb-2">
                Bienvenue ! Pour maximiser vos résultats SEO, nous allons analyser votre site et créer une stratégie sur-mesure.
              </p>
              <p className="text-gray-600 text-xs mb-8">
                3 minutes · Gratuit · Résultats immédiats
              </p>
              <div className="grid grid-cols-3 gap-3 mb-8 text-left">
                {[
                  { icon: "🔍", label: "Analyse de votre site", desc: "Scraping de la homepage" },
                  { icon: "🧠", label: "Cocon sémantique", desc: "Structure thématique complète" },
                  { icon: "🎯", label: "25 mots-clés priorisés", desc: "Classés par potentiel SEO" },
                ].map(item => (
                  <div key={item.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <p className="text-lg mb-1">{item.icon}</p>
                    <p className="text-white text-xs font-bold">{item.label}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{item.desc}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-xl text-sm uppercase tracking-wide shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition-shadow"
              >
                Lancer l&apos;analyse →
              </button>
            </div>
          )}

          {/* ── Step 1: Strengths ─────────────────────────────── */}
          {step === 1 && (
            <div>
              <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">Étape 1 / 4</p>
              <h2 className="text-xl font-black text-white mb-1">Vos points forts</h2>
              <p className="text-gray-500 text-sm mb-5">Qu&apos;est-ce qui vous rend unique ? Pourquoi choisir votre marque ?</p>
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1.5 block">
                    Points forts *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Livraison gratuite en 24h, produits fabriqués en France, garantie 5 ans, service client 7j/7..."
                    value={answers.strengths}
                    onChange={e => setAnswers(a => ({ ...a, strengths: e.target.value }))}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1.5 block">
                    Différenciateurs (optionnel)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Technologie propriétaire, expertise de 15 ans, certifications, labels..."
                    value={answers.differentiators}
                    onChange={e => setAnswers(a => ({ ...a, differentiators: e.target.value }))}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-4 py-3 text-gray-500 hover:text-white text-sm border border-white/10 rounded-xl transition-colors">
                  ← Retour
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!canNext()}
                  className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Continuer →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Audience ──────────────────────────────── */}
          {step === 2 && (
            <div>
              <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">Étape 2 / 4</p>
              <h2 className="text-xl font-black text-white mb-1">Votre audience cible</h2>
              <p className="text-gray-500 text-sm mb-5">Qui sont vos clients idéaux ? Quels sont leurs besoins ?</p>
              <div className="mb-5">
                <label className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1.5 block">
                  Décrivez votre client type *
                </label>
                <textarea
                  rows={4}
                  placeholder="Ex: Femmes 25-45 ans, sportives, cherchent des équipements premium. Ou: TPE/PME du secteur retail, besoin de digitalisation rapide..."
                  value={answers.targetAudience}
                  onChange={e => setAnswers(a => ({ ...a, targetAudience: e.target.value }))}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-4 py-3 text-gray-500 hover:text-white text-sm border border-white/10 rounded-xl transition-colors">
                  ← Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!canNext()}
                  className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Continuer →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Geo scope ─────────────────────────────── */}
          {step === 3 && (
            <div>
              <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">Étape 3 / 4</p>
              <h2 className="text-xl font-black text-white mb-1">Portée géographique</h2>
              <p className="text-gray-500 text-sm mb-5">Sur quelle zone votre SEO doit-il cibler en priorité ?</p>
              <div className="grid grid-cols-2 gap-3 mb-5">
                {[
                  { value: "local", label: "Local", desc: "Ville / région spécifique", icon: "📍" },
                  { value: "national", label: "National", desc: "Tout le territoire français", icon: "🇫🇷" },
                  { value: "european", label: "Européen", desc: "France + pays voisins", icon: "🇪🇺" },
                  { value: "international", label: "International", desc: "Monde entier", icon: "🌍" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAnswers(a => ({ ...a, geoScope: opt.value }))}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      answers.geoScope === opt.value
                        ? "border-orange-500/60 bg-orange-500/10"
                        : "border-white/[0.08] bg-white/[0.03] hover:border-white/20"
                    }`}
                  >
                    <p className="text-xl mb-1">{opt.icon}</p>
                    <p className="text-white text-sm font-bold">{opt.label}</p>
                    <p className="text-gray-600 text-xs mt-0.5">{opt.desc}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="px-4 py-3 text-gray-500 hover:text-white text-sm border border-white/10 rounded-xl transition-colors">
                  ← Retour
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-xl text-sm transition-opacity"
                >
                  Continuer →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Competitors ───────────────────────────── */}
          {step === 4 && (
            <div>
              <p className="text-orange-400 text-xs font-bold uppercase tracking-widest mb-2">Étape 4 / 4</p>
              <h2 className="text-xl font-black text-white mb-1">Vos concurrents</h2>
              <p className="text-gray-500 text-sm mb-5">Qui sont vos principaux concurrents sur le web ?</p>
              {error && (
                <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">⚠ {error}</p>
                </div>
              )}
              <div className="mb-5">
                <label className="text-xs text-gray-500 uppercase tracking-wide font-bold mb-1.5 block">
                  Noms ou URLs de vos concurrents *
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: concurrent1.fr, Marque X, site-concurrent.com..."
                  value={answers.competitors}
                  onChange={e => setAnswers(a => ({ ...a, competitors: e.target.value }))}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl p-3.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/50 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="px-4 py-3 text-gray-500 hover:text-white text-sm border border-white/10 rounded-xl transition-colors">
                  ← Retour
                </button>
                <button
                  onClick={runAnalysis}
                  disabled={!canNext() || analyzing}
                  className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Lancer l&apos;analyse ✦
                </button>
              </div>
            </div>
          )}

          {/* ── Step 5: Analyzing ─────────────────────────────── */}
          {step === 5 && (
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
          {step === 6 && result && (
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
