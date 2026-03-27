"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Stats = {
  totalUsers: number;
  totalSites: number;
  totalPublications: number;
  newUsersThisMonth: number;
};

type AdminData = {
  stats: Stats;
  signupsChart: { date: string; count: number }[];
  pubsChart: { date: string; count: number }[];
  recentUsers: { id: string; email: string; created_at: string; hasSite: boolean }[];
  recentPublications: { id: string; title: string; keyword: string; published_at: string; wordpress_url: string }[];
  recentSites: { id: string; business_name: string; cms: string; site_url: string; industry: string; created_at: string }[];
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-white/10 rounded-xl px-4 py-2 shadow-xl">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-orange-400 font-black text-lg">{payload[0].value}</p>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Impossible de charger les données"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 text-sm">Chargement des données...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-bold mb-2">Accès refusé</p>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <Link href="/dashboard" className="text-orange-400 hover:underline text-sm">← Retour au dashboard</Link>
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen bg-black text-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/[0.06] px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-black tracking-tight">
              Seo<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Corp</span>
            </Link>
            <span className="bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
              Admin
            </span>
          </div>
          <Link href="/dashboard" className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
            ← Dashboard client
          </Link>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-8 py-10">

        {/* ── KPIs ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">
          {[
            { label: "Utilisateurs inscrits", value: data.stats.totalUsers, sub: `+${data.stats.newUsersThisMonth} ce mois`, highlight: true },
            { label: "Sites connectés", value: data.stats.totalSites, sub: "WordPress & Shopify", highlight: false },
            { label: "Articles publiés", value: data.stats.totalPublications, sub: "Depuis le lancement", highlight: false },
            { label: "MRR estimé", value: `${data.stats.totalSites * 49}€`, sub: "Forfait Starter × sites", highlight: false },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-2xl p-6 border ${kpi.highlight ? "bg-gradient-to-br from-orange-500/10 to-red-500/10 border-orange-500/20" : "bg-white/[0.03] border-white/[0.07]"}`}>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{kpi.label}</p>
              <p className={`text-4xl font-black ${kpi.highlight ? "bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent" : "text-white"}`}>
                {kpi.value}
              </p>
              <p className="text-gray-600 text-xs mt-2">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Charts ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5 mb-8">

          {/* Inscriptions */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Inscriptions</p>
            <p className="text-lg font-black text-white mb-5">30 derniers jours</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={data.signupsChart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2} fill="url(#signupGrad)" animationDuration={1500} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Publications automatisées */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Publications automatisées</p>
            <p className="text-lg font-black text-white mb-5">14 derniers jours</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.pubsChart} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} animationDuration={1500} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Tables ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-5 mb-8">

          {/* Derniers inscrits */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Derniers inscrits</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Email</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Date</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Site</th>
                </tr>
              </thead>
              <tbody>
                {data.recentUsers.map((u, i) => (
                  <tr key={u.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === data.recentUsers.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-3 text-white text-sm font-medium truncate max-w-[180px]">{u.email}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(u.created_at)}</td>
                    <td className="px-6 py-3">
                      {u.hasSite
                        ? <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">Configuré</span>
                        : <span className="bg-white/[0.05] text-gray-500 text-xs font-bold px-2 py-0.5 rounded-full">En attente</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sites connectés */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06]">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Sites connectés</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Entreprise</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">CMS</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Secteur</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSites.length === 0 ? (
                  <tr><td colSpan={3} className="px-6 py-6 text-center text-gray-600 text-sm">Aucun site configuré</td></tr>
                ) : data.recentSites.map((s, i) => (
                  <tr key={s.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === data.recentSites.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-3 text-white text-sm font-medium truncate max-w-[160px]">{s.business_name}</td>
                    <td className="px-6 py-3">
                      <span className="bg-white/[0.05] text-gray-400 text-xs font-bold px-2 py-0.5 rounded-full uppercase">{s.cms}</span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs truncate max-w-[120px]">{s.industry}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Dernières publications ────────────────────────────── */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dernières publications automatisées</p>
          </div>
          {data.recentPublications.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-600 text-sm">Aucune publication automatique pour l&apos;instant</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Titre</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Mot-clé</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.recentPublications.map((p, i) => (
                  <tr key={p.id} className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === data.recentPublications.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-3 text-white text-sm font-medium truncate max-w-xs">{p.title}</td>
                    <td className="px-6 py-3">
                      <span className="bg-orange-500/10 text-orange-400 text-xs font-medium px-2.5 py-1 rounded-full">{p.keyword}</span>
                    </td>
                    <td className="px-6 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(p.published_at)}</td>
                    <td className="px-6 py-3 text-right">
                      {p.wordpress_url && (
                        <a href={p.wordpress_url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-xs font-medium transition-colors">
                          Voir →
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </main>
  );
}
