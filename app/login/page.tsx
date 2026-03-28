"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(t.auth.login.error);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[500px] h-[500px] bg-orange-600/5 rounded-full blur-3xl" />
      </div>

      <div className="absolute top-4 left-4">
        <Link href="/" className="flex items-center gap-1.5 text-gray-500 hover:text-white text-sm transition-colors group">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Accueil
        </Link>
      </div>
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-10">
          <Link href="/" className="text-3xl font-black tracking-tight">
            Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
          </Link>
          <p className="text-gray-500 mt-2">{t.auth.login.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.auth.login.placeholder}
              required
              className="w-full bg-white/[0.05] border border-white/[0.1] rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-300 mb-2 uppercase tracking-wider">{t.auth.login.password}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
            {loading ? t.auth.login.loading : t.auth.login.submit}
          </button>
        </form>

        {/* Toggle Créer / Connecter */}
        <div className="flex mt-6 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 gap-1">
          <Link href="/signup" className="flex-1 text-center text-sm font-bold py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all">
            Créer un compte
          </Link>
          <span className="flex-1 text-center text-sm font-black py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md shadow-orange-500/20 cursor-default">
            Se connecter
          </span>
        </div>
      </div>
    </main>
  );
}
