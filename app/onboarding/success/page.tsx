"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const steps = [
  { icon: "🔗", label: "Site connecté", delay: 0 },
  { icon: "🧠", label: "Analyse du secteur", delay: 600 },
  { icon: "🎯", label: "Mots-clés configurés", delay: 1200 },
  { icon: "⚡", label: "Prêt à publier", delay: 1800 },
];

export default function OnboardingSuccess() {
  const [visible, setVisible] = useState<number[]>([]);
  const [showCTA, setShowCTA] = useState(false);

  useEffect(() => {
    steps.forEach((step, i) => {
      setTimeout(() => {
        setVisible((v) => [...v, i]);
      }, step.delay + 300);
    });
    setTimeout(() => setShowCTA(true), 2800);
  }, []);

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">

      {/* Glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-orange-600/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-red-600/8 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-lg text-center">

        {/* Logo */}
        <div className="text-2xl font-black tracking-tight mb-12">
          Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
        </div>

        {/* Flamme animée */}
        <div className="relative inline-flex items-center justify-center mb-8" style={{ width: 120, height: 140 }}>

          {/* Glow au sol */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-6 rounded-full blur-xl"
            style={{ background: "radial-gradient(ellipse, rgba(249,115,22,0.7) 0%, transparent 70%)", animation: "flameGlow 1.4s ease-in-out infinite" }} />

          {/* Ombre portée */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-12 h-2 rounded-full blur-md opacity-60"
            style={{ background: "rgba(239,68,68,0.5)", animation: "flameGlow 1.4s ease-in-out infinite 0.2s" }} />

          {/* Flamme extérieure (orange) */}
          <svg viewBox="0 0 80 110" className="absolute bottom-4" style={{ width: 80, height: 110, animation: "flameDance 1.8s ease-in-out infinite" }}>
            <path d="M40 8 C44 20, 62 28, 58 46 C56 58, 66 62, 62 76 C58 90, 48 100, 40 104 C32 100, 22 90, 18 76 C14 62, 24 58, 22 46 C18 28, 36 20, 40 8Z"
              fill="url(#flameOuter)" opacity="0.95" />
            <defs>
              <radialGradient id="flameOuter" cx="50%" cy="75%" r="55%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="40%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#dc2626" stopOpacity="0.8" />
              </radialGradient>
            </defs>
          </svg>

          {/* Flamme intérieure (jaune/blanc) */}
          <svg viewBox="0 0 50 75" className="absolute bottom-6" style={{ width: 50, height: 75, animation: "flameDance 1.3s ease-in-out infinite reverse 0.15s" }}>
            <path d="M25 5 C27 14, 38 20, 36 33 C34 44, 40 48, 37 58 C34 66, 28 72, 25 74 C22 72, 16 66, 13 58 C10 48, 16 44, 14 33 C12 20, 23 14, 25 5Z"
              fill="url(#flameInner)" opacity="0.9" />
            <defs>
              <radialGradient id="flameInner" cx="50%" cy="70%" r="55%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <stop offset="30%" stopColor="#fef08a" />
                <stop offset="70%" stopColor="#fb923c" />
                <stop offset="100%" stopColor="#ea580c" stopOpacity="0.7" />
              </radialGradient>
            </defs>
          </svg>

          {/* Étincelles */}
          {[
            { x: -22, delay: "0s", dur: "2s", size: 3 },
            { x: 20, delay: "0.6s", dur: "1.7s", size: 2 },
            { x: -10, delay: "1.1s", dur: "2.2s", size: 2.5 },
            { x: 26, delay: "0.3s", dur: "1.5s", size: 2 },
            { x: -28, delay: "1.4s", dur: "2s", size: 1.5 },
          ].map((spark, idx) => (
            <div key={idx} className="absolute rounded-full"
              style={{
                width: spark.size * 2,
                height: spark.size * 2,
                left: `calc(50% + ${spark.x}px)`,
                bottom: "30%",
                background: idx % 2 === 0 ? "#fbbf24" : "#f97316",
                boxShadow: `0 0 ${spark.size * 2}px ${spark.size}px rgba(251,191,36,0.8)`,
                animation: `sparkFloat ${spark.dur} ease-out infinite ${spark.delay}`,
              }}
            />
          ))}
        </div>

        {/* Titre */}
        <h1 className="text-4xl font-black mb-3 tracking-tight">
          RankPill est{" "}
          <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
            opérationnel
          </span>
        </h1>
        <p className="text-gray-400 text-lg mb-10 leading-relaxed">
          Votre service SEO démarre dans les prochaines 24h.<br />
          Le premier article sera publié automatiquement.
        </p>

        {/* Checklist animée */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 mb-8 text-left">
          <div className="flex flex-col gap-4">
            {steps.map((step, i) => (
              <div
                key={step.label}
                className={`flex items-center gap-4 transition-all duration-500 ${
                  visible.includes(i) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition-all duration-300 ${
                  visible.includes(i)
                    ? "bg-gradient-to-br from-orange-500 to-red-500 shadow-lg shadow-orange-500/20"
                    : "bg-white/[0.05]"
                }`}>
                  {visible.includes(i) ? "✓" : step.icon}
                </div>
                <span className={`font-medium transition-colors duration-300 ${visible.includes(i) ? "text-white" : "text-gray-600"}`}>
                  {step.label}
                </span>
                {visible.includes(i) && (
                  <span className="ml-auto text-orange-400 text-xs font-bold uppercase tracking-wide">OK</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className={`transition-all duration-700 ${showCTA ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <Link
            href="/dashboard"
            className="inline-block w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-4 rounded-xl transition-all uppercase tracking-wide shadow-xl shadow-orange-500/25 text-lg"
          >
            Accéder à mon tableau de bord →
          </Link>
          <p className="text-gray-600 text-sm mt-4">
            Premier article prévu demain à 8h00
          </p>
        </div>

      </div>
    </main>
  );
}
