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
  const orbitRadius = 170;
  const cx = orbitRadius + 80;
  const cy = orbitRadius + 80;
  const viewBox = `0 0 ${cx * 2} ${cy * 2}`;

  // Active step details
  const activeDetails = stepDetails[clampedStep] ?? [];
  const activeVisibleCount = visibleDetails[clampedStep] ?? (allDone ? activeDetails.length : 0);

  // Green cascade animation
  const [greenIndex, setGreenIndex] = useState(-1);
  const [showFinalBurst, setShowFinalBurst] = useState(false);
  const cascadeStarted = useRef(false);

  useEffect(() => {
    if (allDone && !cascadeStarted.current) {
      cascadeStarted.current = true;
      // Cascade: each pill turns green one by one
      for (let i = 0; i < steps.length; i++) {
        setTimeout(() => setGreenIndex(i), i * 120);
      }
      // Final burst after all pills are green
      setTimeout(() => setShowFinalBurst(true), steps.length * 120 + 200);
    }
  }, [allDone, steps.length]);

  // Typewriter for center details
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
      }, 15);
      return () => clearInterval(interval);
    }
  }, [clampedStep, stepDetails, visibleDetails, allDone]);

  // Particles for final burst
  const particles = useRef(
    Array.from({ length: 24 }, (_, i) => ({
      angle: (i / 24) * 360,
      distance: 80 + Math.random() * 60,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 0.3,
    }))
  );

  return (
    <div className="relative flex flex-col items-center" style={{ minHeight: "calc(100vh - 200px)" }}>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full transition-all duration-1000"
          style={{ background: `radial-gradient(circle, ${allDone ? "rgba(34,197,94,0.1)" : "rgba(249,115,22,0.08)"} 0%, transparent 60%)` }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full mb-4">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: allDone ? "rgba(34,197,94,0.3)" : "rgba(249,115,22,0.2)", animationDuration: "2s" }} />
            <div className="w-4 h-4 rounded-full transition-colors duration-500" style={{ background: allDone ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: `0 0 12px ${allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.5)"}` }} />
          </div>
          <div>
            <h2 className="text-white font-black text-sm tracking-tight">
              {allDone ? "Finalisation" : status === "publishing" ? "Publication" : "Génération"} en cours
            </h2>
            <p className="text-gray-600 text-[11px]">
              <span className="text-orange-400 font-bold">{keyword}</span> · {language}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-orange-400/60 text-[10px]">{pct}%</span>
          <span className="text-gray-600">|</span>
          <span className="text-orange-400 font-black text-xs tabular-nums">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}</span>
        </div>
      </div>

      {/* ── Orbital pill ring ── */}
      <div className="relative z-10 flex items-center justify-center" style={{ width: cx * 2, height: cy * 2, maxWidth: "100%" }}>

        {/* SVG orbit track + progress arc */}
        <svg className="absolute inset-0 w-full h-full" viewBox={viewBox}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={orbitRadius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          {/* Progress arc */}
          <circle
            cx={cx} cy={cy} r={orbitRadius}
            fill="none" stroke={allDone ? "url(#pillGradGreen)" : "url(#pillGradOrange)"} strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * orbitRadius}`}
            strokeDashoffset={`${2 * Math.PI * orbitRadius * (1 - pct / 100)}`}
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)", transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
          />
          {/* Beam from active pill to center */}
          {!allDone && (() => {
            const angle = (clampedStep / steps.length) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const px = cx + Math.cos(rad) * orbitRadius;
            const py = cy + Math.sin(rad) * orbitRadius;
            return (
              <line
                x1={px} y1={py} x2={cx} y2={cy}
                stroke="url(#beamGrad)" strokeWidth="1"
                style={{ transition: "all 0.8s cubic-bezier(0.34,1.56,0.64,1)" }}
              />
            );
          })()}
          <defs>
            <linearGradient id="pillGradOrange" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <linearGradient id="pillGradGreen" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#16a34a" />
            </linearGradient>
            <linearGradient id="beamGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(249,115,22,0.4)" />
              <stop offset="100%" stopColor="rgba(249,115,22,0)" />
            </linearGradient>
          </defs>
        </svg>

        {/* Pill nodes */}
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isActive = i === clampedStep && !allDone;
          const isGreen = greenIndex >= i;
          const angle = (i / steps.length) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x = Math.cos(rad) * orbitRadius;
          const y = Math.sin(rad) * orbitRadius;

          // Pill dimensions
          const pillW = isActive ? 120 : 100;
          const pillH = isActive ? 38 : 32;

          // Determine pill state colors
          const isCompleteGreen = allDone && isGreen;
          const bgColor = isCompleteGreen
            ? "rgba(34,197,94,0.15)"
            : isDone
            ? "rgba(249,115,22,0.1)"
            : isActive
            ? "rgba(249,115,22,0.15)"
            : "rgba(255,255,255,0.02)";
          const borderColor = isCompleteGreen
            ? "rgba(34,197,94,0.5)"
            : isDone
            ? "rgba(249,115,22,0.3)"
            : isActive
            ? "rgba(249,115,22,0.6)"
            : "rgba(255,255,255,0.06)";
          const textColor = isCompleteGreen
            ? "#22c55e"
            : isDone
            ? "#fb923c"
            : isActive
            ? "#fff"
            : "#4b5563";
          const glowShadow = isActive
            ? "0 0 20px rgba(249,115,22,0.3), 0 0 40px rgba(249,115,22,0.1)"
            : isCompleteGreen
            ? "0 0 15px rgba(34,197,94,0.2)"
            : "none";

          return (
            <div
              key={step.id}
              className="absolute flex items-center justify-center"
              style={{
                left: `calc(50% + ${x}px - ${pillW / 2}px)`,
                top: `calc(50% + ${y}px - ${pillH / 2}px)`,
                width: pillW,
                height: pillH,
                zIndex: isActive ? 20 : 5,
                transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              {/* Active pulse */}
              {isActive && (
                <div className="absolute inset-[-4px] rounded-full opacity-50" style={{ border: "1px solid rgba(249,115,22,0.3)", animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite" }} />
              )}

              {/* Green flash on cascade */}
              {allDone && greenIndex === i && (
                <div className="absolute inset-[-6px] rounded-full" style={{ background: "rgba(34,197,94,0.4)", animation: "greenFlash 0.5s ease-out forwards" }} />
              )}

              {/* Pill shape */}
              <div
                className="w-full h-full rounded-full flex items-center gap-2 px-3 overflow-hidden"
                style={{
                  background: bgColor,
                  border: `1.5px solid ${borderColor}`,
                  boxShadow: glowShadow,
                  transition: "all 0.5s ease",
                }}
              >
                {/* Fill animation for active pill */}
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: "linear-gradient(90deg, rgba(249,115,22,0.2), rgba(249,115,22,0.05))",
                      transformOrigin: "left",
                      animation: "pillFill 3s ease-in-out infinite",
                    }}
                  />
                )}

                {/* Icon / check */}
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center relative z-10" style={{ color: textColor }}>
                  {isDone || isCompleteGreen ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isActive ? (
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                      <path d="M12 3a9 9 0 019 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="text-[9px] font-black">{i + 1}</span>
                  )}
                </span>

                {/* Agent name */}
                <span
                  className="text-[10px] font-bold truncate relative z-10 transition-colors duration-300"
                  style={{ color: textColor }}
                >
                  {step.agent}
                </span>
              </div>
            </div>
          );
        })}

        {/* ── Center screen (arrondi) ── */}
        <div
          className="absolute z-30 flex flex-col items-center justify-center text-center overflow-hidden"
          style={{
            width: orbitRadius * 1.3,
            height: orbitRadius * 1.3,
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(10,10,10,0.95) 0%, rgba(5,5,5,0.98) 100%)",
            border: `2px solid ${allDone ? "rgba(34,197,94,0.25)" : "rgba(249,115,22,0.15)"}`,
            boxShadow: allDone
              ? "inset 0 0 60px rgba(34,197,94,0.05), 0 0 40px rgba(34,197,94,0.08)"
              : "inset 0 0 60px rgba(249,115,22,0.03), 0 0 30px rgba(249,115,22,0.05)",
            transition: "all 0.8s ease",
          }}
        >
          {/* Scanlines overlay */}
          <div className="absolute inset-0 pointer-events-none rounded-full opacity-[0.03]" style={{
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 3px)",
          }} />

          {/* Final burst particles */}
          {showFinalBurst && (
            <div className="absolute inset-0 pointer-events-none">
              {particles.current.map((p, i) => {
                const rad = (p.angle * Math.PI) / 180;
                return (
                  <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                      width: p.size,
                      height: p.size,
                      left: "50%",
                      top: "50%",
                      background: "#22c55e",
                      boxShadow: "0 0 6px rgba(34,197,94,0.6)",
                      animation: `particleBurst 1s ease-out ${p.delay}s forwards`,
                      ["--tx" as string]: `${Math.cos(rad) * p.distance}px`,
                      ["--ty" as string]: `${Math.sin(rad) * p.distance}px`,
                    }}
                  />
                );
              })}
            </div>
          )}

          {allDone ? (
            /* ── Final success state ── */
            <div className="flex flex-col items-center gap-2 px-6" style={{ animation: "scaleIn 0.5s cubic-bezier(0.16,1,0.3,1)" }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.3)" }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7" style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: "drawCheck 0.5s ease-out 0.3s forwards" }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-green-400 font-black text-sm">
                {status === "publishing" ? "Publication..." : "Article prêt"}
              </p>
              <p className="text-gray-600 text-[10px]">
                {status === "publishing" ? "Envoi vers votre CMS" : "Tous les agents ont terminé"}
              </p>
            </div>
          ) : (
            /* ── Active generation — details inside screen ── */
            <div className="flex flex-col items-center gap-2 px-5 w-full max-h-full overflow-hidden">
              {/* Step counter */}
              <div className="text-2xl font-black tabular-nums" style={{ color: "#f97316" }}>
                {Math.min(currentStep + 1, steps.length)}<span className="text-gray-700 text-lg font-bold">/{steps.length}</span>
              </div>

              {/* Agent name */}
              <p className="text-white font-bold text-xs" key={`agent-${clampedStep}`} style={{ animation: "fadeIn 0.4s ease" }}>
                {steps[clampedStep]?.agent}
              </p>
              <p className="text-gray-600 text-[9px] mb-1" key={`sub-${clampedStep}`} style={{ animation: "fadeIn 0.4s ease 0.1s both" }}>
                {steps[clampedStep]?.label}
              </p>

              {/* Typewriter detail */}
              {typedText && (
                <div className="max-w-[85%]" key={`typed-${clampedStep}-${activeVisibleCount}`}>
                  <p className="text-[10px] font-mono text-orange-300/70 leading-relaxed text-center">
                    {typedText}
                    <span className="inline-block w-1 h-3 bg-orange-400/80 ml-0.5 rounded-sm" style={{ verticalAlign: "text-bottom", animation: "blink 1s step-end infinite" }} />
                  </p>
                </div>
              )}

              {/* Previous details (faded) */}
              {activeVisibleCount > 1 && (
                <div className="flex flex-col items-center gap-0.5 mt-1 max-w-[80%]">
                  {activeDetails.slice(Math.max(0, activeVisibleCount - 3), activeVisibleCount - 1).map((d, j) => (
                    <p key={j} className="text-[8px] font-mono text-gray-700 truncate text-center w-full">
                      ✓ {d}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom progress pills */}
      <div className="relative z-10 flex items-center gap-1.5 mt-4">
        {steps.map((_, i) => {
          const isCompleteGreen = allDone && greenIndex >= i;
          return (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width: i === clampedStep && !allDone ? 24 : 8,
                height: 8,
                borderRadius: 4,
                background: isCompleteGreen ? "#22c55e" : i < currentStep ? "#f97316" : i === clampedStep && !allDone ? "linear-gradient(90deg, #f97316, #ef4444)" : "rgba(255,255,255,0.06)",
                boxShadow: i === clampedStep && !allDone ? "0 0 8px rgba(249,115,22,0.5)" : isCompleteGreen ? "0 0 6px rgba(34,197,94,0.3)" : "none",
              }}
            />
          );
        })}
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pillFill {
          0% { clip-path: inset(0 100% 0 0); opacity: 1; }
          50% { clip-path: inset(0 0 0 0); opacity: 1; }
          100% { clip-path: inset(0 0 0 100%); opacity: 0; }
        }
        @keyframes greenFlash {
          0% { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.8); }
        }
        @keyframes particleBurst {
          0% { transform: translate(-50%, -50%) translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
        @keyframes drawCheck {
          to { stroke-dashoffset: 0; }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
