import type { IcpConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { normalizePath } from "./parse.js";
import type { ScoreBreakdown, ScoreReasons, ScoreResult } from "../types.js";

export type ScoreInput = {
  industry: string | null;
  title: string | null;
  employeeCount: number | null;
  pages: string[];
};

const TITLE_RULES: Array<{ pattern: RegExp; score: number; band: string }> = [
  { pattern: /\b(chief|ceo|cmo|cro|cto|cfo|cio|founder|co-founder|cofounder|president)\b/i, score: 100, band: "executive" },
  { pattern: /\b(svp|evp|vp|vice president|head of)\b/i, score: 90, band: "VP / Head" },
  { pattern: /\bdirector\b/i, score: 78, band: "director" },
  { pattern: /\b(senior manager|manager|lead|principal)\b/i, score: 55, band: "manager" },
  { pattern: /\b(specialist|coordinator|associate|analyst|consultant)\b/i, score: 32, band: "individual contributor" },
  { pattern: /\b(intern|student|assistant|junior)\b/i, score: 12, band: "junior" },
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function matchesList(value: string, list: string[]): boolean {
  return list.some((item) => value === item || value.includes(item));
}

export function scoreIndustry(industry: string | null, config: IcpConfig): { score: number; reason: string } {
  const value = industry?.trim().toLowerCase() ?? "";
  if (!value) {
    return { score: 35, reason: "Industry was missing, so fit stays uncertain." };
  }
  if (matchesList(value, config.targetIndustries)) {
    return { score: 100, reason: `${industry} matches the ICP industry list.` };
  }
  if (matchesList(value, config.adjacentIndustries)) {
    return { score: 60, reason: `${industry} is adjacent to the ICP.` };
  }
  return { score: 18, reason: `${industry} sits outside the ICP industry list.` };
}

export function scoreTitle(title: string | null): { score: number; reason: string } {
  const value = title?.trim() ?? "";
  if (!value) return { score: 15, reason: "Title was missing." };
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(value)) {
      return { score: rule.score, reason: `${value} maps to ${rule.band}.` };
    }
  }
  return { score: 40, reason: `${value} has no seniority match, so the title score stays neutral.` };
}

export function scoreCompanySize(employeeCount: number | null): { score: number; reason: string } {
  if (employeeCount == null) {
    return { score: 40, reason: "Headcount was missing, so company size stays uncertain." };
  }
  const label = new Intl.NumberFormat("en-US").format(employeeCount);
  if (employeeCount < 10) return { score: 20, reason: `${label} employees is below the mid-market band.` };
  if (employeeCount < 50) return { score: 55, reason: `${label} employees is a small company, under the core band.` };
  if (employeeCount <= 200) return { score: 100, reason: `${label} employees sits in the core mid-market band.` };
  if (employeeCount <= 1000) return { score: 92, reason: `${label} employees sits in the mid-market band.` };
  if (employeeCount <= 5000) return { score: 70, reason: `${label} employees is upper mid-market.` };
  if (employeeCount <= 10000) return { score: 45, reason: `${label} employees is a large company, past the sweet spot.` };
  return { score: 30, reason: `${label} employees is enterprise scale, above the ICP band.` };
}

function classifyPath(path: string, config: IcpConfig): "high" | "medium" | "low" | "other" {
  const match = (list: string[]) =>
    list.some((item) => path === item || (item !== "/" && path.startsWith(`${item}/`)));
  if (match(config.highIntentPaths)) return "high";
  if (match(config.mediumIntentPaths)) return "medium";
  if (match(config.lowIntentPaths)) return "low";
  return "other";
}

const INTENT_POINTS = { high: 45, medium: 22, low: 8, other: 12 } as const;

export function scorePageIntent(pages: string[], config: IcpConfig): { score: number; reason: string } {
  const normalized = [...new Set(pages.map((page) => normalizePath(page)).filter(Boolean))];
  if (normalized.length === 0) return { score: 0, reason: "No pages were captured." };

  let score = 0;
  for (const page of normalized) score += INTENT_POINTS[classifyPath(page, config)];

  const hasPricing = normalized.includes("/pricing");
  const hasDemo = normalized.some((page) => ["/demo", "/request-demo", "/book-demo", "/book"].includes(page));
  if (hasPricing && hasDemo) score += 15;
  if (normalized.length >= 3) score += 10;
  score = Math.min(100, score);

  return {
    score,
    reason: `${normalized.join(", ")} ${normalized.length === 1 ? "scores" : "score"} ${score} for page intent.`,
  };
}

export function scoreIcp(input: ScoreInput, configInput?: Partial<IcpConfig>): ScoreResult {
  const config = resolveConfig(configInput);
  const industry = scoreIndustry(input.industry, config);
  const title = scoreTitle(input.title);
  const size = scoreCompanySize(input.employeeCount);
  const intent = scorePageIntent(input.pages, config);

  const breakdown: ScoreBreakdown = {
    industryFit: clampScore(industry.score),
    titleSeniority: clampScore(title.score),
    companySize: clampScore(size.score),
    pageIntent: clampScore(intent.score),
  };
  const contributions: ScoreBreakdown = {
    industryFit: round1(breakdown.industryFit * config.weights.industryFit),
    titleSeniority: round1(breakdown.titleSeniority * config.weights.titleSeniority),
    companySize: round1(breakdown.companySize * config.weights.companySize),
    pageIntent: round1(breakdown.pageIntent * config.weights.pageIntent),
  };
  const total = clampScore(
    breakdown.industryFit * config.weights.industryFit +
      breakdown.titleSeniority * config.weights.titleSeniority +
      breakdown.companySize * config.weights.companySize +
      breakdown.pageIntent * config.weights.pageIntent,
  );
  const qualified = total >= config.threshold;
  const reasons: ScoreReasons = {
    industryFit: industry.reason,
    titleSeniority: title.reason,
    companySize: size.reason,
    pageIntent: intent.reason,
  };

  return {
    total,
    threshold: config.threshold,
    qualified,
    disposition: qualified ? "mql" : "nurture",
    breakdown,
    weights: config.weights,
    contributions,
    reasons,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
