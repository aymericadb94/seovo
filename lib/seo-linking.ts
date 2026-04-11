/**
 * SEO Internal Linking Engine
 *
 * Intelligent linking system that uses 5 data sources:
 * 1. Semantic cocoon (clusters, pillars, supports)
 * 2. Google Search Console (positions, CTR, opportunities)
 * 3. CMS content (HTML, existing links, structure)
 * 4. Roadmap (upcoming pages, strategy)
 * 5. Risk scoring (per-page safety)
 *
 * Generates link plans with varied anchors, contextual placement,
 * orphan detection, cluster strength analysis, and GSC-driven prioritization.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CmsPost } from "@/lib/cms-update";
import type { GSCQuery } from "@/lib/seo-projections";
import { assessRisk, getModificationHistory, type ActionContext } from "@/lib/seo-risk";

// ── Types ────────────────────────────────────────────────────────────────────

export type LinkSuggestion = {
  from_url: string;
  from_title: string;
  to_url: string;
  to_title: string;
  anchor: string;
  placement: "intro" | "body" | "conclusion";
  objective: "seo" | "ux" | "conversion";
  priority: "haute" | "moyenne" | "faible";
  justification: string;
  risk_score: number;
};

export type PageLinkProfile = {
  url: string;
  title: string;
  keyword: string;
  role: "pillar" | "support" | "orphan" | "unknown";
  cluster: string | null;
  // Current state
  outgoing_internal: number;
  incoming_internal: number;
  content_word_count: number;
  // GSC metrics
  position: number | null;
  impressions: number;
  clicks: number;
  ctr: number;
  // Computed
  link_score: number;       // 0-100, how well-linked this page is
  boost_priority: number;   // 0-100, how much this page needs more links
};

export type ClusterStrength = {
  name: string;
  pillar_url: string | null;
  pillar_published: boolean;
  total_pages: number;
  published_pages: number;
  internal_links: number;    // Total links within cluster
  missing_links: number;     // Estimated missing links
  strength_score: number;    // 0-100
  avg_position: number | null;
  position_trend: number | null; // Delta position (négatif = amélioration, positif = déclin)
  impressions_trend: number | null; // Delta % impressions (+15 = +15%)
};

export type ExistingLink = {
  from_url: string;
  from_title: string;
  to_url: string;
  to_title: string;
};

export type BrokenLink = {
  from_url: string;
  from_title: string;
  broken_url: string;
  anchor_text: string;
};

export type LinkingAnalysis = {
  page_profiles: PageLinkProfile[];
  cluster_strengths: ClusterStrength[];
  orphan_pages: { url: string; title: string; reason: string }[];
  underlinked_pages: { url: string; title: string; incoming: number; needed: number }[];
  suggestions: LinkSuggestion[];
  existing_links: ExistingLink[];
  broken_links: BrokenLink[];
  global_score: number;
  global_label: string;
};

// Cocoon types
type CocoonCluster = {
  name: string;
  priority: string;
  traffic_potential: number;
  pillar: { title: string; keyword: string; status: string; url?: string };
  support_pages: { title: string; keyword: string; status: string; url?: string }[];
  internal_links?: { from: string; to: string; anchor: string; direction: string }[];
};

type CocoonData = {
  clusters: CocoonCluster[];
  score?: number;
};

// ── Main Analysis Function ───────────────────────────────────────────────────

export async function analyzeLinking(
  supabase: SupabaseClient,
  userId: string,
  cmsPosts: CmsPost[],
  gscQueries: GSCQuery[],
  siteUrl: string,
  gscQueriesPrev?: GSCQuery[]
): Promise<LinkingAnalysis> {
  // 1. Fetch cocoon + publications + roadmap
  const [cocoonRes, pubsRes, roadmapRes] = await Promise.all([
    supabase.from("semantic_cocoons").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("publications").select("title, keyword, wordpress_url").eq("user_id", userId),
    supabase.from("roadmaps").select("data").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const cocoon = (cocoonRes.data?.data ?? { clusters: [] }) as CocoonData;
  const publications = pubsRes.data ?? [];
  type RoadmapArticle = { title: string; keyword: string; role: string };
  const roadmapArticles = ((roadmapRes.data?.data as { articles?: RoadmapArticle[] } | null)?.articles ?? []) as RoadmapArticle[];

  // 2. Build GSC lookup (fuzzy-ready)
  const gscByQuery = new Map(gscQueries.map(q => [q.query.toLowerCase(), q]));

  // Fuzzy GSC matcher: exact → inclusion → word overlap ≥60%
  function findGscMatch(keyword: string): GSCQuery | undefined {
    if (!keyword) return undefined;
    const kw = keyword.toLowerCase().trim();
    // 1. Exact match
    const exact = gscByQuery.get(kw);
    if (exact) return exact;
    // 2. GSC query contains keyword or keyword contains query
    for (const [q, data] of gscByQuery) {
      if (q.includes(kw) || kw.includes(q)) return data;
    }
    // 3. Word overlap ≥60% (handles word order differences + singular/plural)
    const kwWords = new Set(kw.split(/\s+/).filter(w => w.length > 2));
    if (kwWords.size === 0) return undefined;
    let bestMatch: GSCQuery | undefined;
    let bestOverlap = 0;
    for (const [q, data] of gscByQuery) {
      const qWords = new Set(q.split(/\s+/).filter(w => w.length > 2));
      if (qWords.size === 0) continue;
      let common = 0;
      for (const w of kwWords) {
        for (const qw of qWords) {
          // Stem-lite: one word starts with the other (chaussure/chaussures)
          if (w === qw || (w.length >= 4 && qw.length >= 4 && (w.startsWith(qw.slice(0, -1)) || qw.startsWith(w.slice(0, -1))))) {
            common++;
            break;
          }
        }
      }
      const overlap = common / Math.max(kwWords.size, qWords.size);
      if (overlap >= 0.6 && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = data;
      }
    }
    return bestMatch;
  }

  // Debug: log data shapes to understand matching failures
  console.log(`[linking] CMS posts: ${cmsPosts.length}, Publications: ${publications.length}, Cocoon clusters: ${cocoon.clusters.length}`);
  if (cmsPosts.length > 0) {
    console.log(`[linking] Sample CMS URL: "${cmsPosts[0].url}"`);
  }
  if (publications.length > 0) {
    const pub0 = publications[0];
    console.log(`[linking] Sample pub: keyword="${pub0.keyword}", wp_url="${pub0.wordpress_url}"`);
  }
  if (cocoon.clusters.length > 0) {
    const c0 = cocoon.clusters[0];
    console.log(`[linking] Sample cluster: "${c0.name}", pillar_kw="${c0.pillar.keyword}", pillar_url="${c0.pillar.url}", supports=${c0.support_pages.length}`);
  }

  // 3. Build page profiles (with fuzzy GSC matching)
  const profiles = buildPageProfiles(cmsPosts, publications, cocoon, gscByQuery, siteUrl, findGscMatch);

  // Debug: log matching results with GSC match rate
  const matched = profiles.filter(p => p.cluster !== null);
  const withKeyword = profiles.filter(p => p.keyword !== "");
  const withGsc = profiles.filter(p => p.position !== null);
  const withIncoming = profiles.filter(p => p.incoming_internal > 0);
  const gscMatchRate = withKeyword.length > 0 ? Math.round((withGsc.length / withKeyword.length) * 100) : 0;
  console.log(`[linking] Profiles: ${profiles.length} total, ${matched.length} in cluster, ${withKeyword.length} with keyword, ${withGsc.length} with GSC data (${gscMatchRate}% match rate), ${withIncoming.length} with incoming links`);
  if (withGsc.length < withKeyword.length && withKeyword.length > 0) {
    const missingGsc = profiles.filter(p => p.keyword && p.position === null).slice(0, 5);
    console.log(`[linking] GSC miss samples: ${missingGsc.map(p => `"${p.keyword}"`).join(", ")}`);
  }

  // 4. Analyze cluster strengths (with trend data)
  const gscPrevByQuery = gscQueriesPrev
    ? new Map(gscQueriesPrev.map(q => [q.query.toLowerCase(), q]))
    : undefined;
  const clusterStrengths = analyzeClusterStrengths(cocoon, profiles, gscByQuery, findGscMatch, gscPrevByQuery);

  // 5. Detect orphans and underlinked pages
  const orphans = detectOrphans(profiles, cocoon);
  const underlinked = detectUnderlinked(profiles);

  // 6. Generate link suggestions (the core intelligence)
  const suggestions = await generateSuggestions(
    supabase, userId, profiles, cocoon, gscByQuery, roadmapArticles, siteUrl
  );

  // 7. Extract existing links from CMS content
  const existingLinks = extractExistingLinks(cmsPosts, publications, siteUrl);

  // 7b. Detect broken internal links (pointing to pages that no longer exist)
  const brokenLinks = detectBrokenLinks(cmsPosts, siteUrl);

  // 8. Global score
  const globalScore = computeGlobalScore(profiles, clusterStrengths, orphans);
  const globalLabel = globalScore >= 75 ? "Excellent" : globalScore >= 50 ? "Bon" : globalScore >= 25 ? "Moyen" : "Faible";

  return {
    page_profiles: profiles,
    cluster_strengths: clusterStrengths,
    orphan_pages: orphans,
    underlinked_pages: underlinked,
    suggestions,
    existing_links: existingLinks,
    broken_links: brokenLinks,
    global_score: globalScore,
    global_label: globalLabel,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE PROFILES
// ══════════════════════════════════════════════════════════════════════════════

function buildPageProfiles(
  cmsPosts: CmsPost[],
  publications: { title: string; keyword: string; wordpress_url: string | null }[],
  cocoon: CocoonData,
  _gscByQuery: Map<string, GSCQuery>,
  siteUrl: string,
  findGscMatch?: (keyword: string) => GSCQuery | undefined
): PageLinkProfile[] {
  const profiles: PageLinkProfile[] = [];
  const allUrls = cmsPosts.map(p => p.url);

  for (const post of cmsPosts) {
    // Match publication by URL, then fallback by title similarity
    const pub = publications.find(p => p.wordpress_url && urlsMatch(p.wordpress_url, post.url))
      ?? publications.find(p => p.title && post.title && p.title.toLowerCase() === post.title.toLowerCase());
    const keyword = pub?.keyword ?? "";

    // Find cluster membership — try exact match first, then fuzzy theme matching
    let role: PageLinkProfile["role"] = "unknown";
    let clusterName: string | null = null;
    // Pass 1: Exact matching (URL, keyword, title)
    for (const cluster of cocoon.clusters) {
      if (matchesPage(cluster.pillar, post.url, keyword, post.title)) {
        role = "pillar";
        clusterName = cluster.name;
        break;
      }
      if (cluster.support_pages.some(sp => matchesPage(sp, post.url, keyword, post.title))) {
        role = "support";
        clusterName = cluster.name;
        break;
      }
    }
    // Pass 2: Fuzzy theme matching — match against the cluster's keyword pool
    if (!clusterName) {
      const bestCluster = findBestCluster(post.title, keyword, cocoon.clusters);
      if (bestCluster) {
        clusterName = bestCluster.name;
        role = "support";
      }
    }

    // Count links
    const outgoing = countLinksInHtml(post.content, allUrls, siteUrl);
    const incoming = countIncomingLinks(post.url, cmsPosts, siteUrl);
    const wordCount = countWords(post.content);

    // GSC data (fuzzy matching)
    const gsc = findGscMatch ? findGscMatch(keyword) : _gscByQuery.get(keyword.toLowerCase());

    // Compute scores
    const idealLinks = Math.max(2, Math.min(5, Math.floor(wordCount / 300)));
    const linkScore = Math.min(100, Math.round(
      ((Math.min(outgoing, idealLinks) / idealLinks) * 50) +
      ((Math.min(incoming, 3) / 3) * 50)
    ));

    // Boost priority: high for pages that need links the most
    let boostPriority = 0;
    if (incoming === 0) boostPriority += 40; // Orphan
    else if (incoming < 2) boostPriority += 20;
    if (gsc && gsc.position > 5 && gsc.position <= 15) boostPriority += 30; // Striking distance
    if (gsc && gsc.position <= 10 && gsc.impressions > 100 && gsc.ctr < getExpectedCtr(gsc.position) * 0.6) {
      boostPriority += 15; // CTR anomaly
    }
    if (role === "pillar") boostPriority += 10;

    profiles.push({
      url: post.url,
      title: pub?.title ?? post.title,
      keyword,
      role: role === "unknown" && incoming === 0 ? "orphan" : role,
      cluster: clusterName,
      outgoing_internal: outgoing,
      incoming_internal: incoming,
      content_word_count: wordCount,
      position: gsc?.position ?? null,
      impressions: gsc?.impressions ?? 0,
      clicks: gsc?.clicks ?? 0,
      ctr: gsc?.ctr ?? 0,
      link_score: linkScore,
      boost_priority: Math.min(100, boostPriority),
    });
  }

  return profiles;
}

// ══════════════════════════════════════════════════════════════════════════════
// CLUSTER ANALYSIS
// ══════════════════════════════════════════════════════════════════════════════

function analyzeClusterStrengths(
  cocoon: CocoonData,
  profiles: PageLinkProfile[],
  _gscByQuery: Map<string, GSCQuery>,
  findGscMatch?: (keyword: string) => GSCQuery | undefined,
  gscPrevByQuery?: Map<string, GSCQuery>
): ClusterStrength[] {
  return cocoon.clusters.map(cluster => {
    const clusterProfiles = profiles.filter(p => p.cluster === cluster.name);
    const totalPages = 1 + cluster.support_pages.length; // pillar + supports
    const publishedPages = clusterProfiles.length;
    const internalLinks = clusterProfiles.reduce((s, p) => s + p.outgoing_internal, 0);

    // Ideal: each page links to pillar + 1-2 supports = ~2-3 links per page
    const idealLinks = publishedPages * 2.5;
    const missingLinks = Math.max(0, Math.round(idealLinks - internalLinks));

    // Average position
    const withPosition = clusterProfiles.filter(p => p.position !== null);
    const avgPosition = withPosition.length > 0
      ? Math.round(withPosition.reduce((s, p) => s + (p.position ?? 0), 0) / withPosition.length * 10) / 10
      : null;

    // Trend: compare current vs previous period for cluster keywords
    let positionTrend: number | null = null;
    let impressionsTrend: number | null = null;
    if (gscPrevByQuery && clusterProfiles.length > 0) {
      const clusterKeywords = clusterProfiles.map(p => p.keyword).filter(Boolean);
      let currentPosSum = 0, prevPosSum = 0, posCount = 0;
      let currentImpSum = 0, prevImpSum = 0, impCount = 0;
      for (const kw of clusterKeywords) {
        const current = findGscMatch ? findGscMatch(kw) : _gscByQuery.get(kw.toLowerCase());
        const prev = gscPrevByQuery.get(kw.toLowerCase());
        if (current && prev) {
          currentPosSum += current.position;
          prevPosSum += prev.position;
          posCount++;
          currentImpSum += current.impressions;
          prevImpSum += prev.impressions;
          impCount++;
        }
      }
      if (posCount > 0) {
        // Position trend : négatif = amélioration (ex: 15→8 = -7)
        positionTrend = Math.round((currentPosSum / posCount - prevPosSum / posCount) * 10) / 10;
      }
      if (impCount > 0 && prevImpSum > 0) {
        // Impressions trend : % de variation
        impressionsTrend = Math.round(((currentImpSum - prevImpSum) / prevImpSum) * 100);
      }
    }

    // Strength score
    let strength = 0;
    if (publishedPages > 0) strength += Math.min(30, (publishedPages / totalPages) * 30);
    if (internalLinks > 0) strength += Math.min(30, (internalLinks / idealLinks) * 30);
    const pillarPublished = clusterProfiles.some(p => p.role === "pillar");
    if (pillarPublished) strength += 20;
    if (avgPosition !== null && avgPosition <= 15) strength += 20;
    else if (avgPosition !== null && avgPosition <= 30) strength += 10;

    return {
      name: cluster.name,
      pillar_url: cluster.pillar.url ?? null,
      pillar_published: pillarPublished,
      total_pages: totalPages,
      published_pages: publishedPages,
      internal_links: internalLinks,
      missing_links: missingLinks,
      strength_score: Math.round(Math.min(100, strength)),
      avg_position: avgPosition,
      position_trend: positionTrend,
      impressions_trend: impressionsTrend,
    };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ORPHAN & UNDERLINKED DETECTION
// ══════════════════════════════════════════════════════════════════════════════

function detectOrphans(
  profiles: PageLinkProfile[],
  cocoon: CocoonData
): { url: string; title: string; reason: string }[] {
  const orphans: { url: string; title: string; reason: string }[] = [];

  for (const p of profiles) {
    if (p.incoming_internal === 0 && p.outgoing_internal === 0) {
      orphans.push({
        url: p.url,
        title: p.title,
        reason: "Aucun lien interne entrant ni sortant — page totalement isolée",
      });
    } else if (p.incoming_internal === 0) {
      orphans.push({
        url: p.url,
        title: p.title,
        reason: "Aucun lien interne entrant — page invisible pour le PageRank",
      });
    } else if (p.cluster === null) {
      orphans.push({
        url: p.url,
        title: p.title,
        reason: "Page non rattachée à un cluster du cocon sémantique",
      });
    }
  }

  return orphans;
}

function detectUnderlinked(
  profiles: PageLinkProfile[]
): { url: string; title: string; incoming: number; needed: number }[] {
  // Seuils dynamiques basés sur : rôle + trafic GSC + taille du cluster
  function computeNeeded(p: PageLinkProfile): number {
    let base = p.role === "pillar" ? 3 : 2;
    // Pages à fort trafic GSC méritent plus de liens entrants (jus SEO)
    if (p.impressions > 1000) base += 2;
    else if (p.impressions > 200) base += 1;
    // Pages en striking distance (pos 5-20) : un lien de plus peut les faire monter
    if (p.position !== null && p.position > 5 && p.position <= 20) base += 1;
    // Plafonner selon les sources disponibles dans le cluster
    const clusterPeers = profiles.filter(pp => pp.cluster === p.cluster && pp.url !== p.url);
    return Math.min(base, Math.max(2, clusterPeers.length));
  }

  return profiles
    .filter(p => {
      const needed = computeNeeded(p);
      return p.incoming_internal < needed;
    })
    .map(p => ({
      url: p.url,
      title: p.title,
      incoming: p.incoming_internal,
      needed: computeNeeded(p),
    }))
    .sort((a, b) => (a.incoming - a.needed) - (b.incoming - b.needed));
}

// ══════════════════════════════════════════════════════════════════════════════
// SUGGESTION GENERATION — The core intelligence
// ══════════════════════════════════════════════════════════════════════════════

async function generateSuggestions(
  supabase: SupabaseClient,
  userId: string,
  profiles: PageLinkProfile[],
  cocoon: CocoonData,
  gscByQuery: Map<string, GSCQuery>,
  roadmap: { title: string; keyword: string; role: string }[],
  siteUrl: string
): Promise<LinkSuggestion[]> {
  const suggestions: LinkSuggestion[] = [];
  const usedPairs = new Set<string>(); // "from_url|to_url" to avoid duplicates

  // Priority order of link generation rules:
  // 1. Support → Pillar (mandatory, highest priority)
  // 2. Pillar → Supports (reinforce cluster)
  // 3. GSC boost (striking distance pages get more inbound)
  // 4. Cross-cluster pillar links (topical bridges)
  // 5. Orphan rescue (link orphans into closest cluster)

  for (const cluster of cocoon.clusters) {
    const clusterProfiles = profiles.filter(p => p.cluster === cluster.name);
    const pillar = clusterProfiles.find(p => p.role === "pillar");
    const supports = clusterProfiles.filter(p => p.role === "support");

    // ── Rule 1: Support → Pillar ──────────────────────────────────────
    if (pillar) {
      for (const support of supports) {
        const pairKey = `${support.url}|${pillar.url}`;
        if (usedPairs.has(pairKey)) continue;

        // Check if link already exists
        const sourcePost = profiles.find(p => p.url === support.url);
        if (sourcePost && sourcePost.outgoing_internal >= 5) continue;

        const anchor = generateAnchor(pillar.keyword, pillar.title, "support_to_pillar", usedPairs);
        const risk = await quickRisk(supabase, userId, support, "add_internal_links", 1, siteUrl);

        suggestions.push({
          from_url: support.url,
          from_title: support.title,
          to_url: pillar.url,
          to_title: pillar.title,
          anchor,
          placement: "intro",
          objective: "seo",
          priority: "haute",
          justification: `Lien support → pilier obligatoire dans le cluster "${cluster.name}"`,
          risk_score: risk,
        });
        usedPairs.add(pairKey);
      }

      // ── Rule 2: Pillar → Supports ────────────────────────────────────
      for (const support of supports.slice(0, 4)) {
        const pairKey = `${pillar.url}|${support.url}`;
        if (usedPairs.has(pairKey)) continue;
        if (pillar.outgoing_internal >= 5) break;

        const anchor = generateAnchor(support.keyword, support.title, "pillar_to_support", usedPairs);
        const risk = await quickRisk(supabase, userId, pillar, "add_internal_links", 1, siteUrl);

        suggestions.push({
          from_url: pillar.url,
          from_title: pillar.title,
          to_url: support.url,
          to_title: support.title,
          anchor,
          placement: "body",
          objective: "seo",
          priority: "haute",
          justification: `Renforcement du cluster "${cluster.name}" — pilier distribue le jus SEO`,
          risk_score: risk,
        });
        usedPairs.add(pairKey);
      }
    }

    // ── Rule 2b: Support ↔ Support (max 1 per support) ────────────────
    for (let i = 0; i < supports.length; i++) {
      const s1 = supports[i];
      const s2 = supports[(i + 1) % supports.length];
      if (!s2 || s1.url === s2.url) continue;

      const pairKey = `${s1.url}|${s2.url}`;
      if (usedPairs.has(pairKey)) continue;
      if (s1.outgoing_internal >= 5) continue;

      const anchor = generateAnchor(s2.keyword, s2.title, "support_to_support", usedPairs);
      const risk = await quickRisk(supabase, userId, s1, "add_internal_links", 1, siteUrl);

      suggestions.push({
        from_url: s1.url,
        from_title: s1.title,
        to_url: s2.url,
        to_title: s2.title,
        anchor,
        placement: "body",
        objective: "ux",
        priority: "moyenne",
        justification: `Maillage horizontal dans le cluster "${cluster.name}"`,
        risk_score: risk,
      });
      usedPairs.add(pairKey);
    }
  }

  // ── Rule 3: GSC-driven boost ──────────────────────────────────────────
  const strikingDistance = profiles
    .filter(p => p.position !== null && p.position > 5 && p.position <= 15 && p.impressions > 50)
    .sort((a, b) => b.impressions - a.impressions);

  for (const target of strikingDistance.slice(0, 5)) {
    // Find best pages to link FROM (pages with few outgoing links, in related clusters)
    const candidates = profiles
      .filter(p =>
        p.url !== target.url &&
        p.outgoing_internal < 5 &&
        p.content_word_count > 400 &&
        !usedPairs.has(`${p.url}|${target.url}`)
      )
      .sort((a, b) => {
        // Prefer same cluster, then high-traffic pages
        const sameClusterA = a.cluster === target.cluster ? 100 : 0;
        const sameClusterB = b.cluster === target.cluster ? 100 : 0;
        return (sameClusterB + b.clicks) - (sameClusterA + a.clicks);
      });

    const source = candidates[0];
    if (!source) continue;

    const anchor = generateAnchor(target.keyword, target.title, "gsc_boost", usedPairs);
    const risk = await quickRisk(supabase, userId, source, "add_internal_links", 1, siteUrl);

    suggestions.push({
      from_url: source.url,
      from_title: source.title,
      to_url: target.url,
      to_title: target.title,
      anchor,
      placement: "body",
      objective: "seo",
      priority: "haute",
      justification: `Page en position ${target.position} avec ${target.impressions} impressions — un lien interne peut la pousser dans le top 5`,
      risk_score: risk,
    });
    usedPairs.add(`${source.url}|${target.url}`);
  }

  // ── Rule 4: Cross-cluster pillar links ────────────────────────────────
  const pillars = profiles.filter(p => p.role === "pillar");
  for (let i = 0; i < pillars.length; i++) {
    for (let j = i + 1; j < pillars.length; j++) {
      const p1 = pillars[i];
      const p2 = pillars[j];
      const pairKey = `${p1.url}|${p2.url}`;
      if (usedPairs.has(pairKey)) continue;
      if (p1.outgoing_internal >= 5) continue;

      const anchor = generateAnchor(p2.keyword, p2.title, "cross_cluster", usedPairs);
      suggestions.push({
        from_url: p1.url,
        from_title: p1.title,
        to_url: p2.url,
        to_title: p2.title,
        anchor,
        placement: "conclusion",
        objective: "ux",
        priority: "faible",
        justification: `Pont sémantique entre clusters "${p1.cluster}" et "${p2.cluster}"`,
        risk_score: 15, // Cross-cluster pillar links are always low risk
      });
      usedPairs.add(pairKey);
      // Only 1 cross-cluster link per pillar pair
      break;
    }
  }

  // ── Rule 5: Orphan rescue ─────────────────────────────────────────────
  const orphans = profiles.filter(p => p.role === "orphan" || p.incoming_internal === 0);
  for (const orphan of orphans) {
    // Find best source pages (same cluster first, then high-traffic)
    const bestSources = profiles
      .filter(p =>
        p.url !== orphan.url &&
        p.outgoing_internal < 5 &&
        p.content_word_count > 400 &&
        !usedPairs.has(`${p.url}|${orphan.url}`)
      )
      .sort((a, b) => {
        const sameClusterA = a.cluster === orphan.cluster && orphan.cluster !== null ? 100 : 0;
        const sameClusterB = b.cluster === orphan.cluster && orphan.cluster !== null ? 100 : 0;
        return (sameClusterB + b.clicks) - (sameClusterA + a.clicks);
      });

    const bestSource = bestSources[0];
    if (!bestSource) continue;

    const anchor = generateAnchor(orphan.keyword, orphan.title, "orphan_rescue", usedPairs);
    suggestions.push({
      from_url: bestSource.url,
      from_title: bestSource.title,
      to_url: orphan.url,
      to_title: orphan.title,
      anchor,
      placement: "body",
      objective: "seo",
      priority: "moyenne",
      justification: `Page orpheline "${orphan.title}" — aucun lien entrant, invisible pour Google`,
      risk_score: 10,
    });
    usedPairs.add(`${bestSource.url}|${orphan.url}`);
  }

  // ── Rule 6: Minimum 2 liens entrants par page ──────────────────────────
  // Compte les liens entrants actuels + ceux déjà proposés dans suggestions
  const incomingFromSuggestions = new Map<string, number>();
  for (const s of suggestions) {
    incomingFromSuggestions.set(s.to_url, (incomingFromSuggestions.get(s.to_url) ?? 0) + 1);
  }

  const MIN_INCOMING = 2;
  const underlinkedPages = profiles
    .filter(p => {
      const totalIncoming = p.incoming_internal + (incomingFromSuggestions.get(p.url) ?? 0);
      return totalIncoming < MIN_INCOMING;
    })
    .sort((a, b) => a.incoming_internal - b.incoming_internal);

  for (const target of underlinkedPages) {
    const totalIncoming = target.incoming_internal + (incomingFromSuggestions.get(target.url) ?? 0);
    const needed = MIN_INCOMING - totalIncoming;

    for (let i = 0; i < needed; i++) {
      const source = profiles
        .filter(p =>
          p.url !== target.url &&
          p.outgoing_internal < 6 &&
          p.content_word_count > 300 &&
          !usedPairs.has(`${p.url}|${target.url}`)
        )
        .sort((a, b) => {
          // Prefer same cluster, then pages with fewer outgoing links
          const sameClusterA = a.cluster === target.cluster && target.cluster !== null ? 50 : 0;
          const sameClusterB = b.cluster === target.cluster && target.cluster !== null ? 50 : 0;
          return (sameClusterB - b.outgoing_internal) - (sameClusterA - a.outgoing_internal);
        })[0];

      if (!source) break;

      const anchor = generateAnchor(target.keyword, target.title, "min_incoming", usedPairs);
      suggestions.push({
        from_url: source.url,
        from_title: source.title,
        to_url: target.url,
        to_title: target.title,
        anchor,
        placement: "body",
        objective: "seo",
        priority: "moyenne",
        justification: `Garantir le minimum de ${MIN_INCOMING} liens entrants — page n'en a que ${target.incoming_internal}`,
        risk_score: 15,
      });
      usedPairs.add(`${source.url}|${target.url}`);
      incomingFromSuggestions.set(target.url, (incomingFromSuggestions.get(target.url) ?? 0) + 1);
    }
  }

  // Dedup final: une seule suggestion par paire from→to (garder la plus haute priorité)
  const seenPairs = new Set<string>();
  const deduped: LinkSuggestion[] = [];
  // Trier d'abord pour que la meilleure priorité passe en premier
  const priorityOrder = { haute: 0, moyenne: 1, faible: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.risk_score - b.risk_score);
  for (const s of suggestions) {
    const key = `${normalizeUrl(s.from_url)}|${normalizeUrl(s.to_url)}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    deduped.push(s);
  }

  return deduped;
}

// ══════════════════════════════════════════════════════════════════════════════
// ANCHOR GENERATION — Varied, natural, contextual
// ══════════════════════════════════════════════════════════════════════════════

function generateAnchor(
  keyword: string,
  title: string,
  context: string,
  usedAnchors: Set<string>
): string {
  const kw = keyword.trim();
  const cleanTitle = title.replace(/[""«»]/g, "").trim();

  // Generate multiple anchor candidates
  const candidates: string[] = [];

  // 1. Exact keyword (use sparingly)
  candidates.push(kw);

  // 2. Partial keyword (first 2-3 words)
  const kwWords = kw.split(/\s+/);
  if (kwWords.length >= 3) {
    candidates.push(kwWords.slice(0, 3).join(" "));
    candidates.push(kwWords.slice(0, 2).join(" "));
  }

  // 3. Title-based (shortened)
  if (cleanTitle.length > 10 && cleanTitle !== kw) {
    const titleWords = cleanTitle.split(/\s+/);
    if (titleWords.length > 4) {
      candidates.push(titleWords.slice(0, 4).join(" "));
    } else {
      candidates.push(cleanTitle);
    }
  }

  // 4. Contextual variations
  switch (context) {
    case "support_to_pillar":
      candidates.push(`guide ${kwWords[0] ?? kw}`);
      candidates.push(`tout savoir sur ${kwWords.slice(0, 2).join(" ")}`);
      break;
    case "pillar_to_support":
      candidates.push(`en savoir plus sur ${kwWords.slice(0, 2).join(" ")}`);
      candidates.push(kwWords.length > 1 ? kwWords.slice(-2).join(" ") : kw);
      break;
    case "gsc_boost":
      candidates.push(`découvrir ${kwWords.slice(0, 2).join(" ")}`);
      break;
    case "orphan_rescue":
      candidates.push(`article sur ${kwWords.slice(0, 2).join(" ")}`);
      break;
    case "cross_cluster":
      candidates.push(`voir aussi : ${kwWords.slice(0, 2).join(" ")}`);
      break;
  }

  // Pick the first candidate NOT already used
  for (const c of candidates) {
    const key = `anchor:${c.toLowerCase()}`;
    if (!usedAnchors.has(key)) {
      usedAnchors.add(key);
      return c;
    }
  }

  // Fallback: keyword with slight variation
  return kw;
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL SCORE
// ══════════════════════════════════════════════════════════════════════════════

function computeGlobalScore(
  profiles: PageLinkProfile[],
  clusters: ClusterStrength[],
  orphans: { url: string }[]
): number {
  if (profiles.length === 0) return 0;

  // 1. Average link score (30%)
  const avgLinkScore = profiles.reduce((s, p) => s + p.link_score, 0) / profiles.length;

  // 2. Cluster strength average (25%) — exclure les clusters sans aucune page publiée
  const activeClusters = clusters.filter(c => c.published_pages > 0);
  const avgClusterStrength = activeClusters.length > 0
    ? activeClusters.reduce((s, c) => s + c.strength_score, 0) / activeClusters.length
    : 0;
  // Pénalité clusters vides : chaque cluster vide réduit le score cluster de 10pts
  const emptyClusters = clusters.length - activeClusters.length;
  const clusterPenalty = Math.min(avgClusterStrength, emptyClusters * 10);

  // 3. Orphan penalty (15%)
  const orphanRatio = orphans.length / profiles.length;
  const orphanScore = Math.max(0, 100 - orphanRatio * 200);

  // 4. Coverage (15%) — % of pages with at least 1 incoming + 1 outgoing link
  const wellLinked = profiles.filter(p => p.incoming_internal > 0 && p.outgoing_internal > 0);
  const coverageScore = (wellLinked.length / profiles.length) * 100;

  // 5. GSC position quality (15%) — récompense les pages bien positionnées
  // MAIS plafonné par la couverture maillage : bonnes positions sans maillage = pas de bonus
  const withPosition = profiles.filter(p => p.position !== null);
  let gscScore = 0;
  if (withPosition.length > 0) {
    const positionPoints: number[] = withPosition.map(p => {
      const pos = p.position!;
      if (pos <= 3) return 100;
      if (pos <= 10) return 80;
      if (pos <= 20) return 60;
      if (pos <= 50) return 25;
      return 0;
    });
    const rawGsc = positionPoints.reduce((s, p) => s + p, 0) / positionPoints.length;
    // Plafonner le bonus GSC par le ratio de pages non-orphelines
    // Si 80% orphelines, le GSC ne compte que pour 20% de sa valeur
    const nonOrphanRatio = 1 - orphanRatio;
    gscScore = rawGsc * nonOrphanRatio;
  } else {
    // Sans GSC, on ne pénalise pas — on redistribue le poids
    const adjCluster = Math.max(0, avgClusterStrength - clusterPenalty);
    return Math.round(
      avgLinkScore * 0.35 +
      adjCluster * 0.30 +
      orphanScore * 0.175 +
      coverageScore * 0.175
    );
  }

  const adjCluster = Math.max(0, avgClusterStrength - clusterPenalty);
  return Math.round(
    avgLinkScore * 0.30 +
    adjCluster * 0.25 +
    orphanScore * 0.15 +
    coverageScore * 0.15 +
    gscScore * 0.15
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING LINKS EXTRACTION — Scan CMS content for real <a> tags
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Detect internal links that point to pages not in the CMS (likely deleted → 404).
 */
function detectBrokenLinks(cmsPosts: CmsPost[], siteUrl: string): BrokenLink[] {
  const domain = (() => { try { return new URL(siteUrl).hostname; } catch { return ""; } })();
  const knownPaths = new Set(cmsPosts.map(p => normalizeUrl(p.url)));
  const broken: BrokenLink[] = [];
  const seen = new Set<string>();

  for (const post of cmsPosts) {
    const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = regex.exec(post.content)) !== null) {
      const href = match[1];
      const anchorText = match[2];
      let resolvedPath: string | null = null;

      try {
        const u = new URL(href, siteUrl);
        if (u.hostname === domain) resolvedPath = normalizeUrl(u.href);
      } catch {
        if (href.startsWith("/")) resolvedPath = normalizeUrl(href);
      }

      if (!resolvedPath) continue;
      if (resolvedPath === normalizeUrl(post.url)) continue;
      // Check if target exists in CMS
      const exists = knownPaths.has(resolvedPath) || [...knownPaths].some(k => urlsMatch(href, k));
      if (exists) continue;

      const key = `${normalizeUrl(post.url)}|${resolvedPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      broken.push({
        from_url: post.url,
        from_title: post.title,
        broken_url: href,
        anchor_text: anchorText,
      });
    }
  }
  return broken;
}

function extractExistingLinks(
  cmsPosts: CmsPost[],
  publications: { title: string; keyword: string; wordpress_url: string | null }[],
  siteUrl: string
): ExistingLink[] {
  const links: ExistingLink[] = [];
  const domain = (() => { try { return new URL(siteUrl).hostname; } catch { return ""; } })();
  const seen = new Set<string>();

  // Build normalized-pathname → title lookup from CMS posts + publications
  const urlToTitle = new Map<string, string>();
  for (const p of cmsPosts) {
    const norm = normalizeUrl(p.url);
    urlToTitle.set(norm, p.title);
  }
  for (const p of publications) {
    if (p.wordpress_url) {
      const norm = normalizeUrl(p.wordpress_url);
      if (!urlToTitle.has(norm)) urlToTitle.set(norm, p.title);
    }
  }

  // All known internal URLs (raw list for fuzzy matching)
  const knownUrlsList = [...urlToTitle.keys()];

  for (const post of cmsPosts) {
    const fromUrl = post.url;
    const fromNorm = normalizeUrl(fromUrl);
    const fromTitle = post.title;

    const regex = /<a[^>]+href=["']([^"']+)["']/gi;
    let match;
    while ((match = regex.exec(post.content)) !== null) {
      const href = match[1];
      let resolvedHref: string | null = null;

      try {
        const u = new URL(href, siteUrl);
        if (u.hostname === domain) {
          resolvedHref = u.href;
        }
      } catch {
        if (href.startsWith("/")) {
          resolvedHref = href;
        }
      }

      if (!resolvedHref) continue;
      const targetNorm = normalizeUrl(resolvedHref);
      if (targetNorm === fromNorm) continue;

      // Fuzzy match against known URLs
      const matchedKey = knownUrlsList.find(k => k === targetNorm || urlsMatch(resolvedHref!, k));
      if (!matchedKey) continue;

      const pairKey = `${fromNorm}|${matchedKey}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      // Find the full URL for the target
      const toTitle = urlToTitle.get(matchedKey) ?? targetNorm;
      const toUrl = cmsPosts.find(p => urlsMatch(p.url, resolvedHref!))?.url ?? href;

      links.push({ from_url: fromUrl, from_title: fromTitle, to_url: toUrl, to_title: toTitle });
    }
  }

  return links;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/$/, "").toLowerCase();
  } catch {
    return url.replace(/\/$/, "").toLowerCase();
  }
}

/** Extract the last path segment (slug) for fuzzy matching */
function extractSlug(url: string): string {
  const norm = normalizeUrl(url);
  const parts = norm.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

/** Fuzzy URL comparison: exact pathname OR same slug */
function urlsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (normalizeUrl(a) === normalizeUrl(b)) return true;
  // Fallback: compare slugs (last segment)
  const slugA = extractSlug(a);
  const slugB = extractSlug(b);
  return slugA.length > 3 && slugA === slugB;
}

const STOPWORDS = new Set(["le","la","les","de","du","des","un","une","en","et","pour","par","a","au","aux","ce","se","son","sa","ses","il","elle","sur","dans","avec","qui","que","est","pas","plus","ne","ou","the","to","a","an","in","for","of","and","is","on","at","by","how","your","this","that","with"]);

function meaningfulWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-zàâéèêëïîôùûüç]+/g) ?? [];
  return new Set(words.filter(w => w.length > 2 && !STOPWORDS.has(w)));
}

/** Find the best matching cluster for an article by word overlap with all cluster keywords */
function findBestCluster(
  postTitle: string,
  postKeyword: string,
  clusters: CocoonCluster[]
): CocoonCluster | null {
  const titleWords = meaningfulWords(`${postTitle} ${postKeyword}`);
  if (titleWords.size === 0) return null;

  let bestCluster: CocoonCluster | null = null;
  let bestOverlap = 0;

  for (const cluster of clusters) {
    // Pool all keywords in this cluster
    const allKeywords = [
      cluster.pillar.keyword,
      cluster.name,
      ...(cluster.support_pages?.map(sp => sp.keyword) ?? []),
    ].join(" ");
    const clusterWords = meaningfulWords(allKeywords);

    const overlap = [...titleWords].filter(w => clusterWords.has(w)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestCluster = cluster;
    }
  }

  // Require at least 2 common meaningful words to avoid false positives
  return bestOverlap >= 2 ? bestCluster : null;
}

function matchesPage(
  cocoonPage: { keyword: string; title?: string; url?: string },
  postUrl: string,
  postKeyword: string,
  postTitle?: string
): boolean {
  // 1. URL match (exact or slug)
  if (cocoonPage.url && urlsMatch(cocoonPage.url, postUrl)) return true;
  // 2. Keyword match
  if (postKeyword && cocoonPage.keyword.toLowerCase() === postKeyword.toLowerCase()) return true;
  // 3. Title match (cocoon title vs CMS post title)
  if (postTitle && cocoonPage.title && cocoonPage.title.toLowerCase() === postTitle.toLowerCase()) return true;
  // 4. Keyword appears in post title (fuzzy)
  if (postTitle && cocoonPage.keyword && postTitle.toLowerCase().includes(cocoonPage.keyword.toLowerCase())) return true;
  // 5. Post keyword appears in cocoon page title
  if (postKeyword && cocoonPage.title && cocoonPage.title.toLowerCase().includes(postKeyword.toLowerCase())) return true;
  return false;
}

function countLinksInHtml(html: string, siteUrls: string[], siteUrl: string): number {
  const regex = /<a[^>]+href=["']([^"']+)["']/gi;
  let count = 0;
  let match;
  const domain = (() => { try { return new URL(siteUrl).hostname; } catch { return ""; } })();

  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    try {
      const u = new URL(href, siteUrl);
      if (u.hostname === domain) count++;
    } catch {
      if (href.startsWith("/")) count++;
    }
  }
  return count;
}

function countIncomingLinks(targetUrl: string, allPosts: CmsPost[], siteUrl: string): number {
  let count = 0;
  for (const post of allPosts) {
    if (urlsMatch(post.url, targetUrl)) continue; // skip self
    const regex = /<a[^>]+href=["']([^"']+)["']/gi;
    let match;
    while ((match = regex.exec(post.content)) !== null) {
      try {
        const u = new URL(match[1], siteUrl);
        if (urlsMatch(u.href, targetUrl)) {
          count++;
          break;
        }
      } catch {
        if (urlsMatch(match[1], targetUrl)) {
          count++;
          break;
        }
      }
    }
  }
  return count;
}

function countWords(html: string): number {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .length;
}

const CTR_TABLE: Record<number, number> = {
  1: 0.25, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05,
  6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
};

function getExpectedCtr(position: number): number {
  return CTR_TABLE[Math.round(Math.max(1, Math.min(10, position)))] ?? 0.01;
}

async function quickRisk(
  supabase: SupabaseClient,
  userId: string,
  page: PageLinkProfile,
  actionType: ActionContext["action_type"],
  linksToAdd: number,
  siteUrl: string
): Promise<number> {
  const history = await getModificationHistory(supabase, userId, page.url);

  const ctx: ActionContext = {
    action_type: actionType,
    target_url: page.url,
    target_title: page.title,
    keyword: page.keyword,
    position: page.position,
    impressions: page.impressions,
    clicks: page.clicks,
    ctr: page.ctr,
    is_homepage: (() => {
      try { return new URL(page.url).pathname === "/"; }
      catch { return page.url === siteUrl; }
    })(),
    is_pillar: page.role === "pillar",
    content_length: page.content_word_count,
    existing_internal_links: page.outgoing_internal,
    links_to_add: linksToAdd,
  };

  const assessment = assessRisk(ctx, history);
  return assessment.risk_score;
}
