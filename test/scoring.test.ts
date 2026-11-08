import { describe, expect, it } from "vitest";
import { defaultIcpConfig, resolveConfig } from "../src/scoring/config.js";
import { scoreCompanySize, scoreIcp, scoreIndustry, scorePageIntent, scoreTitle } from "../src/scoring/icp.js";
import { normalizePath, parseEmployeeCount } from "../src/scoring/parse.js";

describe("employee parsing", () => {
  it("reads numbers, ranges, plus-bands, and words", () => {
    expect(parseEmployeeCount(420)).toBe(420);
    expect(parseEmployeeCount("51-200")).toBe(126);
    expect(parseEmployeeCount("1,001-5,000")).toBe(3001);
    expect(parseEmployeeCount("10,001+")).toBe(10001);
    expect(parseEmployeeCount("2k-3k")).toBe(2500);
    expect(parseEmployeeCount("350 employees")).toBe(350);
    expect(parseEmployeeCount("")).toBeNull();
    expect(parseEmployeeCount(null)).toBeNull();
  });
});

describe("paths", () => {
  it("normalizes hosts, queries, and missing slashes", () => {
    expect(normalizePath("https://acme-loyalty.example/pricing?ref=demo")).toBe("/pricing");
    expect(normalizePath("Demo/")).toBe("/demo");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("ICP score", () => {
  it("uses the published weights and a threshold of 70", () => {
    expect(defaultIcpConfig.threshold).toBe(70);
    expect(defaultIcpConfig.weights).toEqual({
      industryFit: 0.3,
      titleSeniority: 0.25,
      companySize: 0.2,
      pageIntent: 0.25,
    });
  });

  it("rejects weights that do not sum to 1", () => {
    expect(() => resolveConfig({ weights: { industryFit: 0.5, titleSeniority: 0.5, companySize: 0.5, pageIntent: 0.5 } })).toThrow(/sum to 1/);
  });

  it("scores industries, titles, headcount, and pages", () => {
    expect(scoreIndustry("Retail", defaultIcpConfig).score).toBe(100);
    expect(scoreIndustry("Consumer Goods", defaultIcpConfig).score).toBe(60);
    expect(scoreIndustry("Libraries", defaultIcpConfig).score).toBe(18);
    expect(scoreIndustry(null, defaultIcpConfig).score).toBe(35);
    expect(scoreTitle("VP of Growth").score).toBe(90);
    expect(scoreTitle("Chief Revenue Officer").score).toBe(100);
    expect(scoreTitle("Director of Ecommerce").score).toBe(78);
    expect(scoreTitle("Marketing Intern").score).toBe(12);
    expect(scoreTitle("Content Specialist").score).toBe(32);
    expect(scoreCompanySize(60).score).toBe(100);
    expect(scoreCompanySize(420).score).toBe(92);
    expect(scoreCompanySize(18000).score).toBe(30);
    expect(scoreCompanySize(null).score).toBe(40);
    expect(scorePageIntent(["/pricing", "/demo", "/customers"], defaultIcpConfig).score).toBe(100);
    expect(scorePageIntent(["/blog"], defaultIcpConfig).score).toBe(8);
    expect(scorePageIntent([], defaultIcpConfig).score).toBe(0);
  });

  it("qualifies on the threshold and nurtures one point below", () => {
    const onLine = scoreIcp({ industry: "Software", title: "Director of Partnerships", employeeCount: 10, pages: ["/about"] });
    expect(onLine.breakdown.titleSeniority).toBe(78);
    const exact = scoreIcp(
      { industry: "Software", title: "VP of Growth", employeeCount: 8, pages: ["/blog"] },
      { weights: { industryFit: 0.3, titleSeniority: 0.25, companySize: 0.2, pageIntent: 0.25 } },
    );
    expect(exact.total).toBe(Math.round(100 * 0.3 + 90 * 0.25 + 20 * 0.2 + 8 * 0.25));
    const boundary = scoreIcp({ industry: null, title: null, employeeCount: null, pages: [] }, { threshold: 0 });
    expect(boundary.qualified).toBe(true);
    const below = scoreIcp({ industry: "Libraries", title: "Marketing Intern", employeeCount: 12, pages: ["/careers"] });
    expect(below.qualified).toBe(false);
    expect(below.disposition).toBe("nurture");
  });

  it("lets a caller put the entire weight on one dimension", () => {
    const score = scoreIcp(
      { industry: "Retail", title: "Intern", employeeCount: 8, pages: ["/blog"] },
      { weights: { industryFit: 1, titleSeniority: 0, companySize: 0, pageIntent: 0 } },
    );
    expect(score.total).toBe(100);
    expect(score.disposition).toBe("mql");
  });

  it("treats a score equal to the threshold as an MQL", () => {
    const score = scoreIcp(
      { industry: "Software", title: "VP of Growth", employeeCount: 60, pages: ["/pricing", "/demo"] },
      { threshold: 98 },
    );
    expect(score.total).toBe(98);
    expect(score.qualified).toBe(true);
    const miss = scoreIcp(
      { industry: "Software", title: "VP of Growth", employeeCount: 60, pages: ["/pricing", "/demo"] },
      { threshold: 99 },
    );
    expect(miss.qualified).toBe(false);
  });
});
