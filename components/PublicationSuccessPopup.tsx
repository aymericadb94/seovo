"use client";

import { useEffect, useState } from "react";

type PublicationInfo = {
  title: string;
  url: string;
  keyword?: string;
};

type Props = {
  publication: PublicationInfo | null;
  onClose: () => void;
};

export default function PublicationSuccessPopup({ publication, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  const [confetti, setConfetti] = useState<{ x: number; y: number; color: string; delay: number; size: number }[]>([]);

  useEffect(() => {
    if (!publication) { setVisible(false); return; }
    // Générer les confettis
    const colors = ["#f97316", "#a855f7", "#3b82f6", "#10b981", "#eab308", "#ef4444", "#ec4899"];
    const particles = Array.from({ length: 40 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
      size: 4 + Math.random() * 6,
    }));
    setConfetti(particles);
    requestAnimationFrame(() => setVisible(true));
  }, [publication]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  if (!publication) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-300 ${visible ? "bg-black/60 backdrop-blur-sm" : "bg-black/0 pointer-events-none"}`}
      onClick={handleClose}
    >
      <div
        className={`relative bg-[#0d0d0d] border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl transition-all duration-500 ${visible ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-8"}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Confettis */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          {confetti.map((c, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-confetti"
              style={{
                left: `${c.x}%`,
                top: `-10%`,
                width: c.size,
                height: c.size,
                backgroundColor: c.color,
                animationDelay: `${c.delay}s`,
              }}
            />
          ))}
        </div>

        {/* Icône de succès animée */}
        <div className="flex justify-center mb-6">
          <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30 transition-all duration-700 ${visible ? "scale-100 rotate-0" : "scale-0 rotate-180"}`}>
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
                className="animate-checkmark"
                style={{ strokeDasharray: 30, strokeDashoffset: 30 }}
              />
            </svg>
          </div>
        </div>

        {/* Titre */}
        <h3 className="text-xl font-bold text-white text-center mb-2">
          Article publié avec succès !
        </h3>

        {/* Détails */}
        <p className="text-gray-400 text-sm text-center mb-1 line-clamp-2">
          {publication.title}
        </p>
        {publication.keyword && (
          <p className="text-center mb-6">
            <span className="inline-block text-xs bg-violet-500/20 text-violet-400 border border-violet-500/20 rounded-full px-3 py-1">
              {publication.keyword}
            </span>
          </p>
        )}

        {/* Boutons */}
        <div className="flex flex-col gap-3 mt-6">
          {publication.url && (
            <a
              href={publication.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-semibold rounded-xl px-5 py-3 text-sm transition-all hover:shadow-lg hover:shadow-orange-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Voir l&apos;article publié
            </a>
          )}
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-white text-sm py-2 transition-colors"
          >
            Fermer
          </button>
        </div>

        {/* Bouton fermer (croix) */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(500px) rotate(720deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-fall 2s ease-out forwards;
        }
        @keyframes checkmark-draw {
          to { stroke-dashoffset: 0; }
        }
        .animate-checkmark {
          animation: checkmark-draw 0.5s ease-out 0.3s forwards;
        }
      `}</style>
    </div>
  );
}
