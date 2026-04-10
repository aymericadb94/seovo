"use client";

import { useState, useEffect } from "react";

type PillarScore = { score: number; max: number };
type Breakdown = {
  visibility: PillarScore;
  traffic: PillarScore;
  coverage: PillarScore;
  structure: PillarScore;
  hasGsc: boolean;
  maxScore: number;
  trend: { clicksDelta: number; impressionsDelta: number } | null;
} | null;

export default function ScoreRing({ score, locked = false, breakdown = null }: { score: number; locked?: boolean; breakdown?: Breakdown }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  const [numVisible, setNumVisible] = useState(false);

  const maxScore = breakdown?.maxScore ?? 100;
  const displayScore = locked ? 0 : score;

  useEffect(() => {
    if (locked) { setDash(0); setNumVisible(false); return; }
    const t = setTimeout(() => { setDash((displayScore / maxScore) * circ); setNumVisible(true); }, 300);
    return () => clearTimeout(t);
  }, [displayScore, circ, locked, maxScore]);

  const color = locked ? "#374151" : score >= 75 ? "#22c55e" : score >= 50 ? "#f97316" : "#ef4444";
  const label = locked ? "En attente" : score >= 75 ? "Excellent" : score >= 50 ? "En progrès" : "À améliorer";

  const trend = breakdown?.trend;
  const trendArrow = trend ? (trend.clicksDelta > 5 ? "↑" : trend.clicksDelta < -5 ? "↓" : "→") : null;
  const trendColor = trend ? (trend.clicksDelta > 5 ? "#4ade80" : trend.clicksDelta < -5 ? "#ef4444" : "#6b7280") : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-4">
        <div className="relative w-28 h-28 flex items-center justify-center flex-shrink-0">
          {!locked && (
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{ background: `radial-gradient(circle, ${color}18 0%, transparent 68%)`, animationDuration: "2.5s" }}
            />
          )}
          <svg className="absolute inset-0 rotate-[-90deg]" viewBox="0 0 100 100">
            <defs>
              <filter id="scoreGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
            {!locked && (
              <circle
                cx="50" cy="50" r={r} fill="none"
                stroke={color} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ - dash}
                filter="url(#scoreGlow)"
                style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}
              />
            )}
          </svg>
          <div
            className="text-center z-10"
            style={locked
              ? { opacity: 1 }
              : { opacity: numVisible ? 1 : 0, transform: numVisible ? "scale(1)" : "scale(0.8)", transition: "opacity 0.5s ease 0.9s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.9s" }
            }
          >
            <p className="text-2xl font-black leading-none" style={{ color: locked ? "#374151" : "white" }}>
              {locked ? "—" : score}
            </p>
            <p className="text-gray-600 text-xs">/{maxScore}</p>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-bold text-lg" style={{ color: locked ? "#374151" : "white" }}>Score SEO</p>
            {trendArrow && !locked && (
              <span className="text-xs font-black px-1.5 py-0.5 rounded-full" style={{ background: `${trendColor}20`, color: trendColor ?? undefined }}>
                {trendArrow} {trend && Math.abs(trend.clicksDelta) > 0 ? `${trend.clicksDelta > 0 ? "+" : ""}${trend.clicksDelta}%` : ""}
              </span>
            )}
          </div>
          <span
            className="relative inline-flex items-center overflow-hidden text-xs font-bold px-2.5 py-1 rounded-full mt-1"
            style={{ background: `${color}20`, color }}
          >
            {!locked && <span className="absolute inset-0 animate-[sweep_2.5s_ease-in-out_infinite]" style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />}
            {label}
          </span>
          {locked ? (
            <p className="text-gray-500 text-xs mt-2">Terminez le tutoriel pour débloquer</p>
          ) : !breakdown?.hasGsc ? (
            <p className="text-gray-500 text-xs mt-2">Connectez GSC pour le score complet</p>
          ) : (
            <p className="text-gray-500 text-xs mt-2">Basé sur GSC, cocon et contenu</p>
          )}
        </div>
      </div>

    </div>
  );
}
