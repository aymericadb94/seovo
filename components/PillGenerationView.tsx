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

  // Active step details
  const activeDetails = stepDetails[clampedStep] ?? [];
  const activeVisibleCount = visibleDetails[clampedStep] ?? (allDone ? activeDetails.length : 0);

  // ── Console animation phases ──
  const [consolePhase, setConsolePhase] = useState<"number" | "label" | "details">("number");
  const [prevStep, setPrevStep] = useState(clampedStep);

  useEffect(() => {
    if (allDone) return;
    if (clampedStep !== prevStep) {
      setPrevStep(clampedStep);
      setConsolePhase("number");
      const t1 = setTimeout(() => setConsolePhase("label"), 700);
      const t2 = setTimeout(() => setConsolePhase("details"), 1600);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [clampedStep, prevStep, allDone]);

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || allDone) return;
    initialized.current = true;
    setConsolePhase("number");
    const t1 = setTimeout(() => setConsolePhase("label"), 700);
    const t2 = setTimeout(() => setConsolePhase("details"), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [allDone]);

  // Green cascade animation
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
    if (allDone || consolePhase !== "details") return;
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
  }, [clampedStep, stepDetails, visibleDetails, allDone, consolePhase]);

  // Particles
  const particles = useRef(
    Array.from({ length: 32 }, (_, i) => ({
      angle: (i / 32) * 360,
      distance: 100 + Math.random() * 120,
      size: 2 + Math.random() * 5,
      delay: Math.random() * 0.4,
    }))
  );

  // Matrix rain characters for background
  const matrixCols = useRef(
    Array.from({ length: 20 }, () => ({
      x: Math.random() * 100,
      speed: 0.5 + Math.random() * 1.5,
      chars: Array.from({ length: 8 }, () =>
        String.fromCharCode(0x30A0 + Math.random() * 96)
      ),
      delay: Math.random() * 5,
    }))
  );

  return (
    <div className="relative flex flex-col" style={{ minHeight: "calc(100vh - 180px)" }}>

      {/* ── Full-width console ── */}
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
          minHeight: 500,
        }}
      >
        {/* Scanlines */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] rounded-2xl overflow-hidden" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 3px)",
        }} />

        {/* Matrix rain background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl opacity-[0.04]">
          {matrixCols.current.map((col, i) => (
            <div
              key={i}
              className="absolute text-[10px] font-mono leading-tight"
              style={{
                left: `${col.x}%`,
                top: -20,
                color: allDone ? "#22c55e" : "#f97316",
                animation: `matrixFall ${8 / col.speed}s linear ${col.delay}s infinite`,
                writingMode: "vertical-rl",
              }}
            >
              {col.chars.join("")}
            </div>
          ))}
        </div>

        {/* Ambient corner glows */}
        <div className="absolute top-0 left-0 w-48 h-48 pointer-events-none rounded-tl-2xl overflow-hidden">
          <div className="w-full h-full" style={{
            background: `radial-gradient(circle at 0% 0%, ${allDone ? "rgba(34,197,94,0.06)" : "rgba(249,115,22,0.04)"} 0%, transparent 70%)`,
            transition: "all 1s ease",
          }} />
        </div>
        <div className="absolute bottom-0 right-0 w-48 h-48 pointer-events-none rounded-br-2xl overflow-hidden">
          <div className="w-full h-full" style={{
            background: `radial-gradient(circle at 100% 100%, ${allDone ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.03)"} 0%, transparent 70%)`,
            transition: "all 1s ease",
          }} />
        </div>

        {/* ── Top bar ── */}
        <div className="relative z-10 flex items-center px-5 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${allDone ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)"}` }}>
          {/* Traffic lights */}
          <div className="flex gap-2 mr-4">
            <div className="w-3 h-3 rounded-full transition-all duration-500" style={{
              background: allDone ? "#22c55e" : "#f97316",
              boxShadow: `0 0 8px ${allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.5)"}`,
              animation: "trafficPulse 2s ease-in-out infinite",
            }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Keyword + language */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] font-bold truncate transition-colors duration-500" style={{ color: allDone ? "#22c55e" : "#fb923c" }}>
              {keyword}
            </span>
            <span className="text-gray-700 text-[10px]">·</span>
            <span className="text-gray-600 text-[10px]">{language}</span>
          </div>

          {/* Timer + percentage */}
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

        {/* ── Step pills bar ── */}
        <div className="relative z-10 flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ borderBottom: `1px solid rgba(255,255,255,0.02)` }}>
          {steps.map((step, i) => {
            const isDone = i < currentStep;
            const isActive = i === clampedStep && !allDone;
            const isCompleteGreen = allDone && greenIndex >= i;

            return (
              <div
                key={step.id}
                className="relative flex items-center gap-1.5 overflow-hidden flex-shrink-0"
                style={{
                  height: 30,
                  paddingLeft: 8,
                  paddingRight: isActive ? 14 : 10,
                  borderRadius: 15,
                  background: isCompleteGreen
                    ? "rgba(34,197,94,0.12)"
                    : isActive
                    ? "rgba(249,115,22,0.1)"
                    : isDone
                    ? "rgba(249,115,22,0.05)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isCompleteGreen
                    ? "rgba(34,197,94,0.35)"
                    : isActive
                    ? "rgba(249,115,22,0.4)"
                    : isDone
                    ? "rgba(249,115,22,0.15)"
                    : "rgba(255,255,255,0.04)"
                  }`,
                  boxShadow: isActive
                    ? "0 0 20px rgba(249,115,22,0.15)"
                    : isCompleteGreen
                    ? "0 0 12px rgba(34,197,94,0.1)"
                    : "none",
                  transition: "all 0.5s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                {/* Active fill sweep */}
                {isActive && (
                  <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                    background: "linear-gradient(90deg, rgba(249,115,22,0.15), transparent)",
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

                {/* Icon */}
                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center relative z-10">
                  {isDone || isCompleteGreen ? (
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" style={{
                      stroke: isCompleteGreen ? "#22c55e" : "#fb923c",
                      ...(isDone && !allDone ? { strokeDasharray: 30, strokeDashoffset: 0, animation: "none" } : {}),
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

                {/* Label — only show on active + done */}
                {(isActive || isDone || isCompleteGreen) && (
                  <span
                    className="text-[10px] font-bold truncate relative z-10 transition-all duration-300"
                    style={{
                      color: isCompleteGreen ? "#22c55e" : isActive ? "#fff" : "#fb923c",
                      maxWidth: isActive ? 80 : 60,
                    }}
                  >
                    {step.label.split(" ")[0]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Main content area ── */}
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center px-6 py-6 overflow-hidden">

          {/* Final burst particles */}
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
            <div className="flex flex-col items-center gap-4" style={{ animation: "successReveal 0.8s cubic-bezier(0.16,1,0.3,1)" }}>
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{
                background: "rgba(34,197,94,0.1)",
                border: "2px solid rgba(34,197,94,0.3)",
                boxShadow: "0 0 40px rgba(34,197,94,0.15)",
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-10 h-10" style={{
                  strokeDasharray: 30, strokeDashoffset: 30,
                  animation: "drawCheck 0.6s ease-out 0.4s forwards",
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
            <div className="w-full max-w-lg flex flex-col items-center relative" style={{ minHeight: 240 }}>

              {/* Phase 1: Number */}
              {consolePhase === "number" && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  key={`num-${clampedStep}`}
                  style={{ animation: "numberExplode 0.7s cubic-bezier(0.16,1,0.3,1)" }}
                >
                  {/* Ripple rings behind number */}
                  <div className="absolute w-32 h-32 rounded-full" style={{
                    border: "1px solid rgba(249,115,22,0.2)",
                    animation: "rippleOut 0.8s ease-out forwards",
                  }} />
                  <div className="absolute w-32 h-32 rounded-full" style={{
                    border: "1px solid rgba(249,115,22,0.15)",
                    animation: "rippleOut 0.8s ease-out 0.15s forwards",
                  }} />
                  <div className="absolute w-32 h-32 rounded-full" style={{
                    border: "1px solid rgba(249,115,22,0.1)",
                    animation: "rippleOut 0.8s ease-out 0.3s forwards",
                  }} />
                  <div className="flex items-baseline">
                    <span className="font-black tabular-nums" style={{
                      fontSize: 80,
                      color: "#f97316",
                      textShadow: "0 0 60px rgba(249,115,22,0.5), 0 0 120px rgba(249,115,22,0.2)",
                      lineHeight: 1,
                    }}>
                      {currentStep + 1}
                    </span>
                    <span className="font-bold text-gray-700 ml-1" style={{ fontSize: 36 }}>/{steps.length}</span>
                  </div>
                </div>
              )}

              {/* Phase 2: Label */}
              {consolePhase === "label" && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                  key={`label-${clampedStep}`}
                  style={{ animation: "labelReveal 0.6s cubic-bezier(0.16,1,0.3,1)" }}
                >
                  {/* Decorative line */}
                  <div className="w-12 h-px" style={{
                    background: "linear-gradient(90deg, transparent, #f97316, transparent)",
                    animation: "lineExpand 0.5s ease-out 0.1s both",
                  }} />
                  <h3 className="font-black text-white text-2xl tracking-tight text-center leading-tight max-w-sm">
                    {steps[clampedStep]?.label}
                  </h3>
                  <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-orange-400/40">
                    Étape {currentStep + 1} sur {steps.length}
                  </p>
                  {/* Decorative line */}
                  <div className="w-12 h-px" style={{
                    background: "linear-gradient(90deg, transparent, #f97316, transparent)",
                    animation: "lineExpand 0.5s ease-out 0.2s both",
                  }} />
                </div>
              )}

              {/* Phase 3: Details terminal */}
              {consolePhase === "details" && (
                <div
                  className="w-full flex flex-col"
                  key={`details-${clampedStep}`}
                  style={{ animation: "terminalSlideIn 0.5s cubic-bezier(0.16,1,0.3,1)" }}
                >
                  {/* Mini step label */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                      background: "#f97316",
                      boxShadow: "0 0 8px rgba(249,115,22,0.6)",
                      animation: "dotPulse 2s ease-in-out infinite",
                    }} />
                    <span className="text-xs font-bold text-orange-400/80 uppercase tracking-wider">
                      {steps[clampedStep]?.label}
                    </span>
                    <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(249,115,22,0.15), transparent)" }} />
                    <span className="text-[10px] font-mono text-gray-700">
                      {currentStep + 1}/{steps.length}
                    </span>
                  </div>

                  {/* Detail lines */}
                  <div className="flex flex-col gap-2.5 pl-1">
                    {activeDetails.slice(0, Math.max(0, activeVisibleCount - 1)).map((d, j) => (
                      <div
                        key={`${clampedStep}-${j}`}
                        className="flex items-start gap-3"
                        style={{ animation: `lineReveal 0.4s ease-out ${j * 0.05}s both` }}
                      >
                        <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{
                          background: "rgba(34,197,94,0.1)",
                          border: "1px solid rgba(34,197,94,0.2)",
                        }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                        <span className="text-sm font-mono leading-relaxed text-gray-500">{d}</span>
                      </div>
                    ))}

                    {/* Current line — typewriter */}
                    {typedText && (
                      <div
                        className="flex items-start gap-3"
                        style={{ animation: "lineReveal 0.3s ease-out" }}
                      >
                        <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5" style={{
                          background: "rgba(249,115,22,0.1)",
                          border: "1px solid rgba(249,115,22,0.3)",
                          animation: "activeDotPulse 1.5s ease-in-out infinite",
                        }}>
                          <span className="text-[8px] font-black text-orange-400">▸</span>
                        </div>
                        <span className="text-sm font-mono leading-relaxed text-white/90">
                          {typedText}
                          <span
                            className="inline-block w-[7px] h-[16px] ml-0.5 rounded-[1px]"
                            style={{
                              background: "linear-gradient(180deg, #f97316, #ef4444)",
                              verticalAlign: "text-bottom",
                              animation: "cursorBlink 1s step-end infinite",
                              boxShadow: "0 0 10px rgba(249,115,22,0.7)",
                            }}
                          />
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom bar ── */}
        <div className="relative z-10 flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderTop: `1px solid rgba(255,255,255,0.03)` }}>
          {/* Status dot */}
          <div className="w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500" style={{
            background: allDone ? "#22c55e" : "#f97316",
            boxShadow: `0 0 6px ${allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.5)"}`,
            animation: "dotPulse 2s ease-in-out infinite",
          }} />

          {/* Status text */}
          <span className="text-[10px] font-mono text-gray-600 flex-1">
            {allDone
              ? "Tous les agents ont terminé"
              : status === "publishing"
              ? "Publication en cours..."
              : `Agent ${steps[clampedStep]?.id} en cours d'exécution...`
            }
          </span>

          {/* Progress bar */}
          <div className="w-32 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${pct}%`,
                background: allDone
                  ? "linear-gradient(90deg, #22c55e, #16a34a)"
                  : "linear-gradient(90deg, #f97316, #ef4444)",
                boxShadow: allDone ? "0 0 8px rgba(34,197,94,0.5)" : "0 0 8px rgba(249,115,22,0.5)",
              }}
            />
          </div>
        </div>
      </div>

      {/* CSS Animations */}
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
        @keyframes numberExplode {
          0% { opacity: 0; transform: scale(0.2) rotate(-10deg); filter: blur(12px); }
          50% { opacity: 1; transform: scale(1.08) rotate(0deg); filter: blur(0); }
          100% { opacity: 1; transform: scale(1) rotate(0deg); filter: blur(0); }
        }
        @keyframes rippleOut {
          0% { transform: scale(0.3); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes labelReveal {
          0% { opacity: 0; transform: translateY(30px) scale(0.95); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes lineExpand {
          0% { width: 0; opacity: 0; }
          100% { width: 48px; opacity: 1; }
        }
        @keyframes terminalSlideIn {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes lineReveal {
          0% { opacity: 0; transform: translateX(-12px); }
          100% { opacity: 1; transform: translateX(0); }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px currentColor; }
          50% { opacity: 0.5; box-shadow: 0 0 12px currentColor; }
        }
        @keyframes activeDotPulse {
          0%, 100% { box-shadow: 0 0 4px rgba(249,115,22,0.3); }
          50% { box-shadow: 0 0 12px rgba(249,115,22,0.6); }
        }
        @keyframes trafficPulse {
          0%, 100% { box-shadow: 0 0 6px currentColor; }
          50% { box-shadow: 0 0 14px currentColor; }
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
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes matrixFall {
          0% { transform: translateY(-100%); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(calc(100vh)); opacity: 0; }
        }
        @keyframes greenFlash {
          0% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.8); }
        }
      `}</style>
    </div>
  );
}
