import Link from "next/link";

type Props = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export default function LegalLayout({ title, lastUpdated, children }: Props) {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-black tracking-tight">
            Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
          </Link>
          <Link href="/signup" className="text-sm text-gray-500 hover:text-white transition-colors">
            ← Retour à l&apos;inscription
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <p className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-3">Document légal</p>
          <h1 className="text-3xl font-black text-white mb-3">{title}</h1>
          <p className="text-gray-600 text-sm">Dernière mise à jour : {lastUpdated}</p>
          <div className="mt-4 h-px bg-gradient-to-r from-orange-500/30 via-white/10 to-transparent" />
        </div>

        {/* Content */}
        <div className="prose-legal">
          {children}
        </div>

        {/* Footer nav */}
        <div className="mt-16 pt-8 border-t border-white/[0.06]">
          <p className="text-gray-600 text-xs mb-4">Autres documents légaux</p>
          <div className="flex flex-wrap gap-3">
            {[
              { href: "/mentions-legales", label: "Mentions légales" },
              { href: "/cgu", label: "CGU" },
              { href: "/cgv", label: "CGV" },
              { href: "/confidentialite", label: "Confidentialité" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-white border border-white/[0.08] hover:border-white/20 rounded-lg transition-colors"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .prose-legal h2 {
          font-size: 1.1rem;
          font-weight: 800;
          color: white;
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
          padding-left: 0.75rem;
          border-left: 2px solid rgba(249,115,22,0.5);
        }
        .prose-legal h3 {
          font-size: 0.9rem;
          font-weight: 700;
          color: rgba(255,255,255,0.8);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .prose-legal p {
          font-size: 0.875rem;
          color: rgba(156,163,175,1);
          line-height: 1.75;
          margin-bottom: 0.875rem;
        }
        .prose-legal ul {
          margin: 0.75rem 0 0.875rem 1.25rem;
          list-style: disc;
        }
        .prose-legal li {
          font-size: 0.875rem;
          color: rgba(156,163,175,1);
          line-height: 1.7;
          margin-bottom: 0.25rem;
        }
        .prose-legal strong {
          color: rgba(255,255,255,0.85);
          font-weight: 700;
        }
        .prose-legal a {
          color: #f97316;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .prose-legal .highlight-box {
          background: rgba(249,115,22,0.06);
          border: 1px solid rgba(249,115,22,0.15);
          border-radius: 0.75rem;
          padding: 1rem 1.25rem;
          margin: 1.25rem 0;
        }
      `}</style>
    </main>
  );
}
