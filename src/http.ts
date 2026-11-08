import { normalizeVisitor, assertSyntheticVisitor, SyntheticDataError } from "./adapters/visitor.js";
import { createLogger, consoleSink } from "./logger.js";
import { runPipeline, pipelineDepsFromEnv, type PipelineDeps } from "./pipeline.js";
import { normalizePath } from "./scoring/parse.js";
import { ICP_SUMMARY, defaultIcpConfig } from "./scoring/config.js";
import { LeadStore, summarize } from "./store.js";
import { sampleVisitors, toDemoBody } from "./data/visitors.js";
import { STAGE_ORDER, type Env, type PipelineEvent } from "./types.js";

export const DISCLAIMER = "Personal portfolio demo using synthetic data. No real people, companies, or metrics.";

export type HandlerOptions = {
  html?: string;
  store?: LeadStore;
  deps?: Partial<PipelineDeps>;
  silent?: boolean;
  paceMs?: number;
  rateLimit?: { limit: number; windowMs: number };
};

export function createHandler(options: HandlerOptions = {}) {
  let store = options.store;
  const hits: number[] = [];
  const limit = options.rateLimit?.limit ?? 60;
  const windowMs = options.rateLimit?.windowMs ?? 10_000;

  return async function handle(request: Request, env: Env = {}): Promise<Response> {
    if (!store) store = new LeadStore(env.LEADS_KV);
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    if (request.method === "OPTIONS") {
      return finish(new Response(null, { status: 204 }), origin);
    }

    try {
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return finish(htmlResponse(options.html ?? "<!doctype html><title>Visitor Route</title>"), origin);
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        return finish(json(200, { ok: true, synthetic: true, adapters: env.ADAPTERS ?? "mock", disclaimer: DISCLAIMER }), origin);
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        const threshold = Number(env.ICP_THRESHOLD);
        return finish(json(200, {
          synthetic: true,
          adapters: env.ADAPTERS ?? "mock",
          threshold: Number.isFinite(threshold) ? threshold : defaultIcpConfig.threshold,
          weights: defaultIcpConfig.weights,
          stages: STAGE_ORDER,
          icp: ICP_SUMMARY,
          disclaimer: DISCLAIMER,
        }), origin);
      }
      if (request.method === "GET" && url.pathname === "/api/samples") {
        return finish(json(200, {
          synthetic: true,
          samples: sampleVisitors().map((visitor) => ({ ...toDemoBody(visitor), story: visitor.story, key: visitor.key })),
        }), origin);
      }
      if (request.method === "GET" && url.pathname === "/api/leads") {
        const limitParam = Number(url.searchParams.get("limit") ?? "50");
        const leads = await store.list(Number.isFinite(limitParam) ? Math.min(limitParam, 100) : 50);
        return finish(json(200, { ok: true, synthetic: true, leads }), origin);
      }
      const leadMatch = url.pathname.match(/^\/api\/leads\/(lead_[a-z0-9]+)$/);
      if (request.method === "GET" && leadMatch) {
        const lead = await store.getById(leadMatch[1]);
        if (!lead) return finish(json(404, { ok: false, error: "No lead with that id." }), origin);
        return finish(json(200, { ok: true, synthetic: true, lead: { ...lead, summary: summarize(lead) } }), origin);
      }

      if (request.method === "POST" && (url.pathname === "/webhook/rb2b" || url.pathname === "/api/demo/run")) {
        if (limited(hits, limit, windowMs)) {
          return finish(json(429, { ok: false, error: "This demo is rate limited. Wait a few seconds and try again." }), origin);
        }
        const raw = await readJson(request);
        const payload = url.pathname === "/api/demo/run" ? demoToWebhook(raw) : raw;
        preflight(payload);
        const header = request.headers.get("idempotency-key");
        const wantsStream = url.pathname === "/api/demo/run" || request.headers.get("accept")?.includes("text/event-stream");
        if (url.pathname === "/api/demo/run" || wantsStream && url.pathname !== "/webhook/rb2b") {
          return finish(streamPipeline(payload, env, store, options, header), origin);
        }
        const result = await runPipeline(payload, buildDeps(env, store, options, header));
        return finish(json(200, {
          ok: true,
          duplicate: result.duplicate,
          synthetic: true,
          disclaimer: DISCLAIMER,
          lead: result.lead,
        }), origin);
      }

      return finish(json(404, { ok: false, error: "Route not found." }), origin);
    } catch (error) {
      if (error instanceof SyntheticDataError || error instanceof PayloadError) {
        return finish(json(error instanceof PayloadError ? error.status : 422, { ok: false, error: error.message }), origin);
      }
      const message = error instanceof Error ? error.message : "error";
      if (!options.silent) console.log(JSON.stringify({ level: "error", event: "http.failed", message }));
      return finish(json(500, { ok: false, error: "The pipeline hit an unexpected error." }), origin);
    }
  };
}

function streamPipeline(payload: unknown, env: Env, store: LeadStore, options: HandlerOptions, header: string | null): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        const result = await runPipeline(payload, buildDeps(env, store, options, header, (event: PipelineEvent) => {
          send(event.type === "stage" ? "stage" : event.type, event);
        }));
        send("result", { ok: true, duplicate: result.duplicate, lead: result.lead, disclaimer: DISCLAIMER });
        send("done", { ok: true });
      } catch (error) {
        const message = error instanceof SyntheticDataError || error instanceof PayloadError
          ? error.message
          : "The pipeline hit an unexpected error.";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

function buildDeps(
  env: Env,
  store: LeadStore,
  options: HandlerOptions,
  header: string | null,
  onEvent?: (event: PipelineEvent) => void,
): PipelineDeps {
  const base = pipelineDepsFromEnv(env, store, options.deps);
  const logger = options.deps?.logger ?? createLogger(options.silent ? undefined : consoleSink);
  return {
    ...base,
    ...options.deps,
    store,
    logger,
    paceMs: options.paceMs ?? options.deps?.paceMs ?? base.paceMs,
    idempotencyHeader: header,
    onEvent,
    requireSynthetic: true,
  };
}

function preflight(payload: unknown): void {
  assertSyntheticVisitor(normalizeVisitor(payload));
}

function demoToWebhook(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const pages = asPages(record.pages);
  const first = pages[0];
  return {
    "First Name": record.firstName,
    "Last Name": record.lastName,
    "Business Email": record.email,
    Title: record.title,
    "Company Name": record.company,
    Website: record.domain,
    Industry: record.industry,
    "Employee Count": record.employeeCount,
    "Captured URL": first ? `https://acme-loyalty.example${normalizePath(first)}` : undefined,
    pages,
    "Seen At": typeof record.seenAt === "string" ? record.seenAt : undefined,
    Referrer: "https://acme-loyalty.example/campaigns/spring-demo",
    Tags: "synthetic-demo",
  };
}

function asPages(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(",").map((part) => part.trim()).filter(Boolean);
  return [];
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

async function readJson(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    throw new PayloadError(415, "Send Content-Type: application/json.");
  }
  const text = await request.text();
  if (text.length > 64_000) throw new PayloadError(413, "Payload is too large for this demo.");
  if (!text.trim()) throw new PayloadError(400, "Send a JSON body.");
  try {
    return JSON.parse(text);
  } catch {
    throw new PayloadError(400, "Send a JSON body.");
  }
}

class PayloadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "PayloadError";
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function limited(hits: number[], limit: number, windowMs: number): boolean {
  const now = Date.now();
  while (hits.length && now - hits[0]! > windowMs) hits.shift();
  if (hits.length >= limit) return true;
  hits.push(now);
  return false;
}

function finish(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin ?? "*");
  headers.set("access-control-allow-headers", "content-type, idempotency-key, accept");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("x-synthetic-demo", "true");
  headers.set("vary", "origin");
  return new Response(response.body, { status: response.status, headers });
}
