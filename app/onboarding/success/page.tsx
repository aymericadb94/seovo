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
          Seo<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Corp</span>
        </div>

        {/* Icône centrale */}
        <div className="relative inline-flex items-center justify-center mb-8">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-4xl shadow-2xl shadow-orange-500/40 animate-pulse">
            🚀
          </div>
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-500/20 to-red-500/20 blur-xl scale-150" />
        </div>

        {/* Titre */}
        <h1 className="text-4xl font-black mb-3 tracking-tight">
          SeoCorp est{" "}
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
