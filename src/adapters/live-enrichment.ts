import type { FetchLike } from "./crm.js";
import type { Firmographics, NormalizedVisitor } from "../types.js";

/**
 * Production-shaped enrichment calls. The demo pipeline does not invoke these
 * unless ADAPTERS=live and the matching key is present. No keys ship in the repo.
 * Each function returns firmographics parsed from the public vendor response shape.
 */

export async function executeClearbit(visitor: NormalizedVisitor, token: string, fetchImpl: FetchLike = fetch): Promise<Partial<Firmographics>> {
  if (!token.trim()) throw new Error("CLEARBIT_KEY is not set");
  const url = `https://person.clearbit.com/v2/combined/find?email=${encodeURIComponent(visitor.email)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`Clearbit lookup failed (${response.status})`);
  const body = (await response.json()) as {
    company?: {
      category?: { industry?: string };
      metrics?: { employees?: number; estimatedAnnualRevenue?: string };
      geo?: { city?: string; state?: string };
      name?: string;
    };
  };
  return {
    industry: body.company?.category?.industry ?? null,
    employeeCount: body.company?.metrics?.employees ?? null,
    revenueRange: body.company?.metrics?.estimatedAnnualRevenue ?? null,
    city: body.company?.geo?.city ?? null,
    state: body.company?.geo?.state ?? null,
    companyName: body.company?.name ?? null,
    emailStatus: "valid",
  };
}

export async function executeApollo(visitor: NormalizedVisitor, token: string, fetchImpl: FetchLike = fetch): Promise<Partial<Firmographics>> {
  if (!token.trim()) throw new Error("APOLLO_API_KEY is not set");
  const response = await fetchImpl("https://api.apollo.io/api/v1/people/match", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": token },
    body: JSON.stringify({ email: visitor.email, reveal_personal_emails: false }),
  });
  if (!response.ok) throw new Error(`Apollo match failed (${response.status})`);
  const body = (await response.json()) as {
    person?: {
      email_status?: string;
      organization?: { industry?: string; estimated_num_employees?: number; name?: string };
    };
  };
  const status = body.person?.email_status;
  return {
    industry: body.person?.organization?.industry ?? null,
    employeeCount: body.person?.organization?.estimated_num_employees ?? null,
    companyName: body.person?.organization?.name ?? null,
    emailStatus: status === "verified" ? "valid" : status ? "unknown" : null,
  };
}

export async function executePdl(visitor: NormalizedVisitor, token: string, fetchImpl: FetchLike = fetch): Promise<Partial<Firmographics>> {
  if (!token.trim()) throw new Error("PDL_API_KEY is not set");
  const url = `https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(visitor.email)}&pretty=false`;
  const response = await fetchImpl(url, { headers: { "X-Api-Key": token } });
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`People Data Labs enrich failed (${response.status})`);
  const body = (await response.json()) as {
    data?: {
      job_company_industry?: string;
      job_company_size?: string;
      job_company_name?: string;
      linkedin_url?: string;
    };
  };
  return {
    industry: body.data?.job_company_industry ?? null,
    employeeRange: body.data?.job_company_size ?? null,
    companyName: body.data?.job_company_name ?? null,
    linkedinUrl: body.data?.linkedin_url ?? null,
  };
}
