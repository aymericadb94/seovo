"use client";

import { useState, useEffect, useRef } from "react";

export default function CountdownTimer({ targetIso }: { targetIso: string | null }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const [time, setTime] = useState({ h: 0, m: 0, s: 0, ms: 0 });
  const [glow, setGlow] = useState(false);
  const prevSec = useRef(-1);
  const totalDurationRef = useRef(0);

  useEffect(() => {
    if (targetIso) {
      const initial = new Date(targetIso).getTime() - Date.now();
      if (initial > 0) totalDurationRef.current = initial;
    }
    function calc() {
      if (!targetIso) { setTime({ h: 0, m: 0, s: 0, ms: 0 }); return; }
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setTime({ h: 0, m: 0, s: 0, ms: 0 }); return; }
      const totalH = Math.floor(diff / 3600000);
      const s = Math.floor((diff % 60000) / 1000);
      if (s !== prevSec.current) {
        prevSec.current = s;
        setGlow(true);
        setTimeout(() => setGlow(false), 180);
      }
      setTime({ h: Math.min(totalH, 23), m: Math.floor((diff % 3600000) / 60000), s, ms: diff });
    }
    calc();
    const id = setInterval(calc, 250);
    return () => clearInterval(id);
  }, [targetIso]);

  const hasTime = time.ms > 0 && targetIso;
  // Use the actual initial duration for progress, fallback to 24h
  const total = totalDurationRef.current > 0 ? totalDurationRef.current : 24 * 60 * 60 * 1000;
  const remaining = time.ms;
  const elapsed = total - remaining;
  const progress = hasTime ? Math.max(2, Math.min(98, (elapsed / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-4 w-full">
      {hasTime ? (
        <div className="flex items-start">
          {([
            { val: pad(time.h), label: "heure" },
            { val: pad(time.m), label: "min" },
            { val: pad(time.s), label: "sec" },
          ] as const).map(({ val, label }, i) => (
            <div key={label} className="flex items-start">
              {i > 0 && (
                <span className="font-black select-none" style={{ fontSize: "2.4rem", lineHeight: 1, margin: "0 3px", color: "rgba(249,115,22,0.3)", animation: "colonPulse 1s ease-in-out infinite" }}>:</span>
              )}
              <div className="flex flex-col items-center" style={{ minWidth: 50 }}>
                <span className="font-black tabular-nums leading-none" style={{ fontSize: "2.6rem", color: "white", textShadow: label === "sec" && glow ? "0 0 24px rgba(249,115,22,0.9), 0 0 8px rgba(249,115,22,0.6)" : "0 0 12px rgba(255,255,255,0.06)", transition: "text-shadow 0.18s ease" }}>{val}</span>
                <span className="uppercase tracking-widest font-bold" style={{ fontSize: "0.6rem", color: "rgba(249,115,22,0.45)", marginTop: 5 }}>{label}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-2xl font-black text-white">Très prochainement</p>
      )}
      <div className="relative" style={{ height: 6 }}>
        <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg, rgba(249,115,22,0.25) 0%, #f97316 100%)", transition: "width 1s linear" }} />
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: `clamp(3px, calc(${progress}% - 3px), calc(100% - 3px))`, width: 12, height: 12, borderRadius: "50%", background: "radial-gradient(circle, #fff 10%, #f97316 70%)", boxShadow: "0 0 12px 4px rgba(249,115,22,0.65), 0 0 4px 1px rgba(255,200,100,0.4)", transition: "left 1s linear" }} />
      </div>
      <style>{`@keyframes colonPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.15; } }`}</style>
    </div>
  );
}
