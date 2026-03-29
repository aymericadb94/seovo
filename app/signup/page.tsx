"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");

  // Form fields
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // OTP
  const [otp, setOtp] = useState(["", "", "", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Étape 1 : inscription ─────────────────────────────────────────────────

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, phone }),
    });
    const data = await res.json() as { error?: string };

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'inscription.");
      setLoading(false);
      return;
    }

    setStep("otp");
    setLoading(false);
  }

  // ── Étape 2 : vérification OTP ────────────────────────────────────────────

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const token = otp.join("");
    if (token.length < 8) {
      setError("Entrez le code complet à 8 chiffres.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "signup",
    });

    if (otpError) {
      setError("Code invalide ou expiré. Vérifiez votre boîte mail.");
      setLoading(false);
      return;
    }

    router.push("/onboarding");
  }

  async function resendCode() {
    setError("");
    const supabase = createClient();
    await supabase.auth.resend({ type: "signup", email });
    setError("✓ Nouveau code envoyé.");
  }

  // ── OTP input handlers ────────────────────────────────────────────────────

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 7) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
    if (digits.length === 8) {
      setOtp(digits.split(""));
      otpRefs.current[7]?.focus();
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#080808] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Orb background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-block text-3xl font-black tracking-tight">
            Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
          </Link>
          <p className="text-gray-500 mt-2 text-sm">
            {step === "form" ? "Créez votre compte gratuitement" : "Vérifiez votre boîte mail"}
          </p>
        </div>

        {/* ── Étape 1 : Formulaire ── */}
        {step === "form" && (
          <form onSubmit={handleSignup} className="flex flex-col gap-4">

            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 flex flex-col gap-4">

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Adresse email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr"
                  required
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
                />
              </div>

              {/* Téléphone */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Téléphone <span className="text-gray-600 font-normal normal-case">(optionnel)</span></label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+33 6 00 00 00 00"
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
                />
              </div>

              {/* Séparateur */}
              <div className="border-t border-white/[0.06]" />

              {/* Mot de passe */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8 caractères minimum"
                  minLength={8}
                  required
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
                />
              </div>

              {/* Confirmation mot de passe */}
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Confirmer le mot de passe</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Retapez votre mot de passe"
                  minLength={8}
                  required
                  className={`w-full bg-white/[0.05] border rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none transition-colors text-sm ${
                    confirmPassword && password !== confirmPassword
                      ? "border-red-500/50 focus:border-red-500/70"
                      : confirmPassword && password === confirmPassword
                      ? "border-green-500/40 focus:border-green-500/60"
                      : "border-white/[0.1] focus:border-orange-500/50"
                  }`}
                />
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-red-400 text-xs mt-1.5">Les mots de passe ne correspondent pas</p>
                )}
                {confirmPassword && password === confirmPassword && (
                  <p className="text-green-400 text-xs mt-1.5">✓ Les mots de passe correspondent</p>
                )}
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm font-medium px-1">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || (!!confirmPassword && password !== confirmPassword)}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-xl transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20 text-sm"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Création du compte…
                </span>
              ) : "Créer mon compte →"}
            </button>

            <p className="text-xs text-gray-600 text-center">
              Un code de vérification sera envoyé par email.
            </p>
          </form>
        )}

        {/* ── Étape 2 : OTP ── */}
        {step === "otp" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-4">

            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 flex flex-col gap-5">

              {/* Icône + texte */}
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 mb-4">
                  <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Code envoyé à<br />
                  <span className="text-white font-bold">{email}</span>
                </p>
              </div>

              {/* 6 cases OTP */}
              <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-black bg-white/[0.05] border border-white/[0.1] rounded-xl text-white focus:outline-none focus:border-orange-500/60 focus:bg-orange-500/5 transition-all"
                  />
                ))}
              </div>

              {error && (
                <p className={`text-sm font-medium text-center ${error.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || otp.join("").length < 8}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-xl transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20 text-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Vérification…
                  </span>
                ) : "Vérifier et accéder →"}
              </button>
            </div>

            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => { setStep("form"); setOtp(["","","","","","","",""]); setError(""); }}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                ← Modifier l&apos;email
              </button>
              <button
                type="button"
                onClick={resendCode}
                className="text-xs text-orange-500/70 hover:text-orange-400 transition-colors"
              >
                Renvoyer le code
              </button>
            </div>
          </form>
        )}

        {/* Toggle Créer / Connecter */}
        <div className="flex mt-6 bg-white/[0.04] border border-white/[0.08] rounded-xl p-1 gap-1">
          <span className="flex-1 text-center text-sm font-black py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-md shadow-orange-500/20 cursor-default">
            Créer un compte
          </span>
          <Link href="/login" className="flex-1 text-center text-sm font-bold py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all">
            Se connecter
          </Link>
        </div>

      </div>
    </main>
  );
}
