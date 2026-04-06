import { describe, it, expect } from "vitest";
import { selectModel, parseAiJson, assessComplexity, assessPageRisk } from "../ai-router";

describe("selectModel", () => {
  it("returns Opus for decision tasks by default", () => {
    const result = selectModel({ task: "semantic_cocoon" });
    expect(result.tier).toBe("opus");
    expect(result.model).toBe("claude-opus-4-6");
  });

  it("returns Sonnet for execution tasks by default", () => {
    const result = selectModel({ task: "content_generation" });
    expect(result.tier).toBe("sonnet");
    expect(result.model).toBe("claude-sonnet-4-6");
  });

  it("returns Haiku for utility tasks by default", () => {
    const result = selectModel({ task: "style_extraction" });
    expect(result.tier).toBe("haiku");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("upgrades to Opus when risk_level >= 70", () => {
    const result = selectModel({ task: "content_generation", risk_level: 75 });
    expect(result.tier).toBe("opus");
    expect(result.reason).toContain("Risk upgrade");
  });

  it("does not upgrade Opus tasks on high risk (already Opus)", () => {
    const result = selectModel({ task: "seo_analysis", risk_level: 90 });
    expect(result.tier).toBe("opus");
    expect(result.reason).toContain("Default");
  });

  it("upgrades to Opus on high complexity", () => {
    const result = selectModel({ task: "content_generation", complexity: "high" });
    expect(result.tier).toBe("opus");
    expect(result.reason).toContain("Complexity upgrade");
  });

  it("respects force_tier override", () => {
    const result = selectModel({ task: "seo_analysis", force_tier: "haiku" });
    expect(result.tier).toBe("haiku");
    expect(result.reason).toContain("Forced");
  });

  it("force_tier takes priority over risk upgrade", () => {
    const result = selectModel({ task: "content_generation", risk_level: 90, force_tier: "sonnet" });
    expect(result.tier).toBe("sonnet");
  });

  it("uses custom max_tokens when provided", () => {
    const result = selectModel({ task: "content_generation", max_tokens: 12000 });
    expect(result.max_tokens).toBe(12000);
  });

  it("uses default max_tokens when not provided", () => {
    const result = selectModel({ task: "style_extraction" });
    expect(result.max_tokens).toBe(600);
  });
});

describe("parseAiJson", () => {
  it("parses raw JSON", () => {
    const result = parseAiJson<{ name: string }>('{"name":"test"}');
    expect(result).toEqual({ name: "test" });
  });

  it("extracts JSON from markdown code block", () => {
    const text = 'Here is the result:\n```json\n{"score": 42}\n```\nDone.';
    const result = parseAiJson<{ score: number }>(text);
    expect(result).toEqual({ score: 42 });
  });

  it("extracts JSON between first { and last }", () => {
    const text = 'Some text before {"key": "value"} some text after';
    const result = parseAiJson<{ key: string }>(text);
    expect(result).toEqual({ key: "value" });
  });

  it("extracts arrays", () => {
    const text = 'Results: ["a", "b", "c"]';
    const result = parseAiJson<string[]>(text);
    expect(result).toEqual(["a", "b", "c"]);
  });

  it("returns null for unparseable text", () => {
    const result = parseAiJson("This is just plain text with no JSON");
    expect(result).toBeNull();
  });

  it("handles nested JSON with text around it", () => {
    const text = 'Sure! {"articles": [{"title": "Test", "id": 1}], "count": 1}';
    const result = parseAiJson<{ articles: { title: string }[]; count: number }>(text);
    expect(result?.articles[0].title).toBe("Test");
    expect(result?.count).toBe(1);
  });
});

describe("assessComplexity", () => {
  it("returns low for minimal factors", () => {
    expect(assessComplexity({})).toBe("low");
    expect(assessComplexity({ keywords_count: 5 })).toBe("low");
  });

  it("returns medium for moderate factors", () => {
    expect(assessComplexity({ data_sources: 3, keywords_count: 15, has_gsc_data: true })).toBe("medium");
  });

  it("returns high for many factors", () => {
    expect(assessComplexity({
      data_sources: 5,
      keywords_count: 35,
      pages_count: 25,
      has_gsc_data: true,
      has_cocoon: true,
    })).toBe("high");
  });
});

describe("assessPageRisk", () => {
  it("returns 0 for empty page", () => {
    expect(assessPageRisk({})).toBe(0);
  });

  it("returns high risk for homepage in top 3", () => {
    const risk = assessPageRisk({ is_homepage: true, position: 2, clicks: 150 });
    expect(risk).toBeGreaterThanOrEqual(70);
  });

  it("caps at 100", () => {
    const risk = assessPageRisk({ is_homepage: true, is_pillar: true, position: 1, clicks: 200 });
    expect(risk).toBeLessThanOrEqual(100);
  });

  it("returns moderate risk for pillar page", () => {
    const risk = assessPageRisk({ is_pillar: true, position: 8 });
    expect(risk).toBeGreaterThanOrEqual(30);
    expect(risk).toBeLessThan(70);
  });
});
