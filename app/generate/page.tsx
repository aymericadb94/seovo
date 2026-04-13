"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LOCALES, localeFlags, localeNames, type Locale } from "@/lib/i18n/translations";
import SeoPage from "@/components/SeoPage";

type SiteConfig = {
  business_name: string;
  industry: string;
  keywords: string[];
  target_languages: Locale[];
};

type GscMetrics = {
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

type SuggestedKeyword = {
  keyword: string;
  source: "roadmap" | "cocoon" | "gsc" | "settings";
  role: "pillar" | "support" | "opportunity" | "unknown";
  cluster: string | null;
  phase: number | null;
  priority: "haute" | "moyenne" | "faible";
  reason: string;
  score: number;
  gsc: GscMetrics | null;
};

type StructuredData = {
  hero: { title: string; subtitle: string; promise: string; cta: string | null };
  quick_answer: string;
  key_stats: { value: string; label: string; source?: string }[];
  simulation: { title: string; scenario: string; result: string };
  sections: { title: string; content: string; tip?: string; example?: string }[];
  insights: { type: "tip" | "warning" | "pro"; text: string }[];
  mistakes: { title: string; why: string; consequence: string }[];
  faq: { question: string; answer: string }[];
  cta: { text: string; button_text: string; button_url: string | null };
  internal_links: { anchor: string; target: string }[];
};

type GeneratedArticle = {
  title: string;
  content: string;
  meta_description: string;
  cover_image_query?: string | null;
  cover_alt_text?: string | null;
  section_image_queries?: string[] | null;
  structured?: StructuredData | null;
};


const STEPS = [
  {
    id: "intent",
    agent: "Stéphane",
    label: "Analyse d'intention",
    sub: "Intent, sous-intentions, maturité utilisateur",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
      </svg>
    ),
  },
  {
    id: "serp",
    agent: "Antoine",
    label: "Analyse SERP",
    sub: "Patterns, faiblesses, opportunités concurrentielles",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    id: "diff",
    agent: "Julien",
    label: "Angle différenciant",
    sub: "Positionnement unique vs concurrence",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
  {
    id: "structure",
    agent: "Jonathan",
    label: "Structure de page",
    sub: "Blocs dynamiques adaptés à l'intention",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: "content",
    agent: "Zacky",
    label: "Rédaction SEO complète",
    sub: "1 500+ mots structurés, data, exemples concrets",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    ),
  },
  {
    id: "linking",
    agent: "Aymeric",
    label: "Maillage interne",
    sub: "Liens stratégiques vers les pages existantes",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
  {
    id: "risk",
    agent: "Sophie",
    label: "Audit de risques SEO",
    sub: "Détection sur-optimisation, cannibalisation, IA",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    id: "ctr",
    agent: "Yuji",
    label: "Optimisation CTR",
    sub: "Title SEO et meta description optimisés",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h6"/>
      </svg>
    ),
  },
];

const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  roadmap: { label: "Roadmap", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  cocoon: { label: "Cocon", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  gsc: { label: "GSC", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  settings: { label: "Config", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

const ROLE_LABELS: Record<string, string> = {
  pillar: "Pilier",
  support: "Support",
  opportunity: "Opportunité",
  unknown: "",
};

function scoreColor(score: number): string {
  if (score >= 70) return "#22c55e"; // green
  if (score >= 45) return "#f97316"; // orange
  return "#6b7280"; // gray
}

function scoreBars(score: number): number {
  if (score >= 80) return 5;
  if (score >= 65) return 4;
  if (score >= 50) return 3;
  if (score >= 35) return 2;
  return 1;
}

export default function GeneratePage() {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [smartKeywords, setSmartKeywords] = useState<SuggestedKeyword[]>([]);
  const [keyword, setKeyword] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [language, setLanguage] = useState<Locale>("fr");
  const [previewMode, setPreviewMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "preview" | "publishing" | "done" | "error">("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [stepOutcomes, setStepOutcomes] = useState<Record<number, "success" | "skipped" | "failed">>({});
  const [stepDetails, setStepDetails] = useState<Record<number, string[]>>({});
  const [visibleDetails, setVisibleDetails] = useState<Record<number, number>>({});
  const [generated, setGenerated] = useState<GeneratedArticle | null>(null);
  const [result, setResult] = useState<{ title: string; url: string; meta?: string } | null>(null);
  const [error, setError] = useState("");
  const [kwFilter, setKwFilter] = useState<"all" | "roadmap" | "cocoon" | "gsc">("all");
  const [showAllKw, setShowAllKw] = useState(false);

  useEffect(() => {
    // Load site config + smart keywords in parallel
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch("/api/keywords/suggest").then(r => r.json()),
    ]).then(([settingsData, kwData]) => {
      if (!settingsData.error) {
        setSite({
          business_name: settingsData.business_name ?? "",
          industry: settingsData.industry ?? "",
          keywords: Array.isArray(settingsData.keywords) ? settingsData.keywords : [],
          target_languages: Array.isArray(settingsData.target_languages) && settingsData.target_languages.length > 0
            ? settingsData.target_languages
            : ["fr"],
        });
        if (Array.isArray(settingsData.target_languages) && settingsData.target_languages.length > 0) {
          setLanguage(settingsData.target_languages[0]);
        }
      }
      if (!kwData.error && kwData.suggestions) {
        setSmartKeywords(kwData.suggestions);
        // Auto-select the first suggestion
        if (kwData.suggestions.length > 0) {
          setKeyword(kwData.suggestions[0].keyword);
        }
      }
    });
  }, []);

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === "generating" || status === "publishing") {
      setElapsed(0);
      const id = setInterval(() => setElapsed(s => s + 1), 1000);
      return () => clearInterval(id);
    }
  }, [status]);

  // Animate detail lines appearing one by one
  useEffect(() => {
    if (status !== "generating") return;
    const details = stepDetails[currentStep];
    if (!details || details.length === 0) return;

    // Reset visible count for this step
    setVisibleDetails(prev => ({ ...prev, [currentStep]: 0 }));

    let count = 0;
    const step = currentStep;
    const id = setInterval(() => {
      count++;
      setVisibleDetails(prev => ({ ...prev, [step]: count }));
      if (count >= details.length) clearInterval(id);
    }, 600);

    return () => clearInterval(id);
  }, [currentStep, status, stepDetails]);

  const activeKeyword = customKeyword.trim() || keyword;

  // Filtered keywords
  const filteredKeywords = kwFilter === "all"
    ? smartKeywords
    : smartKeywords.filter(k => k.source === kwFilter);

  // Agent step name → STEPS index mapping
  const AGENT_TO_STEP: Record<string, number> = {
    intent: 0, serp: 1, diff: 2, structure: 3,
    content: 4, linking: 5, risk: 6, ctr: 7,
  };

  async function runGeneration() {
    setCurrentStep(0);

    type ApiResult = {
      title: string;
      content: string;
      meta_description: string;
      cover_image_query?: string | null;
      cover_alt_text?: string | null;
      section_image_queries?: string[];
      structured?: {
        hero: StructuredData["hero"];
        quick_answer: string;
        sections: StructuredData["sections"];
        insights: StructuredData["insights"];
        mistakes: StructuredData["mistakes"];
        faq: StructuredData["faq"];
        cta: StructuredData["cta"];
        internal_links: StructuredData["internal_links"];
      };
    };

    // Use SSE streaming for progress, fallback to non-streaming
    let apiResult: ApiResult | null = null;
    let streamMaxStep = -1;

    try {
      const genRes = await fetch("/api/generate?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          businessName: site?.business_name ?? "",
          industry: site?.industry ?? "",
          language,
        }),
      });

      if (!genRes.ok) {
        const data = await genRes.json();
        throw new Error(data.error || "Erreur lors de la génération");
      }

      const reader = genRes.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: {
              type: string;
              step?: number;
              agent?: string;
              details?: string[];
              result?: ApiResult;
              error?: string;
            };
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (event.type === "progress" && event.agent) {
              const idx = AGENT_TO_STEP[event.agent];
              if (idx !== undefined) {
                setStepOutcomes(prev => {
                  const next = { ...prev };
                  for (let i = 0; i < idx; i++) {
                    if (!next[i]) next[i] = "success";
                  }
                  return next;
                });
                if (event.details) {
                  setStepDetails(prev => ({ ...prev, [idx]: event.details! }));
                }
                setCurrentStep(idx);
                streamMaxStep = Math.max(streamMaxStep, idx);
              }
            } else if (event.type === "done" && event.result) {
              apiResult = event.result;
              setStepOutcomes(prev => {
                const next = { ...prev };
                for (let i = 0; i < STEPS.length; i++) {
                  if (!next[i]) next[i] = "success";
                }
                return next;
              });
              setCurrentStep(STEPS.length);
            } else if (event.type === "error") {
              throw new Error(event.error || "Erreur de génération");
            }
          }
        }
      }
    } catch (streamErr) {
      // If it's a real error from the pipeline, rethrow
      if (streamErr instanceof Error && streamErr.message !== "Failed to fetch") {
        throw streamErr;
      }
    }

    // Fallback: non-streaming call only if stream returned nothing at all
    // (i.e. SSE never connected). If stream progressed past step 2, it was
    // a late timeout — retrying the full pipeline would just timeout again.
    if (!apiResult) {
      if (streamMaxStep >= 2) {
        // Stream progressed far — retrying the full pipeline would just timeout again
        throw new Error("La génération a été interrompue par un timeout serveur. Réessayez — le pipeline reprendra du début.");
      }

      console.warn("[generate] SSE stream returned no result, falling back to non-streaming API");

      // Simulate step progression during non-streaming call
      const progressInterval = setInterval(() => {
        setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
      }, 8000);

      let fallbackRes: Response;
      try {
        fallbackRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: activeKeyword,
            businessName: site?.business_name ?? "",
            industry: site?.industry ?? "",
            language,
          }),
        });
      } catch (fetchErr) {
        clearInterval(progressInterval);
        throw new Error("Erreur réseau — vérifiez votre connexion et réessayez");
      }

      clearInterval(progressInterval);

      if (!fallbackRes.ok) {
        const data = await fallbackRes.json();
        throw new Error(data.error || "Erreur lors de la génération");
      }

      apiResult = await fallbackRes.json() as ApiResult;

      // Mark all steps done
      setStepOutcomes(Object.fromEntries(STEPS.map((_, i) => [i, "success" as const])));
      setCurrentStep(STEPS.length);
    }

    if (!apiResult?.title) {
      throw new Error("Réponse invalide du pipeline de génération");
    }

    const structured: StructuredData | null = apiResult.structured ? {
      hero: apiResult.structured.hero ?? { title: apiResult.title, subtitle: "", promise: "", cta: null },
      quick_answer: apiResult.structured.quick_answer ?? "",
      key_stats: [],
      simulation: { title: "", scenario: "", result: "" },
      sections: apiResult.structured.sections ?? [],
      insights: apiResult.structured.insights ?? [],
      mistakes: apiResult.structured.mistakes ?? [],
      faq: apiResult.structured.faq ?? [],
      cta: apiResult.structured.cta ?? { text: "", button_text: "", button_url: null },
      internal_links: apiResult.structured.internal_links ?? [],
    } : null;

    const article: GeneratedArticle = {
      title: apiResult.title,
      content: apiResult.content,
      meta_description: apiResult.meta_description,
      cover_image_query: apiResult.cover_image_query ?? null,
      cover_alt_text: apiResult.cover_alt_text ?? null,
      section_image_queries: apiResult.section_image_queries ?? null,
      structured,
    };

    setGenerated(article);

    if (previewMode) {
      setStatus("preview");
    } else {
      await publishArticle(article);
    }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeKeyword) return;

    setStatus("generating");
    setCurrentStep(0);
    setStepOutcomes({});
    setStepDetails({});
    setVisibleDetails({});
    setError("");
    setResult(null);
    setGenerated(null);

    try {
      await runGeneration();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  async function publishArticle(article: GeneratedArticle) {
    setStatus("publishing");

    try {
      const pubRes = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          content: article.content,
          meta_description: article.meta_description,
          keyword: activeKeyword,
          cover_image_query: article.cover_image_query ?? null,
          cover_alt_text: article.cover_alt_text ?? null,
          section_image_queries: article.section_image_queries ?? [],
        }),
      });

      const data = await pubRes.json();

      if (!pubRes.ok) {
        throw new Error(data.error || "Erreur lors de la publication");
      }

      if (data.warning) {
        console.warn("[publish] Warning:", data.warning);
      }

      setResult({ title: article.title, url: data.url, meta: article.meta_description });

      // Roadmap integration (non-blocking)
      try {
        await fetch("/api/roadmap/integrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: activeKeyword,
            title: article.title,
            url: data.url,
          }),
        });
      } catch {
        console.warn("[roadmap-integrate] failed");
      }

      // Retroactive internal linking (non-blocking)
      try {
        const retroRes = await fetch("/api/internal-linking/retroactive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: activeKeyword,
            title: article.title,
            url: data.url,
          }),
        });
        if (retroRes.ok) {
          const retroData = await retroRes.json();
          if (retroData.result?.updated_pages?.length > 0) {
            console.log(`[retroactive] ${retroData.result.updated_pages.length} pages mises à jour`);
          }
        }
      } catch {
        console.warn("[retroactive-linking] failed");
      }

      setStatus("done");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden">

      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-orange-600/8 rounded-full blur-3xl animate-orb" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-red-600/8 rounded-full blur-3xl animate-orb delay-400" />
      </div>

      <div className={`relative mx-auto px-6 py-12 transition-all duration-500 ${status === "preview" ? "max-w-4xl" : "max-w-2xl"}`}>

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-6">
            <Link href="/dashboard" className="text-2xl font-black tracking-tight">
              Rank<span className="bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">Pill</span>
            </Link>
            <Link
              href="/dashboard"
              className="text-gray-500 hover:text-white text-sm px-4 py-2 rounded-lg border border-white/10 hover:border-white/20 transition-colors"
            >
              ← Dashboard
            </Link>
          </div>
          <h1 className="text-3xl font-black mb-2">Générer un article</h1>
          <p className="text-gray-500">
            {site ? (
              <>Pour <span className="text-orange-400 font-bold">{site.business_name}</span> — {site.industry}</>
            ) : (
              "Chargement..."
            )}
          </p>
        </div>

        {/* ── Formulaire ── */}
        {(status === "idle" || status === "error") ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Keyword picker — Top recommendations + dropdown */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-4">
                1. Mot-clé cible
              </label>

              {/* Top 5 recommendations */}
              {smartKeywords.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                  {smartKeywords.slice(0, 5).map((kw, i) => {
                    const badge = SOURCE_BADGES[kw.source];
                    const isSelected = keyword === kw.keyword && !customKeyword.trim();
                    const bars = scoreBars(kw.score);
                    const sColor = scoreColor(kw.score);
                    return (
                      <button
                        key={kw.keyword}
                        type="button"
                        onClick={() => { setKeyword(kw.keyword); setCustomKeyword(""); setShowAllKw(false); }}
                        style={{ animationDelay: `${i * 100}ms`, animationFillMode: "both" }}
                        className={`animate-fade-in-up flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? "bg-orange-500/15 border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                            : "bg-white/[0.02] border-white/[0.06] hover:border-orange-500/25 hover:bg-white/[0.04]"
                        }`}
                      >
                        {/* Rank */}
                        <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${isSelected ? "text-orange-400" : "text-gray-600"}`}>
                          {i + 1}
                        </span>
                        {/* Score bars */}
                        <span className="flex items-end gap-[2px] flex-shrink-0" title={`Score: ${kw.score}/100`}>
                          {[1, 2, 3, 4, 5].map(b => (
                            <span
                              key={b}
                              className="w-[3px] rounded-full"
                              style={{ height: `${4 + b * 2}px`, background: b <= bars ? sColor : "rgba(255,255,255,0.06)" }}
                            />
                          ))}
                        </span>
                        {/* Keyword + meta */}
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-bold block truncate ${isSelected ? "text-orange-300" : "text-white"}`}>
                            {kw.keyword}
                          </span>
                          <span className="text-[10px] text-gray-600 block mt-0.5 truncate">
                            {kw.reason}
                            {kw.gsc ? ` · pos ${kw.gsc.position} · ${kw.gsc.impressions} imp` : ""}
                          </span>
                        </div>
                        {/* Badges */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase" style={{ background: badge.bg, color: badge.color }}>
                            {badge.label}
                          </span>
                          {ROLE_LABELS[kw.role] && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase bg-white/[0.05] text-gray-500">
                              {ROLE_LABELS[kw.role]}
                            </span>
                          )}
                        </div>
                        {/* Check */}
                        {isSelected && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* "Voir plus" dropdown */}
              {smartKeywords.length > 5 && (
                <div className="relative mb-4">
                  <button
                    type="button"
                    onClick={() => setShowAllKw(!showAllKw)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] text-gray-500 hover:text-gray-300 text-xs font-bold transition-all"
                  >
                    <span>{smartKeywords.length - 5} autres mots-clés disponibles</span>
                    <svg
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`w-3.5 h-3.5 transition-transform ${showAllKw ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>

                  {showAllKw && (
                    <div
                      className="mt-2 rounded-xl border border-white/[0.06] bg-[#0c0c0c] overflow-hidden"
                      style={{ maxHeight: "280px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "rgba(249,115,22,0.2) transparent" }}
                    >
                      {/* Source filters inside dropdown */}
                      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.04] sticky top-0 bg-[#0c0c0c] z-10">
                        {([
                          { key: "all" as const, label: "Tous", count: smartKeywords.length - 5 },
                          { key: "roadmap" as const, label: "Roadmap", count: smartKeywords.slice(5).filter(k => k.source === "roadmap").length },
                          { key: "cocoon" as const, label: "Cocon", count: smartKeywords.slice(5).filter(k => k.source === "cocoon").length },
                          { key: "gsc" as const, label: "GSC", count: smartKeywords.slice(5).filter(k => k.source === "gsc").length },
                        ]).filter(f => f.key === "all" || f.count > 0).map(f => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setKwFilter(f.key)}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${
                              kwFilter === f.key
                                ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                                : "text-gray-600 hover:text-gray-400"
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      {/* Remaining keywords list */}
                      <div className="py-1">
                        {smartKeywords.slice(5)
                          .filter(k => kwFilter === "all" || k.source === kwFilter)
                          .map((kw) => {
                            const badge = SOURCE_BADGES[kw.source];
                            const isSelected = keyword === kw.keyword && !customKeyword.trim();
                            return (
                              <button
                                key={kw.keyword}
                                type="button"
                                onClick={() => { setKeyword(kw.keyword); setCustomKeyword(""); setShowAllKw(false); }}
                                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
                                  isSelected
                                    ? "bg-orange-500/10"
                                    : "hover:bg-white/[0.03]"
                                }`}
                              >
                                <span className={`text-xs font-bold truncate flex-1 ${isSelected ? "text-orange-300" : "text-gray-300"}`}>
                                  {kw.keyword}
                                </span>
                                <span className="text-[10px] text-gray-600 flex-shrink-0">
                                  {kw.score}/100
                                </span>
                                <span className="text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase flex-shrink-0" style={{ background: badge.bg, color: badge.color }}>
                                  {badge.label}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Custom keyword input */}
              <div className="relative">
                <input
                  type="text"
                  value={customKeyword}
                  onChange={(e) => setCustomKeyword(e.target.value)}
                  placeholder="Ou saisir un mot-clé personnalisé..."
                  className="w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500/50 transition-colors text-sm"
                />
                {customKeyword && (
                  <button
                    type="button"
                    onClick={() => setCustomKeyword("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                  >
                    ×
                  </button>
                )}
              </div>
              {activeKeyword && (
                <p className="mt-3 text-xs text-gray-500">
                  Mot-clé sélectionné : <span className="text-orange-400 font-bold">{activeKeyword}</span>
                </p>
              )}
            </div>

            {/* Language picker */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-4">
                2. Langue de l&apos;article
              </label>
              <div className="grid grid-cols-5 gap-2">
                {LOCALES.map((l) => {
                  const available = !site || site.target_languages.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      onClick={() => available && setLanguage(l)}
                      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-bold transition-all ${
                        language === l
                          ? "bg-orange-500/10 border-orange-500/40 text-orange-400"
                          : available
                          ? "bg-white/[0.03] border-white/[0.08] text-gray-400 hover:border-white/20 hover:text-gray-300"
                          : "bg-white/[0.02] border-white/[0.04] text-gray-700 cursor-not-allowed opacity-40"
                      }`}
                    >
                      <span className="text-xl">{localeFlags[l]}</span>
                      <span>{localeNames[l].slice(0, 3)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview checkbox */}
            <label
              className={`flex items-center gap-4 cursor-pointer select-none p-4 rounded-xl border transition-all ${
                previewMode
                  ? "bg-orange-500/10 border-orange-500/40"
                  : "bg-white/[0.03] border-white/[0.07] hover:border-white/20"
              }`}
            >
              <input
                type="checkbox"
                checked={previewMode}
                onChange={(e) => setPreviewMode(e.target.checked)}
                className="w-5 h-5 accent-orange-500 cursor-pointer flex-shrink-0"
              />
              <div>
                <p className={`text-sm font-bold transition-colors ${previewMode ? "text-orange-400" : "text-gray-300"}`}>
                  Prévisualiser avant publication
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Relisez et validez l&apos;article avant qu&apos;il soit publié sur votre site
                </p>
              </div>
            </label>

            {status === "error" && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-red-400 text-sm font-bold">Erreur</p>
                <p className="text-gray-400 text-sm mt-1">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!activeKeyword}
              className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl transition-all uppercase tracking-wide shadow-lg shadow-orange-500/20 text-sm"
            >
              {previewMode ? "Générer et prévisualiser" : "Générer et publier l'article"}
            </button>
          </form>

        ) : status === "generating" || status === "publishing" ? (() => {
          const clampedStep = Math.min(currentStep, STEPS.length - 1);
          const allDone = currentStep >= STEPS.length;
          const pct = allDone ? 100 : Math.round((currentStep / STEPS.length) * 100);
          const orbitRadius = 180;

          // Active step details
          const activeDetails = stepDetails[clampedStep] ?? [];
          const activeVisibleCount = visibleDetails[clampedStep] ?? (allDone ? activeDetails.length : 0);

          return (
          <div className="relative flex flex-col items-center" style={{ minHeight: "calc(100vh - 200px)" }}>

            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full" style={{ background: "radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 60%)", animation: "pulse 5s ease-in-out infinite" }} />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full" style={{ background: "radial-gradient(ellipse, rgba(239,68,68,0.05) 0%, transparent 70%)" }} />
            </div>

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between w-full mb-4">
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full" style={{ background: allDone ? "rgba(34,197,94,0.15)" : "rgba(249,115,22,0.1)", animation: "ringPulse 2s ease-out infinite" }} />
                  <div className="w-4 h-4 rounded-full" style={{ background: allDone ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #f97316, #ef4444)", boxShadow: `0 0 12px ${allDone ? "rgba(34,197,94,0.5)" : "rgba(249,115,22,0.5)"}` }} />
                </div>
                <div>
                  <h2 className="text-white font-black text-sm tracking-tight">
                    {allDone ? "Finalisation" : status === "publishing" ? "Publication" : "Génération"} en cours
                  </h2>
                  <p className="text-gray-600 text-[11px]">
                    <span className="text-orange-400 font-bold">{activeKeyword}</span> &middot; {localeNames[language]}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span className="text-orange-400/60 text-[10px]">{pct}%</span>
                <span className="text-gray-600">|</span>
                <span className="text-orange-400 font-black text-xs tabular-nums">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}</span>
              </div>
            </div>

            {/* ── Orbital ring — full width ── */}
            <div className="relative z-10 flex items-center justify-center" style={{ width: `${orbitRadius * 2 + 120}px`, height: `${orbitRadius * 2 + 120}px`, maxWidth: "100%" }}>

              {/* Rotating orbit track */}
              <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${orbitRadius * 2 + 120} ${orbitRadius * 2 + 120}`}>
                <circle
                  cx={orbitRadius + 60} cy={orbitRadius + 60} r={orbitRadius}
                  fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1"
                />
                {/* Progress arc */}
                <circle
                  cx={orbitRadius + 60} cy={orbitRadius + 60} r={orbitRadius}
                  fill="none" stroke="url(#orbitGrad)" strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * orbitRadius}`}
                  strokeDashoffset={`${2 * Math.PI * orbitRadius * (1 - pct / 100)}`}
                  style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)", transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
                />
                <defs>
                  <linearGradient id="orbitGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Rotating particle ring */}
              <div className="absolute inset-0" style={{ animation: "orbitSpin 30s linear infinite" }}>
                {[0, 45, 120, 200, 280].map((deg) => (
                  <div
                    key={deg}
                    className="absolute w-1 h-1 rounded-full"
                    style={{
                      left: `calc(50% + ${Math.cos((deg * Math.PI) / 180) * (orbitRadius + 15)}px)`,
                      top: `calc(50% + ${Math.sin((deg * Math.PI) / 180) * (orbitRadius + 15)}px)`,
                      background: "rgba(249,115,22,0.3)",
                      boxShadow: "0 0 4px rgba(249,115,22,0.4)",
                    }}
                  />
                ))}
              </div>

              {/* Agent nodes */}
              {STEPS.map((step, i) => {
                const isDone = i < currentStep;
                const isActive = i === clampedStep && !allDone;
                const angle = (i / STEPS.length) * 360 - 90;
                const rad = (angle * Math.PI) / 180;
                const x = Math.cos(rad) * orbitRadius;
                const y = Math.sin(rad) * orbitRadius;
                const nodeSize = isActive ? 48 : isDone ? 40 : 36;

                return (
                  <div
                    key={step.id}
                    className="absolute flex items-center justify-center"
                    style={{
                      left: `calc(50% + ${x}px - ${nodeSize / 2}px)`,
                      top: `calc(50% + ${y}px - ${nodeSize / 2}px)`,
                      width: nodeSize, height: nodeSize,
                      zIndex: isActive ? 20 : 5,
                      animation: isDone ? `nodeEntry 0.5s ease-out ${i * 0.05}s both` : undefined,
                      transition: "all 0.6s cubic-bezier(0.34,1.56,0.64,1)",
                    }}
                  >
                    {/* Active pulse rings */}
                    {isActive && (
                      <>
                        <div className="absolute inset-[-8px] rounded-full" style={{ border: "1px solid rgba(249,115,22,0.2)", animation: "ringPulse 2s ease-out infinite" }} />
                        <div className="absolute inset-[-16px] rounded-full" style={{ border: "1px solid rgba(249,115,22,0.1)", animation: "ringPulse 2s ease-out 0.6s infinite" }} />
                      </>
                    )}

                    {/* Node circle */}
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center"
                      style={{
                        background: allDone
                          ? "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(34,197,94,0.1))"
                          : isDone
                          ? "linear-gradient(135deg, rgba(249,115,22,0.25), rgba(249,115,22,0.1))"
                          : isActive
                          ? "linear-gradient(135deg, #f97316, #ef4444)"
                          : "rgba(255,255,255,0.03)",
                        border: allDone
                          ? "2px solid rgba(34,197,94,0.4)"
                          : isDone
                          ? "2px solid rgba(249,115,22,0.35)"
                          : isActive
                          ? "2px solid rgba(249,115,22,0.8)"
                          : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: isActive
                          ? "0 0 25px rgba(249,115,22,0.4), 0 0 50px rgba(249,115,22,0.1)"
                          : isDone
                          ? "0 0 10px rgba(249,115,22,0.1)"
                          : "none",
                        color: allDone ? "#22c55e" : isDone ? "#f97316" : isActive ? "white" : "#4b5563",
                        animation: allDone && i === STEPS.length - 1 ? "completePulse 1.5s ease-out" : undefined,
                      }}
                    >
                      {isDone || allDone ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      ) : isActive ? (
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.15)" strokeWidth="2"/>
                          <path d="M12 3a9 9 0 019 9" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <span className="text-[10px] font-black">{i + 1}</span>
                      )}
                    </div>

                    {/* Label — positioned outward from orbit center */}
                    {(() => {
                      // Place label on the outside of the orbit, away from center
                      const labelOffset = nodeSize / 2 + 10;
                      const isTop = y < -40;
                      const isBottom = y > 40;
                      const isLeft = x < -40;
                      const isRight = x > 40;

                      const labelStyle: React.CSSProperties = {
                        color: isActive ? "#fb923c" : isDone || allDone ? "rgba(249,115,22,0.45)" : "rgba(255,255,255,0.1)",
                      };

                      if (isTop) {
                        // Above — label on top
                        labelStyle.bottom = `calc(100% + 8px)`;
                        labelStyle.left = "50%";
                        labelStyle.transform = "translateX(-50%)";
                      } else if (isBottom) {
                        // Below — label on bottom
                        labelStyle.top = `calc(100% + 8px)`;
                        labelStyle.left = "50%";
                        labelStyle.transform = "translateX(-50%)";
                      } else if (isRight) {
                        // Right side — label to the right
                        labelStyle.left = `calc(100% + 10px)`;
                        labelStyle.top = "50%";
                        labelStyle.transform = "translateY(-50%)";
                      } else if (isLeft) {
                        // Left side — label to the left
                        labelStyle.right = `calc(100% + 10px)`;
                        labelStyle.top = "50%";
                        labelStyle.transform = "translateY(-50%)";
                      } else {
                        // Fallback — below
                        labelStyle.top = `calc(100% + 8px)`;
                        labelStyle.left = "50%";
                        labelStyle.transform = "translateX(-50%)";
                      }

                      return (
                        <span
                          className="absolute whitespace-nowrap text-[9px] font-bold pointer-events-none transition-all duration-500"
                          style={labelStyle}
                        >
                          {step.agent}
                        </span>
                      );
                    })()}
                  </div>
                );
              })}

              {/* Center hub */}
              <div className="relative z-30 flex flex-col items-center text-center">
                <div className="text-3xl font-black tabular-nums mb-1" style={{ color: allDone ? "#22c55e" : "#f97316" }} key={`step-${currentStep}`}>
                  {Math.min(currentStep + 1, STEPS.length)}<span className="text-gray-700 text-xl font-bold">/{STEPS.length}</span>
                </div>
                <p className="text-white font-bold text-sm leading-tight max-w-[160px]" key={`label-${clampedStep}`} style={{ animation: "fadeIn 0.4s ease" }}>
                  {allDone ? "Terminé" : STEPS[clampedStep]?.agent}
                </p>
                <p className="text-gray-500 text-[10px] mt-0.5 max-w-[140px]" key={`sub-${clampedStep}`} style={{ animation: "fadeIn 0.4s ease 0.1s both" }}>
                  {allDone ? "Tous les agents ont terminé" : STEPS[clampedStep]?.label}
                </p>
              </div>
            </div>

            {/* ── Detail panel — below the orbit ── */}
            {!allDone && activeDetails.length > 0 && (
              <div
                className="relative z-10 w-full mt-6 rounded-xl overflow-hidden"
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(249,115,22,0.1)", animation: "detailSlideIn 0.4s ease-out" }}
                key={`details-${clampedStep}`}
              >
                {/* Header */}
                <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <svg className="w-3 h-3 animate-spin text-orange-400" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="rgba(249,115,22,0.2)" strokeWidth="2"/>
                    <path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className="text-[11px] font-bold text-orange-400">
                    {STEPS[clampedStep]?.agent}
                  </span>
                  <span className="text-[9px] text-gray-500 mx-1">—</span>
                  <span className="text-[10px] text-gray-500">{STEPS[clampedStep]?.label}</span>
                  <span className="text-[9px] text-gray-700 ml-auto">agent/{STEPS[clampedStep]?.id}</span>
                </div>
                {/* Lines */}
                <div className="px-4 py-3 flex flex-col gap-1">
                  {activeDetails.slice(0, activeVisibleCount).map((detail, j) => {
                    const isLast = j === activeVisibleCount - 1;
                    return (
                      <div
                        key={j}
                        className="flex items-start gap-2"
                        style={{ animation: "fadeSlideIn 0.3s ease-out" }}
                      >
                        <span className="flex-shrink-0 mt-1 text-[10px] font-mono" style={{ color: isLast ? "#fb923c" : "rgba(249,115,22,0.3)" }}>
                          {isLast ? "▸" : "✓"}
                        </span>
                        <span className="text-[11px] font-mono leading-relaxed" style={{ color: isLast ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)" }}>
                          {detail}
                          {isLast && (
                            <span className="inline-block w-1.5 h-3.5 bg-orange-400/80 ml-1 rounded-sm" style={{ verticalAlign: "text-bottom", animation: "glowPulse 1s ease-in-out infinite" }} />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completion message */}
            {allDone && (
              <div
                className="relative z-10 w-full mt-6 rounded-xl px-5 py-4 text-center"
                style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", animation: "scaleIn 0.5s cubic-bezier(0.16,1,0.3,1)" }}
              >
                <p className="text-green-400 font-bold text-sm">
                  {status === "publishing" ? "Publication sur votre CMS..." : "Article généré avec succès"}
                </p>
                <p className="text-gray-600 text-[11px] mt-1">
                  {status === "publishing" ? "Envoi vers votre site en cours" : "Préparation de la publication"}
                </p>
              </div>
            )}

            {/* Bottom progress dots */}
            <div className="relative z-10 flex items-center gap-1.5 mt-6">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-500"
                  style={{
                    width: i === clampedStep && !allDone ? 20 : 6,
                    height: 6,
                    background: allDone ? "#22c55e" : i < currentStep ? "#f97316" : i === clampedStep ? "#fb923c" : "rgba(255,255,255,0.06)",
                    boxShadow: i === clampedStep && !allDone ? "0 0 8px rgba(249,115,22,0.5)" : "none",
                  }}
                />
              ))}
            </div>
          </div>
          );
        })()

        : status === "preview" && generated ? (
          /* ── Preview moderne ── */
          <div className="flex flex-col gap-5">
            {/* Bandeau */}
            <div className="flex items-center justify-between bg-orange-500/10 border border-orange-500/30 rounded-2xl px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">👁</span>
                <div>
                  <p className="font-black text-orange-400 text-sm uppercase tracking-wide">Prévisualisation</p>
                  <p className="text-gray-500 text-xs">{localeFlags[language]} {localeNames[language]} · &quot;{activeKeyword}&quot;</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStatus("idle"); setGenerated(null); }}
                  className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 font-bold text-sm transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={() => generated && publishArticle(generated)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-orange-500/20 transition-all"
                >
                  Publier →
                </button>
              </div>
            </div>

            {/* Meta description */}
            <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Meta description</p>
              <p className="text-gray-400 text-sm leading-relaxed">{generated.meta_description}</p>
            </div>

            {generated.structured ? (
              /* ── Rendu structuré via composant SeoPage ── */
              <SeoPage data={generated.structured} title={generated.title} />
            ) : (
              /* ── Fallback : ancien rendu HTML brut ── */
              <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-8 md:p-12">
                <h1 className="text-3xl font-black text-white leading-tight mb-8">
                  {generated.title}
                </h1>
                <div
                  className="prose-article"
                  dangerouslySetInnerHTML={{ __html: generated.content }}
                />
              </div>
            )}

            {/* Boutons bas de page */}
            <div className="flex gap-3">
              <button
                onClick={() => { setStatus("idle"); setGenerated(null); }}
                className="flex-1 px-5 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 font-bold text-sm transition-all"
              >
                Annuler
              </button>
              <button
                onClick={() => generated && publishArticle(generated)}
                className="flex-1 px-5 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-orange-500/20 transition-all"
              >
                Publier l&apos;article →
              </button>
            </div>
          </div>

        ) : status === "done" && result ? (
          /* ── Succès ── */
          <div className="flex flex-col gap-4">
            <div className="bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/30 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center text-xl">✓</div>
                <div>
                  <p className="font-black text-orange-400 uppercase tracking-wide text-sm">Article publié !</p>
                  <p className="text-gray-500 text-xs">{localeFlags[language]} {localeNames[language]} · &quot;{activeKeyword}&quot;</p>
                </div>
              </div>

              <h2 className="text-xl font-black text-white mb-3 leading-snug">{result.title}</h2>

              {result.meta && (
                <p className="text-gray-400 text-sm leading-relaxed mb-5 border-l-2 border-orange-500/30 pl-3">
                  {result.meta}
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-black py-3 rounded-xl transition-all text-sm uppercase tracking-wide shadow-lg shadow-orange-500/20"
                >
                  Voir l&apos;article →
                </a>
                <button
                  onClick={() => { setStatus("idle"); setResult(null); setCustomKeyword(""); setGenerated(null); }}
                  className="flex-1 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.1] text-gray-300 font-bold py-3 rounded-xl transition-all text-sm"
                >
                  Générer un autre
                </button>
              </div>
            </div>

            <Link
              href="/dashboard"
              className="text-center text-gray-600 hover:text-gray-400 text-sm transition-colors"
            >
              ← Retour au dashboard
            </Link>
          </div>
        ) : null}

      </div>
    </main>
  );
}
