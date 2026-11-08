import { domainFromWebsiteOrEmail, normalizeDomain, normalizePath, parseEmployeeCount } from "../scoring/parse.js";
import type { NormalizedVisitor } from "../types.js";

const ALIASES = {
  firstName: ["first_name", "First Name", "firstName"],
  lastName: ["last_name", "Last Name", "lastName"],
  title: ["title", "Title", "job_title"],
  company: ["company_name", "Company Name", "company", "companyName"],
  email: ["business_email", "Business Email", "email", "Email"],
  website: ["website", "Website", "domain", "Domain"],
  industry: ["industry", "Industry"],
  employees: ["employee_count", "Employee Count", "employees", "employeeCount"],
  city: ["city", "City"],
  state: ["state", "State"],
  seenAt: ["seen_at", "Seen At", "seenAt"],
  referrer: ["referrer", "Referrer"],
  capturedUrl: ["captured_url", "Captured URL", "capturedUrl"],
  linkedin: ["linkedin_url", "LinkedIn URL", "linkedinUrl"],
  tags: ["tags", "Tags"],
  pages: ["pages", "pages_viewed", "Pages Viewed", "pagesViewed"],
} as const;

export function normalizeVisitor(payload: unknown, now: Date = new Date()): NormalizedVisitor {
  const source = asRecord(payload);
  const email = asString(pick(source, ALIASES.email))?.trim().toLowerCase() ?? "";
  const website = asString(pick(source, ALIASES.website));
  const explicitDomain = asString(source.domain) ?? asString(source.Domain);
  const domain = domainFromWebsiteOrEmail(website, email, explicitDomain);
  const firstName = cleanName(asString(pick(source, ALIASES.firstName))) ?? "Unknown";
  const lastName = cleanName(asString(pick(source, ALIASES.lastName))) ?? "Visitor";
  const capturedUrl = asString(pick(source, ALIASES.capturedUrl));
  const pages = uniquePages(pick(source, ALIASES.pages), capturedUrl);
  const company = asString(pick(source, ALIASES.company))?.trim() || titleCaseDomain(domain) || "Unknown company";

  return {
    source: "rb2b",
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    email,
    title: asString(pick(source, ALIASES.title))?.trim() ?? "",
    company,
    domain: normalizeDomain(domain),
    industry: asString(pick(source, ALIASES.industry))?.trim() || null,
    employeeCount: parseEmployeeCount(pick(source, ALIASES.employees)),
    employeeRange: asString(pick(source, ALIASES.employees)),
    city: asString(pick(source, ALIASES.city))?.trim() || null,
    state: asString(pick(source, ALIASES.state))?.trim() || null,
    linkedinUrl: asString(pick(source, ALIASES.linkedin))?.trim() || null,
    seenAt: asString(pick(source, ALIASES.seenAt))?.trim() || now.toISOString(),
    referrer: asString(pick(source, ALIASES.referrer))?.trim() || null,
    capturedUrl: capturedUrl?.trim() || null,
    pages,
    tags: asTags(pick(source, ALIASES.tags)),
  };
}

export function assertSyntheticVisitor(visitor: NormalizedVisitor): void {
  if (!visitor.email) {
    throw new SyntheticDataError("Add a business email.");
  }
  if (!visitor.email.endsWith("@example.com")) {
    throw new SyntheticDataError("Use an email that ends with @example.com. This demo stores synthetic visitors only.");
  }
  if (!visitor.domain) {
    throw new SyntheticDataError("Add a company domain.");
  }
  if (!visitor.domain.endsWith(".example")) {
    throw new SyntheticDataError("Use a company domain that ends with .example. This demo stores synthetic companies only.");
  }
}

export class SyntheticDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyntheticDataError";
  }
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function pick(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  return value;
}

function cleanName(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function uniquePages(value: unknown, capturedUrl?: string | null): string[] {
  const pages: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) pages.push(normalizePath(item));
    }
  } else if (typeof value === "string") {
    for (const part of value.split(",")) {
      if (part.trim()) pages.push(normalizePath(part));
    }
  }
  if (capturedUrl) pages.push(normalizePath(capturedUrl));
  return [...new Set(pages)].slice(0, 12);
}

function asTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").slice(0, 8);
  if (typeof value === "string" && value.trim()) return value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  return [];
}

function titleCaseDomain(domain: string): string {
  const label = domain.split(".")[0] ?? "";
  return label
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
