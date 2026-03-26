"use client";

import { useState } from "react";
import Link from "next/link";

export default function Generate() {
  const [keyword, setKeyword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [status, setStatus] = useState<"idle" | "generating" | "publishing" | "done" | "error">("idle");
  const [result, setResult] = useState<{ title: string; url: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("generating");
    setError("");
    setResult(null);

    try {
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, businessName }),
      });

      if (!genRes.ok) {
        const data = await genRes.json();
        throw new Error(data.error || "Erreur lors de la génération");
      }
      const { title, content } = await genRes.json();

      setStatus("publishing");
      const pubRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      if (!pubRes.ok) {
        const data = await pubRes.json();
        throw new Error(data.error || "Erreur lors de la publication");
      }
      const { url } = await pubRes.json();

      setResult({ title, url });
      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-xl">
        <div className="mb-10 text-center">
          <Link href="/" className="text-3xl font-black tracking-tight">
            SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
          </Link>
          <p className="text-gray-500 mt-2 mb-4">Générez et publiez un article SEO</p>
          <Link href="/dashboard" className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors">
            ← Tableau de bord
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Nom de l&apos;entreprise</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Ex: Boulangerie Dupont"
              required
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Mot-clé SEO cible</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ex: boulangerie artisanale Paris"
              required
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={status === "generating" || status === "publishing"}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-lg transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20"
          >
            {status === "generating" && "⏳ Claude génère l'article..."}
            {status === "publishing" && "📤 Publication en cours..."}
            {(status === "idle" || status === "done" || status === "error") && "Générer et publier"}
          </button>
        </form>

        {status === "done" && result && (
          <div className="mt-6 bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
            <p className="text-orange-400 font-black mb-1 uppercase tracking-wide text-sm">✅ Article publié !</p>
            <p className="text-white font-bold mt-2 mb-3">{result.title}</p>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors">
              Voir l&apos;article sur WordPress →
            </a>
          </div>
        )}

        {status === "error" && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
            <p className="text-red-400 font-black uppercase tracking-wide text-sm">Erreur</p>
            <p className="text-gray-400 text-sm mt-1">{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
