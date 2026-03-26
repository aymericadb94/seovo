"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-3xl" />
        </div>
        <div className="relative w-full max-w-md text-center">
          <div className="text-6xl mb-6">📬</div>
          <h2 className="text-3xl font-black mb-3">Vérifiez votre email</h2>
          <p className="text-gray-400 leading-relaxed">
            Un lien de confirmation a été envoyé à{" "}
            <span className="text-orange-400 font-bold">{email}</span>.
            <br />Cliquez dessus pour activer votre compte.
          </p>
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-bold text-sm mt-8 inline-block transition-colors">
            Retour à la connexion →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-3xl" />
      </div>
      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="text-3xl font-black tracking-tight">
            SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
          </Link>
          <p className="text-gray-500 mt-2">Créez votre compte gratuitement</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 caractères"
              minLength={6}
              required
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-sm font-medium">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 rounded-lg transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20"
          >
            {loading ? "Création..." : "Créer mon compte"}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-bold transition-colors">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
