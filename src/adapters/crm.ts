import { fnv1a } from "../hash.js";
import type { AdapterContext } from "./enrichment.js";
import type { CrmResult, EnrichmentResult, HttpRequestSpec, NormalizedVisitor, ScoreResult } from "../types.js";

export type CrmInput = {
  leadId: string;
  visitor: NormalizedVisitor;
  score: ScoreResult;
  enrichment: EnrichmentResult;
};

export const HUBSPOT_PLACEHOLDER_HEADERS = {
  Authorization: "Bearer $HUBSPOT_TOKEN",
  "Content-Type": "application/json",
};

const INDUSTRY_ENUM: Record<string, string> = {
  software: "COMPUTER_SOFTWARE",
  saas: "COMPUTER_SOFTWARE",
  "computer software": "COMPUTER_SOFTWARE",
  "information technology": "INFORMATION_TECHNOLOGY_AND_SERVICES",
  fintech: "FINANCIAL_SERVICES",
  "financial services": "FINANCIAL_SERVICES",
  "financial technology": "FINANCIAL_SERVICES",
  retail: "RETAIL",
  ecommerce: "RETAIL",
  "e-commerce": "RETAIL",
  marketing: "MARKETING_AND_ADVERTISING",
  "marketing and advertising": "MARKETING_AND_ADVERTISING",
  hospitality: "HOSPITALITY",
  insurance: "INSURANCE",
  education: "EDUCATION_MANAGEMENT",
  "consumer goods": "CONSUMER_GOODS",
};

export type ContactUpsertBody = {
  inputs: Array<{
    id: string;
    idProperty: "email";
    properties: Record<string, string>;
  }>;
};

export type CompanyUpsertBody = {
  inputs: Array<{
    id: string;
    idProperty: "domain";
    properties: Record<string, string>;
  }>;
};

export function industryEnum(industry: string | null): string | null {
  if (!industry) return null;
  return INDUSTRY_ENUM[industry.trim().toLowerCase()] ?? null;
}

export function buildContactUpsert(input: CrmInput): { path: string; body: ContactUpsertBody } {
  const industry = input.enrichment.profile.industry ?? input.visitor.industry;
  const properties: Record<string, string> = {
    email: input.visitor.email,
    firstname: input.visitor.firstName,
    lastname: input.visitor.lastName,
    jobtitle: input.visitor.title,
    company: input.visitor.company,
    website: input.visitor.domain ? `https://${input.visitor.domain}` : "",
    lifecyclestage: input.score.qualified ? "marketingqualifiedlead" : "lead",
    hs_lead_status: input.score.qualified ? "OPEN" : "NEW",
    icp_score: String(input.score.total),
    icp_disposition: input.score.disposition,
  };
  const mapped = industryEnum(industry);
  if (mapped) properties.industry = mapped;
  return {
    path: "/crm/v3/objects/contacts/batch/upsert",
    body: {
      inputs: [
        {
          id: input.visitor.email,
          idProperty: "email",
          properties,
        },
      ],
    },
  };
}

export function buildCompanyUpsert(input: CrmInput): { path: string; body: CompanyUpsertBody } {
  const profile = input.enrichment.profile;
  const industry = profile.industry ?? input.visitor.industry;
  const employees = profile.employeeCount ?? input.visitor.employeeCount;
  const properties: Record<string, string> = {
    domain: input.visitor.domain,
    name: profile.companyName ?? input.visitor.company,
    description: `Synthetic demo company. Revenue band ${profile.revenueRange ?? "unknown"}.`,
  };
  const mapped = industryEnum(industry);
  if (mapped) properties.industry = mapped;
  if (employees != null) properties.numberofemployees = String(employees);
  if (profile.city) properties.city = profile.city;
  if (profile.state) properties.state = profile.state;
  return {
    path: "/crm/v3/objects/companies/batch/upsert",
    body: {
      inputs: [
        {
          id: input.visitor.domain,
          idProperty: "domain",
          properties,
        },
      ],
    },
  };
}

export function associationPath(contactId: string, companyId: string): string {
  return `/crm/v4/objects/contacts/${encodeURIComponent(contactId)}/associations/default/companies/${encodeURIComponent(companyId)}`;
}

export function createMockCrm() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async upsert(input: CrmInput, ctx: AdapterContext): Promise<CrmResult> {
      calls += 1;
      const contact = buildContactUpsert(input);
      const company = buildCompanyUpsert(input);
      const contactId = `demo_contact_${fnv1a(input.visitor.email)}`;
      const companyId = `demo_company_${fnv1a(input.visitor.domain)}`;
      const requests: HttpRequestSpec[] = [
        spec("POST", contact.path, contact.body),
        spec("POST", company.path, company.body),
        { method: "PUT", url: `https://api.hubapi.com${associationPath(contactId, companyId)}`, headers: HUBSPOT_PLACEHOLDER_HEADERS },
      ];
      ctx.log.info("crm.upsert", {
        stage: "crm",
        message: "Mock HubSpot upsert built. No request was sent.",
        durationMs: 0,
      });
      return { adapter: "mock", contactId, companyId, association: "linked", requests };
    },
  };
}

function spec(method: "POST", path: string, body: unknown): HttpRequestSpec {
  return {
    method,
    url: `https://api.hubapi.com${path}`,
    headers: HUBSPOT_PLACEHOLDER_HEADERS,
    body,
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Production-shaped HubSpot CRM v3 upsert.
 * Called only when ADAPTERS=live and HUBSPOT_TOKEN is set. This repo ships no token.
 */
export async function executeHubSpotUpsert(input: CrmInput, token: string, fetchImpl: FetchLike = fetch): Promise<CrmResult> {
  if (!token.trim()) throw new Error("HUBSPOT_TOKEN is not set");
  const contact = buildContactUpsert(input);
  const company = buildCompanyUpsert(input);
  const contactId = await postBatch(fetchImpl, token, contact.path, contact.body);
  const companyId = await postBatch(fetchImpl, token, company.path, company.body);
  const link = associationPath(contactId, companyId);
  const association = await fetchImpl(`https://api.hubapi.com${link}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!association.ok) throw new Error(`HubSpot association failed (${association.status})`);
  return {
    adapter: "hubspot",
    contactId,
    companyId,
    association: "linked",
    requests: [
      spec("POST", contact.path, contact.body),
      spec("POST", company.path, company.body),
      { method: "PUT", url: `https://api.hubapi.com${link}`, headers: HUBSPOT_PLACEHOLDER_HEADERS },
    ],
  };
}

async function postBatch(fetchImpl: FetchLike, token: string, path: string, body: unknown): Promise<string> {
  const response = await fetchImpl(`https://api.hubapi.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`HubSpot ${path} failed (${response.status})`);
  const json = (await response.json()) as { results?: Array<{ id?: string }> };
  const id = json.results?.[0]?.id;
  if (!id) throw new Error(`HubSpot ${path} returned no id`);
  return id;
}
