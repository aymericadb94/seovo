"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

type Post = {
  id: number;
  title: string;
  date: string;
  url: string;
};

// ─── Mock data ───────────────────────────────────────────────────────────────

function generateTrafficData() {
  const data = [];
  let value = 420;
  const labels = ["01/03","03/03","05/03","07/03","09/03","11/03","13/03","15/03","17/03","19/03","21/03","23/03","25/03","27/03","Auj."];
  for (let i = 0; i < labels.length; i++) {
    value += Math.floor(Math.random() * 80 - 10 + i * 12);
    data.push({ date: labels[i], visites: Math.max(value, 300) });
  }
  return data;
}

const trafficData = generateTrafficData();

const seoCategories = [
  { name: "Contenu", score: 78, icon: "✍️", detail: "23 articles publiés", color: "#f97316" },
  { name: "On-page", score: 65, icon: "🏷️", detail: "Titres & metas", color: "#ef4444" },
  { name: "Technique", score: 83, icon: "⚙️", detail: "Structure propre", color: "#fb923c" },
  { name: "Backlinks", score: 41, icon: "🔗", detail: "12 liens entrants", color: "#fca5a5" },
];

const aiActivity = [
  { time: "Il y a 2h",  action: "Article publié",        detail: "Grossiste vêtements seconde main",     type: "publish" },
  { time: "Il y a 5h",  action: "Méta-description",      detail: "Page d'accueil optimisée",             type: "meta" },
  { time: "Hier",       action: "Maillage interne",       detail: "8 liens internes créés",               type: "link" },
  { time: "Il y a 2j",  action: "Article publié",         detail: "Guide complet mode vintage 2025",      type: "publish" },
  { time: "Il y a 3j",  action: "Analyse mots-clés",      detail: "47 nouvelles opportunités trouvées",   type: "analysis" },
  { time: "Il y a 4j",  action: "Article publié",         detail: "Top 10 marques seconde main",          type: "publish" },
  { time: "Il y a 5j",  action: "Balises title",          detail: "12 pages re-titrées",                  type: "meta" },
];

const activityIcons: Record<string, string> = {
  publish: "✍️",
  meta: "🏷️",
  link: "🔗",
  analysis: "📊",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function globalScore(posts: Post[]) {
  const base = 52;
  return Math.min(base + posts.length * 3, 97);
}

// ─── Animated counter ────────────────────────────────────────────────────────

function useCounter(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || target === 0) return;
    started.current = true;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(ease * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

// ─── Score ring ──────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDash((score / 100) * circ), 200);
    return () => clearTimeout(t);
  }, [score, circ]);
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="absolute inset-0 rotate-[-90deg]" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
        <circle
          cx="64" cy="64" r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - dash}
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)" }}
        />
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
      <div className="text-center z-10">
        <p className="text-4xl font-black bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent leading-none">{score}</p>
        <p className="text-gray-500 text-xs mt-1 uppercase tracking-wider">/ 100</p>
      </div>
    </div>
  );
}

// ─── Category bar ────────────────────────────────────────────────────────────

function CategoryBar({ cat, delay }: { cat: typeof seoCategories[0]; delay: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(cat.score), delay);
    return () => clearTimeout(t);
  }, [cat.score, delay]);
  return (
    <div className="flex items-center gap-4">
      <span className="text-xl w-8 text-center">{cat.icon}</span>
      <div className="flex-1">
        <div className="flex justify-between mb-1.5">
          <span className="text-sm font-bold text-white">{cat.name}</span>
          <span className="text-sm font-black" style={{ color: cat.color }}>{cat.score}</span>
        </div>
        <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${width}%`,
              background: `linear-gradient(90deg, ${cat.color}cc, ${cat.color})`,
              transition: `width 1.2s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
            }}
          />
        </div>
        <p className="text-gray-600 text-xs mt-1">{cat.detail}</p>
      </div>
    </div>
  );
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: {value: number}[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-orange-400 font-black text-lg">{payload[0].value.toLocaleString("fr-FR")}</p>
      <p className="text-gray-500 text-xs">visites organiques</p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [cronRunning, setCronRunning] = useState(false);
  const [cronResult, setCronResult] = useState<string | null>(null);

  const score = globalScore(posts);
  const animatedScore = useCounter(loading ? 0 : score);
  const animatedPosts = useCounter(loading ? 0 : posts.length);
  const animatedTraffic = useCounter(loading ? 0 : trafficData[trafficData.length - 1].visites);
  const animatedKeywords = useCounter(loading ? 0 : 47 + posts.length * 4);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleManualPublish() {
    setCronRunning(true);
    setCronResult(null);
    try {
      const res = await fetch("/api/cron/publish", {
        headers: { Authorization: `Bearer seovo_cron_secret_2025` },
      });
      const data = await res.json();
      setCronResult(data.message || data.error || "Terminé");
      // Recharger les articles
      fetch("/api/posts").then(r => r.json()).then(d => { if (!d.error) setPosts(d); });
    } catch {
      setCronResult("Erreur lors du déclenchement");
    }
    setCronRunning(false);
  }

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setPosts(data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-black text-white">

      {/* Sidebar-style top nav */}
      <nav className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/[0.06] px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-xl font-black tracking-tight">
              SEO<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">VO</span>
            </span>
            <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.07] rounded-full px-3 py-1.5">
              <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
              <span className="text-xs text-gray-400 font-medium">IA active — publication dans 14h</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualPublish}
              disabled={cronRunning}
              className="text-orange-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm px-4 py-2 rounded-lg border border-orange-500/30 hover:border-orange-500/60 transition-colors font-bold"
            >
              {cronRunning ? "⏳ Publication..." : "▶ Lancer l'IA"}
            </button>
            <Link
              href="/generate"
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black px-4 py-2 rounded-lg transition-all text-sm shadow-lg shadow-orange-500/20 uppercase tracking-wide"
            >
              + Générer
            </Link>
            <Link
              href="/settings"
              className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              ⚙️ Paramètres
            </Link>
            <Link
              href="/admin"
              className="text-gray-600 hover:text-orange-400 text-xs px-3 py-2 transition-colors"
              title="Admin"
            >
              ◈
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-8 py-10">

        {/* ── Résultat cron ───────────────────────────────────────────── */}
        {cronResult && (
          <div className="mb-6 bg-orange-500/10 border border-orange-500/20 rounded-xl px-5 py-3 flex items-center justify-between">
            <p className="text-orange-400 font-bold text-sm">✓ {cronResult}</p>
            <button onClick={() => setCronResult(null)} className="text-gray-500 hover:text-white text-xs transition-colors">✕</button>
          </div>
        )}

        {/* ── Row 1 : Score + KPIs ─────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-5 mb-6">

          {/* Score global */}
          <div className="col-span-12 md:col-span-3 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 flex flex-col items-center justify-center gap-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Score SEO Global</p>
            <ScoreRing score={animatedScore} />
            <div className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide ${
              score >= 70 ? "bg-orange-500/10 text-orange-400" : "bg-red-500/10 text-red-400"
            }`}>
              {score >= 80 ? "Excellent" : score >= 65 ? "Bon" : score >= 50 ? "À améliorer" : "Faible"}
            </div>
          </div>

          {/* KPIs */}
          <div className="col-span-12 md:col-span-9 grid grid-cols-3 gap-5">
            {[
              { label: "Articles publiés", value: animatedPosts, suffix: "", sub: `+${Math.max(1, posts.length - 1)} ce mois` },
              { label: "Visites organiques", value: animatedTraffic, suffix: "", sub: "+18% vs mois dernier" },
              { label: "Mots-clés couverts", value: animatedKeywords, suffix: "", sub: "47 nouveaux ce mois" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 flex flex-col justify-between">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{kpi.label}</p>
                <p className="text-4xl font-black text-white">
                  {kpi.value.toLocaleString("fr-FR")}{kpi.suffix}
                </p>
                <p className="text-orange-400/80 text-xs font-medium mt-3">{kpi.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Row 2 : Trafic chart ─────────────────────────────────────── */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Trafic organique</p>
              <p className="text-2xl font-black text-white">Évolution sur 30 jours</p>
            </div>
            <span className="text-xs bg-orange-500/10 text-orange-400 font-bold px-3 py-1.5 rounded-full uppercase tracking-wide">
              +{Math.round((trafficData[trafficData.length-1].visites / trafficData[0].visites - 1) * 100)}% ce mois
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trafficData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="trafficGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#4b5563", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone" dataKey="visites"
                stroke="#f97316" strokeWidth={2.5}
                fill="url(#trafficGrad)"
                isAnimationActive={true} animationDuration={1800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Row 3 : Catégories + Activité IA ────────────────────────── */}
        <div className="grid grid-cols-12 gap-5 mb-6">

          {/* Catégories SEO */}
          <div className="col-span-12 md:col-span-5 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-5">Performance par catégorie</p>
            <div className="flex flex-col gap-5">
              {seoCategories.map((cat, i) => (
                <CategoryBar key={cat.name} cat={cat} delay={i * 150} />
              ))}
            </div>
          </div>

          {/* Activité IA */}
          <div className="col-span-12 md:col-span-7 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Activité de l&apos;IA</p>
              <span className="flex items-center gap-1.5 text-xs text-orange-400 font-medium">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse" />
                En direct
              </span>
            </div>
            <div className="flex flex-col gap-0">
              {aiActivity.map((item, i) => (
                <div key={i} className="flex gap-4 group">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-sm flex-shrink-0 group-hover:border-orange-500/30 transition-colors">
                      {activityIcons[item.type]}
                    </div>
                    {i < aiActivity.length - 1 && (
                      <div className="w-px h-full min-h-[20px] bg-white/[0.06] my-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-bold text-white">{item.action}</p>
                      <span className="text-gray-600 text-xs">·</span>
                      <span className="text-gray-500 text-xs">{item.time}</span>
                    </div>
                    <p className="text-gray-400 text-sm">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 4 : Articles publiés ─────────────────────────────────── */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Articles publiés par l&apos;IA</p>
            <Link href="/generate" className="text-orange-400 hover:text-orange-300 text-xs font-bold uppercase tracking-wide transition-colors">
              + Générer un article
            </Link>
          </div>

          {loading && (
            <div className="text-center text-gray-600 py-12 text-sm">Chargement...</div>
          )}

          {!loading && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-white font-bold mb-2">Aucun article pour l&apos;instant</p>
              <p className="text-gray-500 text-sm mb-5">Générez votre premier article SEO</p>
              <Link href="/generate" className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-black px-6 py-2.5 rounded-lg text-sm uppercase tracking-wide">
                Démarrer →
              </Link>
            </div>
          )}

          {!loading && posts.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.05]">
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Titre</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Date</th>
                  <th className="text-left text-gray-600 text-xs font-bold px-6 py-3 uppercase tracking-wider">Statut</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {posts.map((post, i) => (
                  <tr
                    key={post.id}
                    className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${i === posts.length - 1 ? "border-b-0" : ""}`}
                  >
                    <td className="px-6 py-4 text-white font-medium max-w-xs truncate" dangerouslySetInnerHTML={{ __html: post.title }} />
                    <td className="px-6 py-4 text-gray-500 text-sm whitespace-nowrap">{formatDate(post.date)}</td>
                    <td className="px-6 py-4">
                      <span className="bg-orange-500/10 text-orange-400 text-xs font-black px-3 py-1 rounded-full uppercase tracking-wide">
                        Publié
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors">
                        Voir →
                      </a>
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
