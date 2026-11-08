export interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
}

export type Env = {
  LEADS_KV?: KvNamespace;
  ADAPTERS?: string;
  ICP_THRESHOLD?: string;
  DEMO_PACE_MS?: string;
  HUBSPOT_TOKEN?: string;
  SLACK_WEBHOOK_URL?: string;
  CLEARBIT_KEY?: string;
  APOLLO_API_KEY?: string;
  PDL_API_KEY?: string;
  LOG?: string;
};

export type StageName = "identify" | "enrich" | "score" | "crm" | "alert";

export type StageStatus = "ok" | "skipped" | "error";

export type LogLevel = "info" | "warn" | "error";

export type LogRecord = {
  ts: string;
  level: LogLevel;
  event: string;
  message: string;
  stage?: string;
  attempt?: number;
  durationMs?: number;
  idempotencyKey?: string;
  provider?: string;
};

export type NormalizedVisitor = {
  source: "rb2b";
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  title: string;
  company: string;
  domain: string;
  industry: string | null;
  employeeCount: number | null;
  employeeRange: string | null;
  city: string | null;
  state: string | null;
  linkedinUrl: string | null;
  seenAt: string;
  referrer: string | null;
  capturedUrl: string | null;
  pages: string[];
  tags: string[];
};

export type Firmographics = {
  industry: string | null;
  employeeCount: number | null;
  employeeRange: string | null;
  revenueRange: string | null;
  city: string | null;
  state: string | null;
  emailStatus: "valid" | "unknown" | "invalid" | null;
  linkedinUrl: string | null;
  companyName: string | null;
};

export type ProviderName = "clearbit" | "apollo" | "peopledata";

export type ProviderAttempt = {
  provider: ProviderName;
  label: string;
  ok: boolean;
  attempts: number;
  durationMs: number;
  error?: string;
  fields: Partial<Firmographics>;
  raw?: unknown;
};

export type EnrichmentResult = {
  profile: Firmographics;
  attempts: ProviderAttempt[];
  filledBy: ProviderName | null;
};

export type ScoreBreakdown = {
  industryFit: number;
  titleSeniority: number;
  companySize: number;
  pageIntent: number;
};

export type ScoreReasons = {
  industryFit: string;
  titleSeniority: string;
  companySize: string;
  pageIntent: string;
};

export type IcpWeights = {
  industryFit: number;
  titleSeniority: number;
  companySize: number;
  pageIntent: number;
};

export type ScoreResult = {
  total: number;
  threshold: number;
  qualified: boolean;
  disposition: "mql" | "nurture";
  breakdown: ScoreBreakdown;
  weights: IcpWeights;
  contributions: ScoreBreakdown;
  reasons: ScoreReasons;
};

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

export type HttpRequestSpec = {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};

export type CrmResult = {
  adapter: "mock" | "hubspot";
  contactId: string;
  companyId: string;
  association: "linked";
  requests: HttpRequestSpec[];
};

export type AlertResult = {
  adapter: "mock" | "slack" | "none";
  simulated: boolean;
  delivered: boolean;
  skipped: boolean;
  reason: string;
  request: HttpRequestSpec | null;
};

export type StageTrace = {
  stage: StageName;
  status: StageStatus;
  startedAt: string;
  durationMs: number;
  input: unknown;
  output: unknown;
};

export type LeadRecord = {
  id: string;
  idempotencyKey: string;
  synthetic: true;
  createdAt: string;
  visitor: NormalizedVisitor;
  enrichment: EnrichmentResult;
  score: ScoreResult;
  crm: CrmResult | null;
  alert: AlertResult;
  stages: StageTrace[];
  logs: LogRecord[];
  qualified: boolean;
  disposition: "mql" | "nurture";
  durationMs: number;
};

export type LeadSummary = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  company: string;
  domain: string;
  title: string;
  score: number;
  threshold: number;
  disposition: "mql" | "nurture";
  qualified: boolean;
  durationMs: number;
};

export type PipelineEvent =
  | { type: "stage"; phase: "start"; stage: StageName; at: string }
  | {
      type: "stage";
      phase: "done";
      stage: StageName;
      status: StageStatus;
      at: string;
      durationMs: number;
      input: unknown;
      output: unknown;
    }
  | { type: "duplicate"; lead: LeadRecord }
  | { type: "lead"; duplicate: boolean; lead: LeadRecord };

export const EMPTY_PROFILE: Firmographics = {
  industry: null,
  employeeCount: null,
  employeeRange: null,
  revenueRange: null,
  city: null,
  state: null,
  emailStatus: null,
  linkedinUrl: null,
  companyName: null,
};

export const STAGE_ORDER: StageName[] = ["identify", "enrich", "score", "crm", "alert"];
