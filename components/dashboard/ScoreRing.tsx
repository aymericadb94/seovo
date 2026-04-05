"use client";

import { useState, useEffect } from "react";

export default function ScoreRing({ score }: { score: number }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  const [numVisible, setNumVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { setDash((score / 100) * circ); setNumVisible(true); }, 300);
    return () => clearTimeout(t);
  }, [score, circ]);
  const color = score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444";
  const label = score >= 75 ? "Excellent" : score >= 50 ? "En progrès" : "À améliorer";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0">
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{ background: `radial-gradient(circle, ${color}18 0%, transparent 68%)`, animationDuration: "2.5s" }}
        />
        <svg className="absolute inset-0 rotate-[-90deg]" viewBox="0 0 100 100">
          <defs>
            <filter id="scoreGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ - dash}
            filter="url(#scoreGlow)"
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}
          />
        </svg>
        <div
          className="text-center z-10"
          style={{ opacity: numVisible ? 1 : 0, transform: numVisible ? "scale(1)" : "scale(0.8)", transition: "opacity 0.5s ease 0.9s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.9s" }}
        >
          <p className="text-2xl font-black text-white leading-none">{score}</p>
          <p className="text-gray-600 text-xs">/100</p>
        </div>
      </div>
      <div>
        <p className="text-white font-bold text-lg">Score SEO</p>
        <span
          className="relative inline-flex items-center overflow-hidden text-xs font-bold px-2.5 py-1 rounded-full mt-1"
          style={{ background: `${color}20`, color }}
        >
          <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
          {label}
        </span>
        <p className="text-gray-500 text-xs mt-2">Basé sur vos publications et mots-clés couverts</p>
      </div>
    </div>
  );
}
