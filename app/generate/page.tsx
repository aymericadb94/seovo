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

type SuggestedKeyword = {
  keyword: string;
  source: "roadmap" | "cocoon" | "settings";
  role: "pillar" | "support" | "unknown";
  cluster: string | null;
  phase: number | null;
  priority: "haute" | "moyenne" | "faible";
  reason: string;
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

type IntentResult = {
  intent_type: string;
  user_intent: string;
  serp_analysis: string;
  recommended_content_type: string;
  angle: string;
  risk_level: "low" | "medium" | "high";
  decision: "create" | "optimize" | "ignore";
  justification: string;
  cannibalization_target?: string;
};

type PositionResult = {
  page_type: "pillar" | "support" | "complementary";
  seo_role: string;
  priority: "high" | "medium" | "low";
  pillar_relation: string;
  supporting_pages: string[];
  internal_conflicts: string[];
  linking_strategy: {
    outgoing: { target: string; anchor: string; reason: string }[];
    incoming: { source: string; anchor: string; reason: string }[];
  };
  roadmap_position: string;
  risk_level: "low" | "medium" | "high";
  justification: string;
};

type EditorialPlanResult = {
  sections: {
    title: string;
    objective: string;
    content_points: string[];
    examples: string[];
    seo_notes: string;
    importance: "high" | "medium" | "low";
  }[];
  content_flow: string;
  differentiation_points: string[];
  global_strategy: string;
};

type FeaturedSnippetResult = {
  snippet_type: "definition" | "list" | "steps";
  snippet_text: string;
  structured_version: string[];
  placement: "top" | "after_intro";
  integration_text: string;
  justification: string;
};

type ContentStructureResult = {
  h1: string;
  h2_structure: {
    title: string;
    h3: string[];
  }[];
  featured_snippet_section: {
    type: "definition" | "list" | "answer";
    title: string;
    reason: string;
  };
};

type KeywordStrategyResult = {
  primary_keyword: string;
  secondary_keywords: string[];
  semantic_field: string[];
  cannibalization_risk: "low" | "medium" | "high";
  conflicting_pages: string[];
  seo_angle: string;
  priority: "high" | "medium" | "low";
  justification: string;
};

type PreGenData = {
  intent?: IntentResult | null;
  position?: PositionResult | null;
  keywords?: KeywordStrategyResult | null;
  structure?: ContentStructureResult | null;
  snippet?: FeaturedSnippetResult | null;
  editorial?: EditorialPlanResult | null;
};

const STEPS = [
  {
    id: "intent",
    label: "Analyse d'intention de recherche",
    sub: "Validation stratégique du mot-clé avant rédaction",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
      </svg>
    ),
  },
  {
    id: "position",
    label: "Positionnement dans le cocon",
    sub: "Rôle stratégique, maillage interne et liens",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="14"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><line x1="12" y1="14" x2="6" y2="16"/><line x1="12" y1="14" x2="18" y2="16"/>
      </svg>
    ),
  },
  {
    id: "keywords",
    label: "Stratégie de mots-clés",
    sub: "Mot-clé principal, secondaires, champ sémantique",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    id: "structure",
    label: "Structure SEO de la page",
    sub: "H1, H2, H3, featured snippet optimisés",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: "snippet",
    label: "Featured snippet (position 0)",
    sub: "Bloc optimisé pour capturer la position 0 Google",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    ),
  },
  {
    id: "editorial",
    label: "Plan éditorial détaillé",
    sub: "Contenu, exemples et différenciation par section",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    id: "write",
    label: "Rédaction de l'article",
    sub: "1 500+ mots structurés H1/H2/H3 optimisés SEO",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    ),
  },
  {
    id: "enrich",
    label: "Enrichissement sémantique",
    sub: "Synonymes, cooccurrences, micro-contenu et fluidité",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
  },
  {
    id: "enhance",
    label: "Valeur ajoutée & crédibilité",
    sub: "Exemples concrets, conseils pratiques, insights experts",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
  },
  {
    id: "linking",
    label: "Maillage interne intelligent",
    sub: "Liens stratégiques, ancres naturelles, cocon sémantique",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
  {
    id: "audit",
    label: "Audit qualité SEO",
    sub: "Détection sur-optimisation, patterns IA, naturalité",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    id: "meta",
    label: "Optimisation title & meta",
    sub: "Title SEO et meta description optimisés pour le CTR",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h6"/>
      </svg>
    ),
  },
  {
    id: "final-check",
    label: "Contrôle final qualité",
    sub: "Validation globale avant publication",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    id: "publish",
    label: "Publication sur votre site",
    sub: "Envoi automatique vers votre CMS",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
      </svg>
    ),
  },
  {
    id: "roadmap",
    label: "Intégration roadmap",
    sub: "Mise à jour de la stratégie SEO globale",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-10"/>
      </svg>
    ),
  },
  {
    id: "retroactive-linking",
    label: "Maillage rétroactif",
    sub: "Mise à jour des anciens articles avec liens vers le nouveau",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    ),
  },
];

const SOURCE_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  roadmap: { label: "Roadmap", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  cocoon: { label: "Cocon", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  settings: { label: "Config", color: "#6b7280", bg: "rgba(107,114,128,0.12)" },
};

export default function GeneratePage() {
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [smartKeywords, setSmartKeywords] = useState<SuggestedKeyword[]>([]);
  const [keyword, setKeyword] = useState("");
  const [customKeyword, setCustomKeyword] = useState("");
  const [language, setLanguage] = useState<Locale>("fr");
  const [previewMode, setPreviewMode] = useState(false);
  const [status, setStatus] = useState<"idle" | "generating" | "preview" | "publishing" | "done" | "error" | "intent-blocked">("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [stepOutcomes, setStepOutcomes] = useState<Record<number, "success" | "skipped" | "failed">>({});
  const [generated, setGenerated] = useState<GeneratedArticle | null>(null);
  const [result, setResult] = useState<{ title: string; url: string; meta?: string } | null>(null);
  const [error, setError] = useState("");
  const [kwFilter, setKwFilter] = useState<"all" | "roadmap" | "cocoon">("all");

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

  const activeKeyword = customKeyword.trim() || keyword;

  // Filtered keywords
  const filteredKeywords = kwFilter === "all"
    ? smartKeywords
    : smartKeywords.filter(k => k.source === kwFilter);

  const [streamText, setStreamText] = useState("");
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);
  const [positionResult, setPositionResult] = useState<PositionResult | null>(null);
  const [keywordStrategy, setKeywordStrategy] = useState<KeywordStrategyResult | null>(null);
  const [contentStructure, setContentStructure] = useState<ContentStructureResult | null>(null);
  const [featuredSnippet, setFeaturedSnippet] = useState<FeaturedSnippetResult | null>(null);
  const [editorialPlan, setEditorialPlan] = useState<EditorialPlanResult | null>(null);

  async function runGeneration(preGen: PreGenData = {}) {
    const localIntent = preGen.intent ?? null;
    const localPosition = preGen.position ?? null;
    const localKeywords = preGen.keywords ?? null;
    const localStructure = preGen.structure ?? null;
    const localSnippet = preGen.snippet ?? null;
    const localEditorial = preGen.editorial ?? null;

    setCurrentStep(6);
    setStreamText("");

    const genRes = await fetch("/api/generate?stream=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: localKeywords?.primary_keyword || activeKeyword,
        businessName: site?.business_name ?? "",
        industry: site?.industry ?? "",
        allKeywords: site?.keywords ?? [],
        language,
        cocoon_position: localPosition ?? undefined,
        keyword_strategy: localKeywords ?? undefined,
        content_structure: localStructure ?? undefined,
        featured_snippet: localSnippet ?? undefined,
        editorial_plan: localEditorial ?? undefined,
        // Activer le moteur SEO intelligent v2
        engine: true,
        intent_analysis: localIntent ?? undefined,
      }),
    });

    if (!genRes.ok) {
      const data = await genRes.json();
      throw new Error(data.error || "Erreur lors de la génération");
    }

    const reader = genRes.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE events from chunk
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as { type: string; text?: string; error?: string; stop_reason?: string; decisions?: unknown[]; context_hash?: string };
              if (event.type === "delta" && event.text) {
                fullText += event.text;
                setStreamText(fullText);
              } else if (event.type === "done" && event.text) {
                fullText = event.text;
                if (event.stop_reason === "max_tokens") {
                  console.warn("[generate] Response truncated (max_tokens hit)");
                }
              } else if (event.type === "engine_meta") {
                // Métadonnées du moteur SEO v2 — log pour debug
                console.log("[engine v2]", event.decisions?.length, "blocs décidés, hash:", event.context_hash);
              } else if (event.type === "error") {
                throw new Error(event.error || "Erreur de génération");
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== "Erreur de génération") continue;
              throw parseErr;
            }
          }
        }
      }

      // Parse the full JSON from streamed text (with truncation repair)
      const parseJson = (text: string) => {
        try { return JSON.parse(text); } catch { /* continue */ }
        const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (codeBlock) try { return JSON.parse(codeBlock[1]); } catch { /* continue */ }
        const s = text.indexOf("{"), e = text.lastIndexOf("}");
        if (s !== -1 && e > s) try { return JSON.parse(text.slice(s, e + 1)); } catch { /* continue */ }
        // Attempt to repair truncated JSON (missing closing braces/quotes)
        if (s !== -1) {
          let truncated = text.slice(s);
          // Close any open string
          const quoteCount = (truncated.match(/(?<!\\)"/g) || []).length;
          if (quoteCount % 2 !== 0) truncated += '"';
          // Close open braces/brackets
          const opens = (truncated.match(/[{[]/g) || []).length;
          const closes = (truncated.match(/[}\]]/g) || []).length;
          for (let i = 0; i < opens - closes; i++) truncated += "}";
          try { return JSON.parse(truncated); } catch { /* continue */ }
        }
        return null;
      };

      const parsed = parseJson(fullText) as {
        title?: string; meta_description?: string; pexels_query?: string; cover_alt_text?: string; section_image_queries?: string[];
        // Nouveau format structuré
        hero?: { title: string; subtitle: string; promise: string; cta: string | null };
        quick_answer?: string;
        key_stats?: { value: string; label: string; source?: string }[];
        simulation?: { title: string; scenario: string; result: string };
        sections?: { title: string; content: string; tip?: string; example?: string }[];
        insights?: { type: "tip" | "warning" | "pro"; text: string }[];
        mistakes?: { title: string; why: string; consequence: string }[];
        faq?: { question: string; answer: string }[];
        cta?: { text: string; button_text: string; button_url: string | null };
        internal_links?: { anchor: string; target: string }[];
        // Ancien format (fallback)
        content?: string; featured_snippet?: string;
      } | null;

      if (!parsed?.title || (!parsed?.sections?.length && !parsed?.content)) {
        console.error("[generate] Parse failed. fullText length:", fullText.length, "parsed:", parsed, "first 500 chars:", fullText.slice(0, 500));
        throw new Error("Impossible de lire la réponse générée — le contenu a peut-être été tronqué. Réessayez.");
      }

      // Assembler le HTML à partir des données structurées (ou fallback ancien format)
      let structuredData: StructuredData | null = null;
      let articleContent: string;

      if (parsed.sections?.length) {
        structuredData = {
          hero: parsed.hero ?? { title: parsed.title, subtitle: "", promise: "", cta: null },
          quick_answer: parsed.quick_answer ?? "",
          key_stats: parsed.key_stats ?? [],
          simulation: parsed.simulation ?? { title: "", scenario: "", result: "" },
          sections: parsed.sections,
          insights: parsed.insights ?? [],
          mistakes: parsed.mistakes ?? [],
          faq: parsed.faq ?? [],
          cta: parsed.cta ?? { text: "", button_text: "", button_url: null },
          internal_links: parsed.internal_links ?? [],
        };
        // Assembler le HTML pour les post-traitements et la publication CMS
        const parts: string[] = [];
        if (parsed.hero) {
          parts.push(`<p><strong>${parsed.hero.subtitle}</strong></p>`);
          parts.push(`<p>${parsed.hero.promise}</p>`);
        }
        if (parsed.quick_answer) {
          parts.push(`<h2>En bref</h2><p>${parsed.quick_answer}</p>`);
        }
        if (parsed.key_stats?.length) {
          parts.push(`<h2>Chiffres clés</h2><ul>${parsed.key_stats.map(s => `<li><strong>${s.value}</strong> — ${s.label}${s.source ? ` <em>(${s.source})</em>` : ""}</li>`).join("")}</ul>`);
        }
        if (parsed.simulation) {
          parts.push(`<h2>${parsed.simulation.title}</h2>${parsed.simulation.scenario}<p><strong>${parsed.simulation.result}</strong></p>`);
        }
        for (const sec of parsed.sections) {
          parts.push(`<h2>${sec.title}</h2>${sec.content}`);
          if (sec.tip) parts.push(`<p><strong>💡</strong> ${sec.tip}</p>`);
          if (sec.example) parts.push(`<p><em>Exemple : ${sec.example}</em></p>`);
        }
        if (parsed.insights?.length) {
          const icons = { tip: "💡", warning: "⚠️", pro: "🔥" } as const;
          for (const i of parsed.insights) parts.push(`<p><strong>${icons[i.type]}</strong> ${i.text}</p>`);
        }
        if (parsed.mistakes?.length) {
          parts.push(`<h2>Erreurs à éviter</h2><ul>${parsed.mistakes.map(m => `<li><strong>${m.title}</strong> — ${m.why} <em>${m.consequence}</em></li>`).join("")}</ul>`);
        }
        if (parsed.faq?.length) {
          parts.push(`<h2>Questions fréquentes</h2>`);
          for (const q of parsed.faq) parts.push(`<h3>${q.question}</h3><p>${q.answer}</p>`);
        }
        if (parsed.cta) parts.push(`<p>${parsed.cta.text}</p>`);
        articleContent = parts.join("\n");
      } else {
        articleContent = parsed.featured_snippet ? parsed.featured_snippet + "\n" + parsed.content! : parsed.content!;
      }

      // ── Helper : appel agent post-gen avec retry ─────────────
      const kw = localKeywords?.primary_keyword || activeKeyword;

      // Track step outcomes for UI feedback
      const stepResults: Record<number, "success" | "skipped" | "failed"> = {};

      async function callAgent<T>(
        step: number,
        url: string,
        body: Record<string, unknown>,
        extract: (data: T) => string | null,
        maxRetries: number = 2,
      ): Promise<void> {
        setCurrentStep(step);
        let lastError = "";

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            if (attempt > 0) {
              // Exponential backoff: 2s, 4s
              await new Promise(r => setTimeout(r, 2000 * attempt));
            }

            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              lastError = `HTTP ${res.status}`;
              if (res.status >= 500 && attempt < maxRetries) continue; // Retry on server errors
              stepResults[step] = "failed";
              console.warn(`[step ${step}] ${url} → ${res.status} (${attempt + 1}/${maxRetries + 1} tentatives)`);
              return;
            }

            const data = await res.json() as T;
            const result = extract(data);
            if (result) {
              const prevLen = articleContent.length;
              articleContent = result;
              stepResults[step] = "success";
              console.log(`[step ${step}] ${url} → OK (${prevLen} → ${result.length} chars, delta: ${result.length - prevLen > 0 ? "+" : ""}${result.length - prevLen})`);
            } else {
              stepResults[step] = "skipped";
              console.log(`[step ${step}] ${url} → skipped (no extractable result)`);
            }
            return;
          } catch (err) {
            lastError = err instanceof Error ? err.message : "Unknown";
            if (attempt < maxRetries) continue; // Retry on network errors
          }
        }

        // All retries exhausted
        stepResults[step] = "failed";
        console.warn(`[step ${step}] ${url} → failed after ${maxRetries + 1} attempts: ${lastError}`);
      }

      // ── Step 7: Enrichissement sémantique ───────────────────
      await callAgent<{ enrichment: { improved_content: string } }>(
        7, "/api/content/enrich",
        {
          content: articleContent,
          title: parsed.title,
          keyword: kw,
          language,
          keyword_strategy: localKeywords ? {
            primary_keyword: localKeywords.primary_keyword,
            secondary_keywords: localKeywords.secondary_keywords,
            semantic_field: localKeywords.semantic_field,
          } : undefined,
          intent_analysis: localIntent ? {
            intent_type: localIntent.intent_type,
            user_intent: localIntent.user_intent,
          } : undefined,
        },
        (d) => d.enrichment?.improved_content ?? null,
      );

      // ── Step 8: Valeur ajoutée & crédibilité ───────────────
      await callAgent<{ enhancement: { enhanced_content: string } }>(
        8, "/api/content/enhance",
        {
          content: articleContent,
          title: parsed.title,
          keyword: kw,
          language,
          intent_analysis: localIntent ? {
            intent_type: localIntent.intent_type,
            user_intent: localIntent.user_intent,
            recommended_content_type: localIntent.recommended_content_type,
            angle: localIntent.angle,
          } : undefined,
          keyword_strategy: localKeywords ? {
            primary_keyword: localKeywords.primary_keyword,
            seo_angle: localKeywords.seo_angle,
          } : undefined,
        },
        (d) => d.enhancement?.enhanced_content ?? null,
      );

      // ── Step 9: Maillage interne intelligent ────────────────
      await callAgent<{ linking: { updated_content: string } }>(
        9, "/api/content/linking",
        {
          content: articleContent,
          title: parsed.title,
          keyword: kw,
          language,
          cocoon_positioning: localPosition ? {
            page_type: localPosition.page_type,
            seo_role: localPosition.seo_role,
            pillar_relation: localPosition.pillar_relation,
            linking_strategy: localPosition.linking_strategy,
            risk_level: localPosition.risk_level,
          } : undefined,
        },
        (d) => d.linking?.updated_content ?? null,
      );

      // ── Step 10: Audit qualité SEO ──────────────────────────
      await callAgent<{ audit: { corrected_content: string } }>(
        10, "/api/content/audit",
        {
          content: articleContent,
          primary_keyword: kw,
          secondary_keywords: localKeywords?.secondary_keywords,
          semantic_field: localKeywords?.semantic_field,
          language,
        },
        (d) => d.audit?.corrected_content ?? null,
      );

      // ── Step 11: Optimisation title & meta ──────────────────
      setCurrentStep(11);
      let optimizedTitle = parsed.title;
      let optimizedMeta = parsed.meta_description ?? "";

      for (let attempt = 0; attempt <= 2; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
          const metaRes = await fetch("/api/content/meta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              primary_keyword: kw,
              secondary_keywords: localKeywords?.secondary_keywords,
              content_summary: articleContent.slice(0, 500).replace(/<[^>]+>/g, ""),
              intent_analysis: localIntent ? {
                intent_type: localIntent.intent_type,
                user_intent: localIntent.user_intent,
                recommended_content_type: localIntent.recommended_content_type,
                angle: localIntent.angle,
              } : undefined,
              seo_angle: localKeywords?.seo_angle,
              language,
            }),
          });
          if (metaRes.ok) {
            const metaData = await metaRes.json() as { meta: { titles: string[]; meta_descriptions: string[] } };
            if (metaData.meta?.titles?.[0]) optimizedTitle = metaData.meta.titles[0];
            if (metaData.meta?.meta_descriptions?.[0]) optimizedMeta = metaData.meta.meta_descriptions[0];
            stepResults[11] = "success";
            break;
          }
          if (metaRes.status >= 500 && attempt < 2) continue;
          stepResults[11] = "failed";
          break;
        } catch (err) {
          if (attempt >= 2) {
            stepResults[11] = "failed";
            console.warn("[step 11] /api/content/meta →", err);
          }
        }
      }

      // ── Step 12: Contrôle final qualité ─────────────────────
      await callAgent<{ check: { final_content: string; final_verdict: string } }>(
        12, "/api/content/final-check",
        {
          content: articleContent,
          title: optimizedTitle,
          meta_description: optimizedMeta,
          primary_keyword: kw,
          seo_structure: localStructure ? {
            h1: localStructure.h1,
            sections: localStructure.h2_structure?.map(s => ({
              h2: s.title,
              subsections: s.h3?.map(h3 => ({ h3 })),
            })),
          } : undefined,
          cocoon_positioning: localPosition ? {
            page_type: localPosition.page_type,
            seo_role: localPosition.seo_role,
            pillar_relation: localPosition.pillar_relation,
            risk_level: localPosition.risk_level,
          } : undefined,
          language,
        },
        (d) => d.check?.final_content && d.check.final_verdict !== "rewrite" ? d.check.final_content : null,
      );

      // Persist step outcomes to state for UI display
      setStepOutcomes({ ...stepResults });

      // ── Re-parser les données structurées depuis le HTML post-traité ──
      // Les agents ont modifié articleContent — on reconstruit structuredData
      if (structuredData) {
        // Re-extraire les sections depuis le HTML post-traité
        // Le contenu des sections a été amélioré par les agents
        const updatedSections: typeof structuredData.sections = [];
        const h2Regex = /<h2>(.*?)<\/h2>([\s\S]*?)(?=<h2>|$)/gi;
        let match;
        const skipH2s = new Set(["en bref", "chiffres clés", "erreurs à éviter", "questions fréquentes"]);
        while ((match = h2Regex.exec(articleContent)) !== null) {
          const h2Title = match[1].trim();
          if (skipH2s.has(h2Title.toLowerCase())) continue;
          const sectionHtml = match[2].trim();
          // Chercher les tips et exemples dans le contenu
          const tipMatch = sectionHtml.match(/<p><strong>💡<\/strong>\s*(.*?)<\/p>/);
          const exampleMatch = sectionHtml.match(/<p><em>Exemple\s*:\s*(.*?)<\/em><\/p>/);
          const cleanContent = sectionHtml
            .replace(/<p><strong>💡<\/strong>.*?<\/p>/g, "")
            .replace(/<p><em>Exemple\s*:.*?<\/em><\/p>/g, "")
            .trim();
          updatedSections.push({
            title: h2Title,
            content: cleanContent,
            tip: tipMatch?.[1],
            example: exampleMatch?.[1],
          });
        }
        if (updatedSections.length > 0) {
          structuredData = { ...structuredData, sections: updatedSections };
        }
      }

      const article: GeneratedArticle = {
        title: optimizedTitle,
        content: articleContent,
        meta_description: optimizedMeta,
        cover_image_query: parsed.pexels_query ?? null,
        cover_alt_text: parsed.cover_alt_text ?? null,
        section_image_queries: parsed.section_image_queries ?? null,
        structured: structuredData,
      };

      setGenerated(article);

      if (previewMode) {
        setStatus("preview");
      } else {
        await publishArticle(article, localPosition);
      }
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeKeyword) return;

    setStatus("generating");
    setCurrentStep(0);
    setStepOutcomes({});
    setError("");
    setResult(null);
    setGenerated(null);
    setStreamText("");
    setIntentResult(null);
    setPositionResult(null);
    setKeywordStrategy(null);
    setContentStructure(null);
    setFeaturedSnippet(null);
    setEditorialPlan(null);

    try {
      // ── Step 0: Intent analysis ──────────────────────────────
      const intentRes = await fetch("/api/keywords/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: activeKeyword }),
      });

      if (!intentRes.ok) {
        const data = await intentRes.json();
        throw new Error(data.error || "Erreur lors de l'analyse d'intention");
      }

      const intentData = await intentRes.json() as { analysis: IntentResult };
      const analysis = intentData.analysis;
      setIntentResult(analysis);

      // Block if decision is "ignore" or "optimize"
      if (analysis.decision === "ignore" || analysis.decision === "optimize") {
        setStatus("intent-blocked");
        return;
      }

      // ── Step 1: Cocoon positioning ───────────────────────────
      setCurrentStep(1);

      const posRes = await fetch("/api/keywords/position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          intent_analysis: {
            intent_type: analysis.intent_type,
            user_intent: analysis.user_intent,
            recommended_content_type: analysis.recommended_content_type,
            angle: analysis.angle,
          },
        }),
      });

      let localPosition: PositionResult | null = null;
      if (posRes.ok) {
        const posData = await posRes.json() as { position: PositionResult };
        localPosition = posData.position;
        setPositionResult(localPosition);
      }
      // Non-blocking: if positioning fails, continue without it

      // ── Step 2: Keyword strategy ─────────────────────────────
      setCurrentStep(2);

      let localKeywords: KeywordStrategyResult | null = null;
      const kwRes = await fetch("/api/keywords/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          intent_analysis: {
            intent_type: analysis.intent_type,
            user_intent: analysis.user_intent,
            recommended_content_type: analysis.recommended_content_type,
            angle: analysis.angle,
          },
          cocoon_positioning: localPosition ? {
            page_type: localPosition.page_type,
            seo_role: localPosition.seo_role,
            pillar_relation: localPosition.pillar_relation,
            linking_strategy: localPosition.linking_strategy,
          } : undefined,
        }),
      });

      if (kwRes.ok) {
        const kwData = await kwRes.json() as { strategy: KeywordStrategyResult };
        localKeywords = kwData.strategy;
        setKeywordStrategy(localKeywords);
      }
      // Non-blocking: if strategy fails, continue with original keyword

      // ── Step 3: Content structure ────────────────────────────
      setCurrentStep(3);

      let localStructure: ContentStructureResult | null = null;
      const structRes = await fetch("/api/content/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          intent_analysis: {
            intent_type: analysis.intent_type,
            user_intent: analysis.user_intent,
            recommended_content_type: analysis.recommended_content_type,
            angle: analysis.angle,
            serp_analysis: analysis.serp_analysis,
          },
          cocoon_positioning: localPosition ? {
            page_type: localPosition.page_type,
            seo_role: localPosition.seo_role,
            pillar_relation: localPosition.pillar_relation,
          } : undefined,
          keyword_strategy: localKeywords ? {
            primary_keyword: localKeywords.primary_keyword,
            secondary_keywords: localKeywords.secondary_keywords,
            semantic_field: localKeywords.semantic_field,
            seo_angle: localKeywords.seo_angle,
          } : undefined,
        }),
      });

      if (structRes.ok) {
        const structData = await structRes.json() as { structure: ContentStructureResult };
        localStructure = structData.structure;
        setContentStructure(localStructure);
      }
      // Non-blocking: if structure fails, continue without it

      // ── Step 4: Featured snippet ─────────────────────────────
      setCurrentStep(4);

      let localSnippet: FeaturedSnippetResult | null = null;
      const snippetRes = await fetch("/api/content/snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          intent_analysis: {
            intent_type: analysis.intent_type,
            user_intent: analysis.user_intent,
            recommended_content_type: analysis.recommended_content_type,
            angle: analysis.angle,
          },
          content_structure: localStructure ? {
            h1: localStructure.h1,
            featured_snippet_section: localStructure.featured_snippet_section,
          } : undefined,
          keyword_strategy: localKeywords ? {
            primary_keyword: localKeywords.primary_keyword,
            seo_angle: localKeywords.seo_angle,
          } : undefined,
        }),
      });

      if (snippetRes.ok) {
        const snippetData = await snippetRes.json() as { snippet: FeaturedSnippetResult };
        localSnippet = snippetData.snippet;
        setFeaturedSnippet(localSnippet);
      }
      // Non-blocking: if snippet fails, generate will create its own

      // ── Step 5: Editorial plan ───────────────────────────────
      setCurrentStep(5);

      let localEditorial: EditorialPlanResult | null = null;
      const editRes = await fetch("/api/content/editorial-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: activeKeyword,
          intent_analysis: {
            intent_type: analysis.intent_type,
            user_intent: analysis.user_intent,
            recommended_content_type: analysis.recommended_content_type,
            angle: analysis.angle,
          },
          content_structure: localStructure ? {
            h1: localStructure.h1,
            h2_structure: localStructure.h2_structure,
            featured_snippet_section: localStructure.featured_snippet_section,
          } : undefined,
          keyword_strategy: localKeywords ? {
            primary_keyword: localKeywords.primary_keyword,
            secondary_keywords: localKeywords.secondary_keywords,
            semantic_field: localKeywords.semantic_field,
            seo_angle: localKeywords.seo_angle,
          } : undefined,
          featured_snippet: localSnippet ? {
            snippet_type: localSnippet.snippet_type,
            snippet_text: localSnippet.snippet_text,
            placement: localSnippet.placement,
          } : undefined,
        }),
      });

      if (editRes.ok) {
        const editData = await editRes.json() as { plan: EditorialPlanResult };
        localEditorial = editData.plan;
        setEditorialPlan(localEditorial);
      }
      // Non-blocking: if editorial plan fails, continue without it

      // ── Steps 6-14: Generate + post-process + publish ────────
      await runGeneration({
        intent: analysis,
        position: localPosition,
        keywords: localKeywords,
        structure: localStructure,
        snippet: localSnippet,
        editorial: localEditorial,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  async function forceGenerate() {
    setStatus("generating");
    setCurrentStep(6);
    setError("");
    setResult(null);
    setGenerated(null);
    setStreamText("");
    try {
      await runGeneration();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      setStatus("error");
    }
  }

  async function publishArticle(article: GeneratedArticle, position?: PositionResult | null) {
    setCurrentStep(13);
    setStatus("publishing");

    // Use passed position (from runGeneration) or fall back to state (from preview button)
    const pos = position ?? positionResult;

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

      // Warn if publication succeeded but database recording failed
      if (data.warning) {
        console.warn("[publish] Warning:", data.warning);
      }

      setResult({ title: article.title, url: data.url, meta: article.meta_description });

      setStepOutcomes(prev => ({ ...prev, 13: "success" }));

      // ── Step 14: Roadmap integration (non-blocking, with retry) ─────
      setCurrentStep(14);
      let roadmapOk = false;
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          const roadmapRes = await fetch("/api/roadmap/integrate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              keyword: activeKeyword,
              title: article.title,
              url: data.url,
              cocoon_positioning: pos ? {
                page_type: pos.page_type,
                seo_role: pos.seo_role,
                priority: pos.priority,
                pillar_relation: pos.pillar_relation,
                risk_level: pos.risk_level,
              } : undefined,
            }),
          });
          if (roadmapRes.ok) { roadmapOk = true; break; }
          if (roadmapRes.status >= 500 && attempt < 1) continue;
        } catch {
          if (attempt >= 1) console.warn("[roadmap-integrate] failed after retries");
        }
      }
      setStepOutcomes(prev => ({ ...prev, 14: roadmapOk ? "success" : "failed" }));

      // ── Step 15: Retroactive internal linking (with retry) ──────
      setCurrentStep(15);
      let retroOk = false;
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
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
            retroOk = true;
            break;
          }
          if (retroRes.status >= 500 && attempt < 1) continue;
        } catch {
          if (attempt >= 1) console.warn("[retroactive-linking] failed after retries");
        }
      }
      setStepOutcomes(prev => ({ ...prev, 15: retroOk ? "success" : "failed" }));

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

            {/* Keyword picker — Smart suggestions */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6">
              <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-3">
                1. Mot-clé cible
              </label>

              {/* Source filters */}
              {smartKeywords.length > 0 && (
                <div className="flex items-center gap-2 mb-4">
                  {([
                    { key: "all" as const, label: "Tous", count: smartKeywords.length },
                    { key: "roadmap" as const, label: "Roadmap SEO", count: smartKeywords.filter(k => k.source === "roadmap").length },
                    { key: "cocoon" as const, label: "Cocon", count: smartKeywords.filter(k => k.source === "cocoon").length },
                  ]).filter(f => f.count > 0).map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setKwFilter(f.key)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                        kwFilter === f.key
                          ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                          : "bg-white/[0.04] text-gray-500 border border-white/[0.06] hover:text-gray-300"
                      }`}
                    >
                      {f.label} ({f.count})
                    </button>
                  ))}
                </div>
              )}

              {/* Keywords grid */}
              {filteredKeywords.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-4">
                  {filteredKeywords.map((kw) => {
                    const badge = SOURCE_BADGES[kw.source];
                    const isSelected = keyword === kw.keyword && !customKeyword.trim();
                    return (
                      <button
                        key={kw.keyword}
                        type="button"
                        onClick={() => { setKeyword(kw.keyword); setCustomKeyword(""); }}
                        className={`group relative px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                          isSelected
                            ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                            : "bg-white/[0.04] border-white/[0.1] text-gray-400 hover:border-orange-500/30 hover:text-orange-400"
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {kw.keyword}
                          {kw.source !== "settings" && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase"
                              style={{ background: badge.bg, color: badge.color }}
                            >
                              {kw.role === "pillar" ? "Pilier" : badge.label}
                            </span>
                          )}
                          {kw.priority === "haute" && (
                            <span className="text-red-400 text-[9px]">●</span>
                          )}
                        </span>
                        {/* Tooltip on hover */}
                        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[#111] border border-white/10 text-gray-300 text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          {kw.reason}{kw.cluster ? ` · ${kw.cluster}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : site && site.keywords.length > 0 ? (
                /* Fallback: raw site keywords */
                <div className="flex flex-wrap gap-2 mb-4">
                  {site.keywords.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => { setKeyword(kw); setCustomKeyword(""); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                        keyword === kw && !customKeyword.trim()
                          ? "bg-orange-500/20 border-orange-500/50 text-orange-300"
                          : "bg-white/[0.04] border-white/[0.1] text-gray-400 hover:border-orange-500/30 hover:text-orange-400"
                      }`}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              ) : null}

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

        ) : status === "generating" || status === "publishing" ? (
          /* ── Chargement ── */
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#090909", border: "1px solid rgba(249,115,22,0.15)" }}
          >
            {/* Top gradient bar */}
            <div className="h-0.5 w-full bg-gradient-to-r from-orange-500 via-red-500 to-orange-400" />

            <div className="p-7">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#f97316", boxShadow: "0 0 8px rgba(249,115,22,0.8)", animation: "pulse 1.2s ease-in-out infinite" }}
                  />
                  <span className="text-orange-400 font-black text-sm uppercase tracking-widest">
                    {status === "publishing" ? "Publication" : "Rédaction"} en cours
                  </span>
                </div>
                {/* Live timer */}
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg"
                  style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.12)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3 text-orange-400/60">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span className="text-orange-400 font-black text-xs tabular-nums">{elapsed}s</span>
                </div>
              </div>

              {/* Context */}
              <p className="text-gray-500 text-sm mb-5">
                Article sur{" "}
                <span className="text-white font-black">&ldquo;{activeKeyword}&rdquo;</span>
                {" "}— {localeNames[language]}
              </p>

              {/* Overall progress bar */}
              <div className="relative h-1.5 rounded-full mb-6 overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min((currentStep / (STEPS.length - 2)) * 100, 100)}%`,
                    background: "linear-gradient(90deg, #f97316, #ef4444)",
                    transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
                    boxShadow: "0 0 8px rgba(249,115,22,0.5)",
                  }}
                />
              </div>

              {/* Steps */}
              <div className="flex flex-col gap-2">
                {STEPS.map((step, i) => {
                  const isDone = i < currentStep;
                  const isActive = i === currentStep;
                  const outcome = stepOutcomes[i]; // "success" | "skipped" | "failed" | undefined
                  const isFailed = isDone && outcome === "failed";
                  const isSkipped = isDone && outcome === "skipped";

                  return (
                    <div
                      key={step.id}
                      className="flex items-start gap-4 p-4 rounded-xl transition-all duration-500"
                      style={{
                        background: isFailed
                          ? "rgba(239,68,68,0.06)"
                          : isSkipped
                          ? "rgba(234,179,8,0.06)"
                          : isDone
                          ? "rgba(249,115,22,0.06)"
                          : isActive
                          ? "rgba(255,255,255,0.04)"
                          : "transparent",
                        borderLeft: isFailed
                          ? "2px solid rgba(239,68,68,0.5)"
                          : isActive ? "2px solid #f97316" : "2px solid transparent",
                        opacity: !isDone && !isActive ? 0.35 : 1,
                      }}
                    >
                      {/* Icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-500"
                        style={{
                          background: isFailed
                            ? "rgba(239,68,68,0.2)"
                            : isSkipped
                            ? "rgba(234,179,8,0.2)"
                            : isDone
                            ? "rgba(249,115,22,0.2)"
                            : isActive
                            ? "rgba(249,115,22,0.1)"
                            : "rgba(255,255,255,0.04)",
                          color: isFailed ? "#ef4444" : isSkipped ? "#eab308" : isDone ? "#f97316" : isActive ? "#fb923c" : "#4b5563",
                        }}
                      >
                        {isFailed ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        ) : isSkipped ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                        ) : isDone ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : isActive ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="9" stroke="rgba(249,115,22,0.2)" strokeWidth="2"/>
                            <path d="M12 3a9 9 0 019 9" stroke="#f97316" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                        ) : (
                          step.icon
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-bold leading-snug transition-colors duration-300"
                          style={{ color: isFailed ? "#fca5a5" : isSkipped ? "#fde047" : isDone ? "#fdba74" : isActive ? "white" : "#6b7280" }}
                        >
                          {step.label}
                        </p>
                        {(isDone || isActive) && (
                          <p className="text-xs mt-0.5 transition-all duration-300" style={{ color: isFailed ? "rgba(239,68,68,0.6)" : isSkipped ? "rgba(234,179,8,0.5)" : "rgba(156,163,175,0.6)" }}>
                            {isFailed ? "Échec — contenu précédent conservé" : isSkipped ? "Ignoré — aucun changement applicable" : step.sub}
                          </p>
                        )}
                      </div>

                      {/* Status badge */}
                      {isDone && (
                        <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: isFailed ? "rgba(239,68,68,0.6)" : isSkipped ? "rgba(234,179,8,0.6)" : "rgba(249,115,22,0.6)" }}>
                          {isFailed ? "✕" : isSkipped ? "–" : "✓"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Live preview of streaming text */}
              {streamText && status === "generating" && (
                <div className="mt-4 relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-green-400/60">Live</span>
                  </div>
                  <div
                    className="max-h-40 overflow-y-auto rounded-xl p-4 text-xs text-gray-400 font-mono leading-relaxed"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                  >
                    {streamText.length > 600 ? "…" + streamText.slice(-600) : streamText}
                    <span className="inline-block w-1.5 h-3.5 bg-orange-400 ml-0.5 animate-pulse" style={{ verticalAlign: "text-bottom" }} />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between mt-6 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-gray-600 text-xs">
                  Étape {Math.min(currentStep + 1, STEPS.length)} sur {STEPS.length}
                </p>
                <p className="text-gray-600 text-xs">
                  {elapsed < 30 ? "Estimation : 2 – 4 min" : elapsed < 90 ? "Analyse et rédaction..." : elapsed < 180 ? "Optimisation en cours..." : "Finalisation..."}
                </p>
              </div>
            </div>
          </div>

        ) : status === "preview" && generated ? (
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

        ) : status === "intent-blocked" && intentResult ? (
          /* ── Intent blocked ── */
          <div className="flex flex-col gap-5">
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: "#090909",
                border: intentResult.decision === "ignore"
                  ? "1px solid rgba(239,68,68,0.25)"
                  : "1px solid rgba(59,130,246,0.25)",
              }}
            >
              <div
                className="h-0.5 w-full"
                style={{
                  background: intentResult.decision === "ignore"
                    ? "linear-gradient(90deg, #ef4444, #f97316)"
                    : "linear-gradient(90deg, #3b82f6, #8b5cf6)",
                }}
              />

              <div className="p-7">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{
                      background: intentResult.decision === "ignore"
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(59,130,246,0.15)",
                    }}
                  >
                    {intentResult.decision === "ignore" ? "⛔" : "🔄"}
                  </div>
                  <div>
                    <p
                      className="font-black text-sm uppercase tracking-wide"
                      style={{
                        color: intentResult.decision === "ignore" ? "#f87171" : "#60a5fa",
                      }}
                    >
                      {intentResult.decision === "ignore"
                        ? "Mot-clé non recommandé"
                        : "Page existante détectée"}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Analyse d&apos;intention pour &quot;{activeKeyword}&quot;
                    </p>
                  </div>
                </div>

                {/* Analysis details */}
                <div className="flex flex-col gap-3 mb-6">
                  {/* Intent type + risk */}
                  <div className="flex gap-2">
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase"
                      style={{ background: "rgba(249,115,22,0.12)", color: "#f97316" }}
                    >
                      {intentResult.intent_type}
                    </span>
                    <span
                      className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase"
                      style={{
                        background: intentResult.risk_level === "high"
                          ? "rgba(239,68,68,0.12)"
                          : intentResult.risk_level === "medium"
                          ? "rgba(234,179,8,0.12)"
                          : "rgba(34,197,94,0.12)",
                        color: intentResult.risk_level === "high"
                          ? "#f87171"
                          : intentResult.risk_level === "medium"
                          ? "#facc15"
                          : "#4ade80",
                      }}
                    >
                      Risque {intentResult.risk_level}
                    </span>
                  </div>

                  {/* User intent */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Intention réelle</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{intentResult.user_intent}</p>
                  </div>

                  {/* SERP analysis */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Analyse SERP</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{intentResult.serp_analysis}</p>
                  </div>

                  {/* Justification */}
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: intentResult.decision === "ignore"
                        ? "rgba(239,68,68,0.06)"
                        : "rgba(59,130,246,0.06)",
                      border: intentResult.decision === "ignore"
                        ? "1px solid rgba(239,68,68,0.15)"
                        : "1px solid rgba(59,130,246,0.15)",
                    }}
                  >
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      {intentResult.decision === "ignore" ? "Pourquoi ne pas créer cette page" : "Recommandation"}
                    </p>
                    <p className="text-gray-300 text-sm leading-relaxed">{intentResult.justification}</p>
                    {intentResult.cannibalization_target && (
                      <p className="text-blue-400 text-sm font-bold mt-2">
                        Page existante : {intentResult.cannibalization_target}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setStatus("idle"); setIntentResult(null); }}
                    className="flex-1 px-5 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-gray-300 font-bold text-sm transition-all"
                  >
                    Choisir un autre mot-clé
                  </button>
                  <button
                    onClick={forceGenerate}
                    className="flex-1 px-5 py-3 rounded-xl border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 font-bold text-sm transition-all"
                  >
                    Générer quand même
                  </button>
                </div>
              </div>
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
