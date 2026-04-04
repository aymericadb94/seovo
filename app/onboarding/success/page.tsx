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
        {/* Pilule animée */}
        <div className="relative inline-flex items-center justify-center mb-8">
          <style>{`
            @keyframes pillFloat {
              0%, 100% { transform: translateY(0px) rotate(-8deg); }
              50% { transform: translateY(-12px) rotate(-8deg); }
            }
            @keyframes pillGlow {
              0%, 100% { opacity: 0.5; transform: translateX(-50%) scaleX(1); }
              50% { opacity: 0.9; transform: translateX(-50%) scaleX(0.7); }
            }
            @keyframes pillShine {
              0% { transform: translateX(-100%) skewX(-15deg); }
              100% { transform: translateX(300%) skewX(-15deg); }
            }
            @keyframes particleRise {
              0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
              100% { transform: translateY(-40px) translateX(var(--tx)) scale(0); opacity: 0; }
            }
          `}</style>

          {/* Halo au sol */}
          <div className="absolute bottom-[-8px] left-1/2 w-20 h-3 rounded-full blur-lg"
            style={{ background: "linear-gradient(90deg, #f97316, #ef4444)", animation: "pillGlow 2s ease-in-out infinite", transform: "translateX(-50%)" }} />

          {/* Pilule */}
          <div
            className="relative overflow-hidden"
            style={{
              width: 72, height: 136,
              borderRadius: 36,
              background: "linear-gradient(160deg, #1a0a00 0%, #0d0d0d 40%, #1a0500 100%)",
              border: "1.5px solid rgba(249,115,22,0.4)",
              boxShadow: "0 0 32px rgba(249,115,22,0.25), 0 0 8px rgba(249,115,22,0.15), inset 0 1px 0 rgba(255,255,255,0.08)",
              animation: "pillFloat 2.8s ease-in-out infinite",
            }}
          >
            {/* Reflet */}
            <div className="absolute inset-0 rounded-full opacity-30"
              style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 50%)" }} />

            {/* Ligne de séparation */}
            <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.6), transparent)" }} />

            {/* Demi-capsule haute — orange vif */}
            <div className="absolute top-3 left-3 right-3"
              style={{
                height: 56,
                borderRadius: "28px 28px 4px 4px",
                background: "linear-gradient(170deg, #ff8c00 0%, #f97316 50%, #ea580c 100%)",
                boxShadow: "0 4px 16px rgba(249,115,22,0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
            />

            {/* Demi-capsule basse — sombre */}
            <div className="absolute bottom-3 left-3 right-3"
              style={{
                height: 56,
                borderRadius: "4px 4px 28px 28px",
                background: "linear-gradient(170deg, #1c0a00 0%, #0d0500 100%)",
                border: "1px solid rgba(249,115,22,0.15)",
              }}
            />

            {/* Shine animé */}
            <div className="absolute inset-0 w-8"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
                animation: "pillShine 3s ease-in-out infinite 1s",
              }}
            />
          </div>

          {/* Particules */}
          {[
            { x: "-8px", delay: "0s", dur: "1.8s", size: 4, left: "40%" },
            { x: "10px", delay: "0.7s", dur: "2.1s", size: 3, left: "60%" },
            { x: "-14px", delay: "1.2s", dur: "1.6s", size: 3, left: "50%" },
            { x: "6px", delay: "0.3s", dur: "2s", size: 2, left: "35%" },
            { x: "12px", delay: "1.5s", dur: "1.9s", size: 2, left: "65%" },
          ].map((p, i) => (
            <div key={i} className="absolute rounded-full"
              style={{
                width: p.size, height: p.size,
                left: p.left, bottom: "28%",
                ["--tx" as string]: p.x,
                background: i % 2 === 0 ? "#f97316" : "#fbbf24",
                boxShadow: `0 0 ${p.size * 2}px ${p.size}px rgba(249,115,22,0.6)`,
                animation: `particleRise ${p.dur} ease-out infinite ${p.delay}`,
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
