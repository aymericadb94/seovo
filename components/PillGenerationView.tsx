"use client";

import { useEffect, useState, useRef } from "react";

type Step = {
  id: string;
  agent: string;
  label: string;
  sub: string;
};

type Props = {
  steps: Step[];
  currentStep: number;
  stepDetails: Record<number, string[]>;
  visibleDetails: Record<number, number>;
  elapsed: number;
  status: "generating" | "publishing";
  keyword: string;
  language: string;
  allDone: boolean;
};

export default function PillGenerationView({
  steps,
  currentStep,
  stepDetails,
  visibleDetails,
  elapsed,
  status,
  keyword,
  language,
  allDone,
}: Props) {
  const clampedStep = Math.min(currentStep, steps.length - 1);
  const pct = allDone ? 100 : Math.round((currentStep / steps.length) * 100);

  const activeDetails = stepDetails[clampedStep] ?? [];
  const activeVisibleCount = visibleDetails[clampedStep] ?? (allDone ? activeDetails.length : 0);

  // ── Step number flash overlay (brief, non-blocking) ──
  const [showFlash, setShowFlash] = useState(true);
  const [prevStep, setPrevStep] = useState(clampedStep);

  useEffect(() => {
    if (allDone) { setShowFlash(false); return; }
    if (clampedStep !== prevStep) {
      setPrevStep(clampedStep);
      setShowFlash(true);
      const t = setTimeout(() => setShowFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [clampedStep, prevStep, allDone]);

  // Initial flash
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || allDone) return;
    initialized.current = true;
    setShowFlash(true);
    const t = setTimeout(() => setShowFlash(false), 1200);
    return () => clearTimeout(t);
  }, [allDone]);

  // Green cascade
  const [greenIndex, setGreenIndex] = useState(-1);
  const [showFinalBurst, setShowFinalBurst] = useState(false);
  const cascadeStarted = useRef(false);

  useEffect(() => {
    if (allDone && !cascadeStarted.current) {
      cascadeStarted.current = true;
      for (let i = 0; i < steps.length; i++) {
        setTimeout(() => setGreenIndex(i), i * 150);
      }
      setTimeout(() => setShowFinalBurst(true), steps.length * 150 + 300);
    }
  }, [allDone, steps.length]);

  // Typewriter
  const [typedText, setTypedText] = useState("");
  const lastDetailRef = useRef("");

  useEffect(() => {
    if (allDone) return;
    const details = stepDetails[clampedStep] ?? [];
    const visCount = visibleDetails[clampedStep] ?? 0;
    const lastDetail = details[visCount - 1] ?? "";

    if (lastDetail !== lastDetailRef.current) {
      lastDetailRef.current = lastDetail;
      setTypedText("");
      let idx = 0;
      const interval = setInterval(() => {
        idx++;
        setTypedText(lastDetail.slice(0, idx));
        if (idx >= lastDetail.length) clearInterval(interval);
      }, 18);
      return () => clearInterval(interval);
    }
  }, [clampedStep, stepDetails, visibleDetails, allDone]);

  // Particles
  const particles = useRef(
    Array.from({ length: 32 }, (_, i) => ({
      angle: (i / 32) * 360,
      distance: 100 + Math.random() * 120,
      size: 2 + Math.random() * 5,
      delay: Math.random() * 0.4,
    }))
  );

  return (
    <div className="relative flex flex-col" style={{ minHeight: "calc(100vh - 180px)" }}>

      {/* ── Full console ── */}
      <div
        className="relative flex-1 flex flex-col overflow-hidden"
        style={{
          borderRadius: 16,
          background: "linear-gradient(180deg, rgba(10,10,10,0.98) 0%, rgba(4,4,4,0.99) 100%)",
          border: `1px solid ${allDone ? "rgba(34,197,94,0.25)" : "rgba(249,115,22,0.1)"}`,
          boxShadow: allDone
            ? "0 0 80px rgba(34,197,94,0.08), 0 4px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(34,197,94,0.08)"
            : "0 0 60px rgba(249,115,22,0.04), 0 4px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.03)",
          transition: "all 1s ease",
          minHeight: 480,
        }}
      >
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.012] rounded-2xl overflow-hidden" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 3px)",
        }} />

        {/* Corner glows */}
        <div className="absolute top-0 left-0 w-60 h-60 pointer-events-none rounded-tl-2xl overflow-hidden">
          <div className="w-full h-full transition-all duration-1000" style={{
            background: `radial-gradient(circle at 0% 0%, ${allDone ? "rgba(34,197,94,0.06)" : "rgba(249,115,22,0.04)"} 0%, transparent 70%)`,
          }} />
        </div>
        <div className="absolute bottom-0 right-0 w-60 h-60 pointer-events-none rounded-br-2xl overflow-hidden">
          <div className="w-full h-full transition-all duration-1000" style={{
            background: `radial-gradient(circle at 100% 100%, ${allDone ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.03)"} 0%, transparent 70%)`,
          }} />
        </div>

        {/* ── Top bar ── */}
        <div className="relative z-10 flex items-center px-5 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${allDone ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)"}` }}>
          <div className="flex gap-2 mr-4">
            <div className="w-3 h-3 rounded-full transition-all duration-500" style={{
              background: allDone ? "#22c55e" : "#f97316",
              boxShadow: `0 0 8px ${allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.5)"}`,
              animation: "dotGlow 2s ease-in-out infinite",
            }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] font-bold truncate transition-colors duration-500" style={{ color: allDone ? "#22c55e" : "#fb923c" }}>
              {keyword}
            </span>
            <span className="text-gray-700 text-[10px]">·</span>
            <span className="text-gray-600 text-[10px]">{language}</span>
          </div>
          <div className="flex items-center gap-3 ml-4 flex-shrink-0">
            <span className="text-[10px] font-mono tabular-nums transition-colors duration-500" style={{ color: allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.4)" }}>
              {pct}%
            </span>
            <div className="h-3 w-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="font-black text-xs tabular-nums transition-colors duration-500" style={{ color: allDone ? "#22c55e" : "#f97316" }}>
              {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* ── Step pills ── */}
        <div className="relative z-10 flex items-center gap-2 px-5 py-2.5 flex-shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
          {steps.map((step, i) => {
            const isDone = i < currentStep;
            const isActive = i === clampedStep && !allDone;
            const isCompleteGreen = allDone && greenIndex >= i;

            return (
              <div
                key={step.id}
                className="relative flex items-center gap-1.5 overflow-hidden flex-shrink-0"
                style={{
                  height: 28,
                  paddingLeft: 8,
                  paddingRight: (isActive || isDone || isCompleteGreen) ? 12 : 8,
                  borderRadius: 14,
                  background: isCompleteGreen
                    ? "rgba(34,197,94,0.12)"
                    : isActive ? "rgba(249,115,22,0.1)"
                    : isDone ? "rgba(249,115,22,0.05)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isCompleteGreen
                    ? "rgba(34,197,94,0.35)"
                    : isActive ? "rgba(249,115,22,0.4)"
                    : isDone ? "rgba(249,115,22,0.15)"
                    : "rgba(255,255,255,0.04)"
                  }`,
                  boxShadow: isActive
                    ? "0 0 16px rgba(249,115,22,0.12)"
                    : isCompleteGreen ? "0 0 10px rgba(34,197,94,0.08)"
                    : "none",
                  transition: "all 0.5s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                {/* Active sweep */}
                {isActive && (
                  <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                    background: "linear-gradient(90deg, rgba(249,115,22,0.12), transparent)",
                    animation: "pillSweep 2.5s ease-in-out infinite",
                  }} />
                )}
                {/* Green flash */}
                {allDone && greenIndex === i && (
                  <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                    background: "rgba(34,197,94,0.4)",
                    animation: "pillFlash 0.4s ease-out forwards",
                  }} />
                )}

                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center relative z-10">
                  {isDone || isCompleteGreen ? (
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" style={{
                      stroke: isCompleteGreen ? "#22c55e" : "#fb923c",
                    }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isActive ? (
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="rgba(249,115,22,0.15)" strokeWidth="2" />
                      <path d="M12 3a9 9 0 019 9" stroke="#fb923c" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="text-[8px] font-black text-gray-600">{i + 1}</span>
                  )}
                </span>

                {(isActive || isDone || isCompleteGreen) && (
                  <span className="text-[10px] font-bold truncate relative z-10 transition-all duration-300" style={{
                    color: isCompleteGreen ? "#22c55e" : isActive ? "#fff" : "#fb923c",
                    maxWidth: isActive ? 90 : 70,
                  }}>
                    {step.id === "intent" ? "Intention"
                      : step.id === "serp" ? "SERP"
                      : step.id === "diff" ? "Diff"
                      : step.id === "structure" ? "Structure"
                      : step.id === "content" ? "Rédaction"
                      : step.id === "linking" ? "Maillage"
                      : step.id === "risk" ? "Risques"
                      : step.id === "ctr" ? "CTR"
                      : step.id}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Main content ── */}
        <div className="relative z-10 flex-1 flex flex-col px-6 py-5 overflow-hidden">

          {/* Burst particles */}
          {showFinalBurst && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {particles.current.map((p, i) => {
                const rad = (p.angle * Math.PI) / 180;
                return (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: p.size, height: p.size,
                      background: "#22c55e",
                      boxShadow: "0 0 8px rgba(34,197,94,0.7)",
                      animation: `particleBurst 1.2s ease-out ${p.delay}s forwards`,
                      ["--tx" as string]: `${Math.cos(rad) * p.distance}px`,
                      ["--ty" as string]: `${Math.sin(rad) * p.distance}px`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {allDone ? (
            /* ── Success ── */
            <div className="flex-1 flex flex-col items-center justify-center gap-4" style={{ animation: "successReveal 0.8s cubic-bezier(0.16,1,0.3,1)" }}>
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{
                background: "rgba(34,197,94,0.1)", border: "2px solid rgba(34,197,94,0.3)",
                boxShadow: "0 0 40px rgba(34,197,94,0.15)",
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10" style={{
                  strokeDasharray: 30, strokeDashoffset: 30, animation: "drawCheck 0.6s ease-out 0.4s forwards",
                }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-green-400 font-black text-lg">
                {status === "publishing" ? "Publication en cours..." : "Article prêt"}
              </p>
              <p className="text-gray-600 text-sm">
                {status === "publishing" ? "Envoi vers votre CMS" : "Tous les agents ont terminé"}
              </p>
            </div>
          ) : (
            /* ── Active generation ── */
            <div className="flex-1 flex flex-col relative">

              {/* Step number flash overlay — appears briefly then fades, doesn't block content */}
              {showFlash && (
                <div
                  className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
                  key={`flash-${clampedStep}`}
                  style={{ animation: "numberFlash 1.2s ease-out forwards" }}
                >
                  <div className="relative flex items-baseline">
                    {/* Ripples */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full" style={{
                      border: "2px solid rgba(249,115,22,0.3)",
                      animation: "rippleOut 0.8s ease-out forwards",
                    }} />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full" style={{
                      border: "1px solid rgba(249,115,22,0.2)",
                      animation: "rippleOut 0.8s ease-out 0.15s forwards",
                    }} />
                    <span className="font-black tabular-nums" style={{
                      fontSize: 72,
                      color: "#f97316",
                      textShadow: "0 0 60px rgba(249,115,22,0.5), 0 0 120px rgba(249,115,22,0.2)",
                      lineHeight: 1,
                    }}>
                      {currentStep + 1}
                    </span>
                    <span className="font-bold text-gray-700 ml-1" style={{ fontSize: 32 }}>/{steps.length}</span>
                  </div>
                </div>
              )}

              {/* Step label header — always visible */}
              <div className="flex items-center gap-3 mb-5" style={{ animation: showFlash ? "none" : `fadeSlideDown 0.4s ease-out` }} key={`header-${clampedStep}`}>
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{
                  background: "#f97316",
                  boxShadow: "0 0 10px rgba(249,115,22,0.6)",
                  animation: "dotGlow 2s ease-in-out infinite",
                }} />
                <h3 className="text-base font-black text-white tracking-tight">
                  {steps[clampedStep]?.label}
                </h3>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(249,115,22,0.2), transparent)" }} />
                <span className="text-[10px] font-mono text-gray-700 flex-shrink-0">
                  étape {currentStep + 1}/{steps.length}
                </span>
              </div>

              {/* Detail lines — always visible, grow as they appear */}
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(249,115,22,0.2) transparent" }}>
                {activeDetails.slice(0, Math.max(0, activeVisibleCount - 1)).map((d, j) => (
                  <div
                    key={`${clampedStep}-done-${j}`}
                    className="flex items-start gap-3"
                    style={{ animation: `lineReveal 0.4s ease-out` }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5" style={{
                      background: "rgba(34,197,94,0.08)",
                      border: "1px solid rgba(34,197,94,0.2)",
                    }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-[13px] font-mono leading-relaxed text-gray-500 pt-0.5">{d}</span>
                  </div>
                ))}

                {/* Current line — typewriter */}
                {typedText && (
                  <div
                    className="flex items-start gap-3"
                    key={`${clampedStep}-typing-${activeVisibleCount}`}
                    style={{ animation: "lineReveal 0.3s ease-out" }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5" style={{
                      background: "rgba(249,115,22,0.08)",
                      border: "1px solid rgba(249,115,22,0.3)",
                      animation: "activeDot 1.5s ease-in-out infinite",
                    }}>
                      <span className="text-[8px] font-black text-orange-400">▸</span>
                    </div>
                    <span className="text-[13px] font-mono leading-relaxed text-white/90 pt-0.5">
                      {typedText}
                      <span
                        className="inline-block w-[7px] h-[15px] ml-0.5 rounded-[1px]"
                        style={{
                          background: "linear-gradient(180deg, #f97316, #ef4444)",
                          verticalAlign: "text-bottom",
                          animation: "cursorBlink 1s step-end infinite",
                          boxShadow: "0 0 10px rgba(249,115,22,0.6)",
                        }}
                      />
                    </span>
                  </div>
                )}

                {/* Empty state while waiting for first detail */}
                {activeVisibleCount === 0 && !typedText && !showFlash && (
                  <div className="flex items-center gap-3" style={{ animation: "fadeIn 0.5s ease-out" }}>
                    <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{
                      background: "rgba(249,115,22,0.08)",
                      border: "1px solid rgba(249,115,22,0.2)",
                    }}>
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="rgba(249,115,22,0.15)" strokeWidth="2" />
                        <path d="M12 3a9 9 0 019 9" stroke="#fb923c" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <span className="text-[13px] font-mono text-gray-700">Analyse en cours...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom bar ── */}
        <div className="relative z-10 flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
          <div className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500" style={{
            background: allDone ? "#22c55e" : "#f97316",
            boxShadow: `0 0 6px ${allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.5)"}`,
            animation: "dotGlow 2s ease-in-out infinite",
          }} />
          <span className="text-[10px] font-mono text-gray-600 flex-1">
            {allDone
              ? "Tous les agents ont terminé"
              : status === "publishing"
              ? "Publication en cours..."
              : `${steps[clampedStep]?.sub}`
            }
          </span>
          <div className="w-32 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{
              width: `${pct}%`,
              background: allDone ? "linear-gradient(90deg, #22c55e, #16a34a)" : "linear-gradient(90deg, #f97316, #ef4444)",
              boxShadow: allDone ? "0 0 8px rgba(34,197,94,0.5)" : "0 0 8px rgba(249,115,22,0.5)",
            }} />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pillSweep {
          0% { clip-path: inset(0 100% 0 0); }
          50% { clip-path: inset(0 0 0 0); }
          100% { clip-path: inset(0 0 0 100%); }
        }
        @keyframes pillFlash {
          0% { opacity: 0.6; }
          100% { opacity: 0; }
        }
        @keyframes numberFlash {
          0% { opacity: 0; transform: scale(0.3); filter: blur(10px); }
          25% { opacity: 1; transform: scale(1.05); filter: blur(0); }
          70% { opacity: 1; transform: scale(1); filter: blur(0); }
          100% { opacity: 0; transform: scale(1.1); filter: blur(4px); }
        }
        @keyframes rippleOut {
          0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
        }
        @keyframes fadeSlideDown {
          0% { opacity: 0; transform: translateY(-8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes lineReveal {
          0% { opacity: 0; transform: translateX(-10px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes dotGlow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes activeDot {
          0%, 100% { box-shadow: 0 0 4px rgba(249,115,22,0.2); }
          50% { box-shadow: 0 0 12px rgba(249,115,22,0.5); }
        }
        @keyframes particleBurst {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
        @keyframes successReveal {
          0% { opacity: 0; transform: scale(0.7); filter: blur(8px); }
          100% { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @keyframes greenFlash {
          0% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.8); }
        }
      `}</style>
    </div>
  );
}
