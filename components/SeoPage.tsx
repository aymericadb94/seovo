"use client";

// ── Composant de rendu dynamique des pages SEO ──────────────────────────────
// Rend les blocs structurés du moteur SEO intelligent Rankpill v2

type HeroData = { title: string; subtitle: string; promise: string; cta: string | null };
type StatData = { value: string; label: string; source?: string };
type SimulationData = { title: string; scenario: string; result: string };
type SectionData = { title: string; content: string; tip?: string; example?: string };
type InsightData = { type: "tip" | "warning" | "pro"; text: string };
type MistakeData = { title: string; why: string; consequence: string };
type FaqData = { question: string; answer: string };
type CtaData = { text: string; button_text: string; button_url: string | null };
type GscInsightData = { position: number | null; trend: "up" | "down" | "stable"; insight: string; recommendation: string };
type ComparisonData = { title: string; headers: string[]; rows: string[][] };

export type StructuredPageData = {
  hero?: HeroData;
  quick_answer?: string;
  key_stats?: StatData[];
  simulation?: SimulationData;
  sections?: SectionData[];
  insights?: InsightData[];
  mistakes?: MistakeData[];
  faq?: FaqData[];
  cta?: CtaData;
  gsc_insight?: GscInsightData;
  comparison?: ComparisonData;
  internal_links?: { anchor: string; target: string }[];
};

// ── Composant principal ─────────────────────────────────────────────────────

export default function SeoPage({ data, title }: { data: StructuredPageData; title: string }) {
  return (
    <div className="flex flex-col gap-5">
      {data.hero && <HeroBlock data={data.hero} />}
      {data.quick_answer && <QuickAnswerBlock answer={data.quick_answer} />}
      {data.gsc_insight && <GscInsightBlock data={data.gsc_insight} />}
      {data.key_stats && data.key_stats.length > 0 && <StatsBlock stats={data.key_stats} />}
      {data.simulation?.title && <SimulationBlock data={data.simulation} />}
      {data.sections?.map((section, i) => <SectionBlock key={i} data={section} />)}
      {data.comparison && <ComparisonBlock data={data.comparison} />}
      {data.insights && data.insights.length > 0 && <InsightsBlock insights={data.insights} />}
      {data.mistakes && data.mistakes.length > 0 && <MistakesBlock mistakes={data.mistakes} />}
      {data.faq && data.faq.length > 0 && <FaqBlock questions={data.faq} />}
      {data.cta?.text && <CtaBlock data={data.cta} />}
    </div>
  );
}

// ── Blocs individuels ───────────────────────────────────────────────────────

function HeroBlock({ data }: { data: HeroData }) {
  return (
    <div
      className="rounded-2xl overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.08) 0%, rgba(239,68,68,0.05) 50%, rgba(0,0,0,0.4) 100%)", border: "1px solid rgba(249,115,22,0.15)" }}
    >
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #f97316, #ef4444, #f97316)" }} />
      <div className="px-8 py-10 md:px-12 md:py-14">
        <h1 className="text-3xl md:text-4xl font-black text-white leading-tight mb-3">
          {data.title}
        </h1>
        {data.subtitle && (
          <p className="text-lg text-gray-300 font-medium mb-4">{data.subtitle}</p>
        )}
        {data.promise && (
          <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">{data.promise}</p>
        )}
        {data.cta && (
          <button className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-transform">
            {data.cta}
          </button>
        )}
      </div>
    </div>
  );
}

function QuickAnswerBlock({ answer }: { answer: string }) {
  return (
    <div className="bg-white/[0.03] border border-orange-500/20 rounded-2xl px-6 py-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-6 rounded-full bg-orange-500" />
        <p className="text-xs font-black text-orange-400 uppercase tracking-wider">Réponse rapide</p>
      </div>
      <p className="text-gray-200 text-sm leading-relaxed">{answer}</p>
    </div>
  );
}

function GscInsightBlock({ data }: { data: GscInsightData }) {
  const trendIcon = data.trend === "up" ? "↗" : data.trend === "down" ? "↘" : "→";
  const trendColor = data.trend === "up" ? "text-green-400" : data.trend === "down" ? "text-red-400" : "text-gray-400";

  return (
    <div
      className="rounded-2xl px-6 py-5"
      style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.15)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-blue-400 text-lg">📊</span>
        <p className="text-xs font-black text-blue-400 uppercase tracking-wider">Données Google</p>
        {data.position && (
          <span className="ml-auto text-sm font-black text-white bg-blue-500/20 px-3 py-1 rounded-full">
            Position #{data.position} <span className={trendColor}>{trendIcon}</span>
          </span>
        )}
      </div>
      <p className="text-gray-300 text-sm mb-2">{data.insight}</p>
      <p className="text-blue-300 text-xs font-bold">{data.recommendation}</p>
    </div>
  );
}

function StatsBlock({ stats }: { stats: StatData[] }) {
  const cols = stats.length <= 3 ? "grid-cols-3" : stats.length === 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
  return (
    <div className={`grid ${cols} gap-3`}>
      {stats.map((stat, i) => (
        <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 text-center">
          <p className="text-2xl font-black text-orange-400 mb-1">{stat.value}</p>
          <p className="text-gray-400 text-xs leading-snug">{stat.label}</p>
          {stat.source && <p className="text-gray-600 text-[10px] mt-1">{stat.source}</p>}
        </div>
      ))}
    </div>
  );
}

function SimulationBlock({ data }: { data: SimulationData }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "rgba(59,130,246,0.04)", border: "1px solid rgba(59,130,246,0.15)" }}
    >
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-blue-400">📊</span>
          <p className="text-sm font-black text-blue-400 uppercase tracking-wide">{data.title}</p>
        </div>
        <div
          className="prose-article text-sm text-gray-300 mb-3"
          dangerouslySetInnerHTML={{ __html: data.scenario }}
        />
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
          <p className="text-blue-300 font-bold text-sm">{data.result}</p>
        </div>
      </div>
    </div>
  );
}

function SectionBlock({ data }: { data: SectionData }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl px-6 py-6 md:px-8">
      <h2 className="text-xl font-black text-white mb-4">{data.title}</h2>
      <div
        className="prose-article text-sm text-gray-300 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: data.content }}
      />
      {data.tip && (
        <div className="mt-4 bg-orange-500/5 border border-orange-500/15 rounded-xl px-4 py-3">
          <p className="text-orange-300 text-xs"><strong>💡 Astuce</strong> — {data.tip}</p>
        </div>
      )}
      {data.example && (
        <div className="mt-3 bg-white/[0.02] border border-white/[0.05] rounded-xl px-4 py-3">
          <p className="text-gray-400 text-xs italic">Exemple : {data.example}</p>
        </div>
      )}
    </div>
  );
}

function ComparisonBlock({ data }: { data: ComparisonData }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl px-6 py-5 overflow-x-auto">
      <p className="text-sm font-black text-white uppercase tracking-wider mb-4">{data.title}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.08]">
            {data.headers.map((h, i) => (
              <th key={i} className="text-left text-gray-400 font-bold uppercase tracking-wider py-2 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-b border-white/[0.03]">
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 pr-4 text-gray-300">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightsBlock({ insights }: { insights: InsightData[] }) {
  const cols = insights.length <= 3 ? `grid-cols-1 md:grid-cols-${insights.length}` : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
  const styles = {
    tip: { bg: "rgba(249,115,22,0.05)", border: "rgba(249,115,22,0.15)", icon: "💡", color: "text-orange-300" },
    warning: { bg: "rgba(239,68,68,0.05)", border: "rgba(239,68,68,0.15)", icon: "⚠️", color: "text-red-300" },
    pro: { bg: "rgba(168,85,247,0.05)", border: "rgba(168,85,247,0.15)", icon: "🔥", color: "text-purple-300" },
  };

  return (
    <div className={`grid ${cols} gap-3`}>
      {insights.map((insight, i) => {
        const s = styles[insight.type];
        return (
          <div key={i} className="rounded-xl px-4 py-3" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <p className={`text-xs leading-relaxed ${s.color}`}>
              <span className="mr-1.5">{s.icon}</span>{insight.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function MistakesBlock({ mistakes }: { mistakes: MistakeData[] }) {
  return (
    <div className="bg-red-500/[0.03] border border-red-500/15 rounded-2xl px-6 py-5">
      <p className="text-sm font-black text-red-400 uppercase tracking-wider mb-4">Erreurs à éviter</p>
      <div className="space-y-3">
        {mistakes.map((m, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-red-500 font-black text-sm mt-0.5">✕</span>
            <div>
              <p className="text-white font-bold text-sm">{m.title}</p>
              <p className="text-gray-400 text-xs mt-0.5">{m.why}</p>
              <p className="text-red-400/70 text-xs mt-0.5 italic">{m.consequence}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqBlock({ questions }: { questions: FaqData[] }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl px-6 py-5">
      <p className="text-sm font-black text-white uppercase tracking-wider mb-4">Questions fréquentes</p>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
            <p className="text-white font-bold text-sm mb-1">{q.question}</p>
            <p className="text-gray-400 text-xs leading-relaxed">{q.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CtaBlock({ data }: { data: CtaData }) {
  return (
    <div
      className="rounded-2xl text-center px-8 py-8"
      style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.08), rgba(239,68,68,0.06))", border: "1px solid rgba(249,115,22,0.15)" }}
    >
      <p className="text-gray-300 text-sm leading-relaxed mb-4 max-w-lg mx-auto">{data.text}</p>
      {data.button_text && (
        <button className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-black text-sm shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-transform">
          {data.button_text}
        </button>
      )}
    </div>
  );
}
