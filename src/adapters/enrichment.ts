import { companyByDomain, type CompanyProfile } from "../data/companies.js";
import type { Logger } from "../logger.js";
import { withRetry, type RetryOptions } from "../retry.js";
import { sleep } from "../retry.js";
import type { EnrichmentResult, Firmographics, NormalizedVisitor, ProviderAttempt, ProviderName } from "../types.js";
import { EMPTY_PROFILE } from "../types.js";

export type AdapterContext = {
  log: Logger;
  paceMs: number;
  retry: RetryOptions;
};

type ProviderHit = {
  fields: Partial<Firmographics>;
  raw: unknown;
};

type Provider = {
  name: ProviderName;
  label: string;
  lookup: (visitor: NormalizedVisitor, attempt: number) => Promise<ProviderHit>;
};

export function createMockEnrichment() {
  return {
    async enrich(visitor: NormalizedVisitor, ctx: AdapterContext): Promise<EnrichmentResult> {
      const providers = mockProviders();
      const profile: Firmographics = { ...EMPTY_PROFILE };
      const attempts: ProviderAttempt[] = [];
      let filledBy: ProviderName | null = null;

      for (const provider of providers) {
        if (isComplete(profile)) break;
        if (ctx.paceMs > 0) await sleep(Math.min(ctx.paceMs, 160));
        const started = Date.now();
        try {
          const result = await withRetry(provider.name, (attempt) => provider.lookup(visitor, attempt), ctx.retry, ctx.log);
          mergeProfile(profile, result.value.fields);
          if (!filledBy && Object.values(result.value.fields).some((value) => value != null && value !== "")) {
            filledBy = provider.name;
          }
          attempts.push({
            provider: provider.name,
            label: provider.label,
            ok: true,
            attempts: result.attempts,
            durationMs: Date.now() - started,
            fields: result.value.fields,
            raw: result.value.raw,
          });
          ctx.log.info("enrich.provider", {
            stage: "enrich",
            provider: provider.name,
            attempt: result.attempts,
            durationMs: Date.now() - started,
            message: `${provider.label} returned a profile`,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Provider failed";
          attempts.push({
            provider: provider.name,
            label: provider.label,
            ok: false,
            attempts: ctx.retry.retries + 1,
            durationMs: Date.now() - started,
            error: message,
            fields: {},
          });
          ctx.log.warn("enrich.fallback", {
            stage: "enrich",
            provider: provider.name,
            message: `${provider.label} exhausted retries. Falling through.`,
          });
        }
      }

      if (filledBy == null && isComplete(profile)) filledBy = attempts.find((attempt) => attempt.ok)?.provider ?? null;

      return { profile, attempts, filledBy };
    },
  };
}

function mockProviders(): Provider[] {
  return [
    { name: "clearbit", label: "Clearbit-shaped", lookup: clearbitLookup },
    { name: "apollo", label: "Apollo-shaped", lookup: apolloLookup },
    { name: "peopledata", label: "People Data Labs-shaped", lookup: pdlLookup },
  ];
}

async function clearbitLookup(visitor: NormalizedVisitor, attempt: number): Promise<ProviderHit> {
  assertAvailable(visitor.domain, "clearbit", attempt);
  const profile = companyByDomain.get(visitor.domain);
  if (!profile) return { fields: {}, raw: { matched: false, domain: visitor.domain } };
  const omitHeadcount = visitor.domain.startsWith("pebble-");
  const fields = fieldsFrom(profile, omitHeadcount ? "no-headcount" : "full");
  return { fields, raw: clearbitBody(visitor, profile, fields) };
}

async function apolloLookup(visitor: NormalizedVisitor): Promise<ProviderHit> {
  assertAvailable(visitor.domain, "apollo", 2);
  const profile = companyByDomain.get(visitor.domain);
  if (!profile) return { fields: {}, raw: { person: null, matched: false } };
  const fields = fieldsFrom(profile, "full");
  return {
    fields,
    raw: {
      person: {
        first_name: visitor.firstName,
        last_name: visitor.lastName,
        title: visitor.title,
        email: visitor.email,
        email_status: "verified",
        organization: {
          name: profile.company,
          primary_domain: profile.domain,
          industry: profile.industry.toLowerCase(),
          estimated_num_employees: profile.employeeCount,
        },
      },
    },
  };
}

async function pdlLookup(visitor: NormalizedVisitor): Promise<ProviderHit> {
  assertAvailable(visitor.domain, "peopledata", 2);
  const profile = companyByDomain.get(visitor.domain);
  if (!profile) return { fields: {}, raw: { status: 404, data: null } };
  const fields = fieldsFrom(profile, "full");
  return {
    fields,
    raw: {
      status: 200,
      data: {
        full_name: visitor.fullName.toLowerCase(),
        work_email: visitor.email,
        job_title: visitor.title.toLowerCase(),
        job_company_name: profile.company.toLowerCase(),
        job_company_industry: profile.industry.toLowerCase(),
        job_company_size: profile.employeeRange,
        job_company_location_locality: profile.city,
        linkedin_url: `https://www.linkedin.com/in/example-${visitor.firstName}-${visitor.lastName}`.toLowerCase(),
      },
    },
  };
}

function assertAvailable(domain: string, provider: ProviderName, attempt: number): void {
  if (domain.startsWith("offline-")) throw new Error("Synthetic provider outage");
  if (domain.startsWith("hollow-") && provider !== "peopledata") throw new Error("Synthetic provider outage");
  if (domain.startsWith("flaky-") && provider === "clearbit" && attempt === 1) throw new Error("Synthetic timeout");
}

function fieldsFrom(profile: CompanyProfile, mode: "full" | "no-headcount"): Partial<Firmographics> {
  const fields: Partial<Firmographics> = {
    industry: profile.industry,
    revenueRange: profile.revenueRange,
    city: profile.city,
    state: profile.state,
    emailStatus: "valid",
    linkedinUrl: `https://www.linkedin.com/company/example-${profile.domain.replace(".example", "")}`,
    companyName: profile.company,
    employeeRange: profile.employeeRange,
    employeeCount: profile.employeeCount,
  };
  if (mode === "no-headcount") {
    fields.employeeCount = null;
    fields.employeeRange = null;
  }
  return fields;
}

function clearbitBody(visitor: NormalizedVisitor, profile: CompanyProfile, fields: Partial<Firmographics>): unknown {
  const metrics: Record<string, unknown> = { estimatedAnnualRevenue: profile.revenueRange };
  if (fields.employeeCount != null) metrics.employees = fields.employeeCount;
  return {
    person: {
      name: { givenName: visitor.firstName, familyName: visitor.lastName },
      email: visitor.email,
      employment: { title: visitor.title, name: profile.company },
    },
    company: {
      name: profile.company,
      domain: profile.domain,
      category: { industry: profile.industry },
      metrics,
      geo: { city: profile.city, state: profile.state },
    },
  };
}

function mergeProfile(target: Firmographics, fields: Partial<Firmographics>): void {
  for (const key of Object.keys(fields) as Array<keyof Firmographics>) {
    const value = fields[key];
    if (value !== null && value !== undefined && target[key] == null) {
      // Firmographics values are scalars. Assign through a widened view.
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

function isComplete(profile: Firmographics): boolean {
  return Boolean(profile.industry && profile.employeeCount != null);
}
