import type { IcpWeights } from "../types.js";

export type IcpConfig = {
  threshold: number;
  weights: IcpWeights;
  targetIndustries: string[];
  adjacentIndustries: string[];
  highIntentPaths: string[];
  mediumIntentPaths: string[];
  lowIntentPaths: string[];
};

export const defaultIcpConfig: IcpConfig = {
  threshold: 70,
  weights: {
    industryFit: 0.3,
    titleSeniority: 0.25,
    companySize: 0.2,
    pageIntent: 0.25,
  },
  targetIndustries: [
    "software",
    "saas",
    "computer software",
    "information technology",
    "internet",
    "fintech",
    "financial technology",
    "financial services",
    "ecommerce",
    "e-commerce",
    "retail",
    "marketing and advertising",
    "marketing",
    "advertising",
  ],
  adjacentIndustries: [
    "consumer goods",
    "hospitality",
    "telecommunications",
    "logistics",
    "insurance",
  ],
  highIntentPaths: [
    "/pricing",
    "/demo",
    "/request-demo",
    "/book-demo",
    "/book",
    "/contact",
    "/talk-to-sales",
    "/get-started",
    "/signup",
  ],
  mediumIntentPaths: [
    "/product",
    "/platform",
    "/solutions",
    "/integrations",
    "/customers",
    "/case-studies",
    "/compare",
    "/features",
  ],
  lowIntentPaths: ["/", "/blog", "/careers", "/about", "/legal", "/privacy", "/jobs", "/news"],
};

export function resolveConfig(override?: Partial<IcpConfig> & { weights?: Partial<IcpWeights> }): IcpConfig {
  const weights: IcpWeights = {
    ...defaultIcpConfig.weights,
    ...override?.weights,
  };
  const sum =
    weights.industryFit + weights.titleSeniority + weights.companySize + weights.pageIntent;
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`ICP weights must sum to 1 (received ${sum})`);
  }
  const threshold = override?.threshold ?? defaultIcpConfig.threshold;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    throw new Error("ICP threshold must be a number from 0 to 100");
  }
  return {
    threshold,
    weights,
    targetIndustries: override?.targetIndustries ?? defaultIcpConfig.targetIndustries,
    adjacentIndustries: override?.adjacentIndustries ?? defaultIcpConfig.adjacentIndustries,
    highIntentPaths: override?.highIntentPaths ?? defaultIcpConfig.highIntentPaths,
    mediumIntentPaths: override?.mediumIntentPaths ?? defaultIcpConfig.mediumIntentPaths,
    lowIntentPaths: override?.lowIntentPaths ?? defaultIcpConfig.lowIntentPaths,
  };
}

export const ICP_SUMMARY =
  "Mid-market software, SaaS, fintech, ecommerce, and retail. Director level and above. Pricing, demo, or contact pages. Score of 70 or higher routes as an MQL.";
