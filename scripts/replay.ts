import { SEED_VISITORS, toWebhook } from "../src/data/visitors.js";
import { createLogger } from "../src/logger.js";
import { runPipeline } from "../src/pipeline.js";
import { LeadStore } from "../src/store.js";
import { createAdapters } from "../src/adapters/index.js";

type Row = {
  name: string;
  company: string;
  score: number;
  route: string;
  id: string;
  duplicate: boolean;
};

const urlFlag = process.argv.indexOf("--url");
const baseUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined;

async function main(): Promise<void> {
  console.log("Visitor Route replay — synthetic seed only. These scores are not a live program.");
  const first = baseUrl ? await remotePass(baseUrl, false) : await localPass();
  const second = baseUrl ? await remotePass(baseUrl, true) : await localPass(first.store);
  const qualified = first.rows.filter((row) => row.route === "MQL").length;
  print(first.rows);
  const duplicateHits = second.rows.filter((row) => row.duplicate).length;
  console.log("");
  console.log(`First pass: ${first.rows.length} visitors, ${qualified} MQL, ${first.rows.length - qualified} nurture.`);
  console.log(`Second pass: ${duplicateHits}/${second.rows.length} idempotency hits. Alerts on the first pass: ${first.alerts}.`);
  const problems: string[] = [];
  if (first.rows.length !== SEED_VISITORS.length) problems.push("expected 20 visitors");
  if (new Set(first.rows.map((row) => row.id)).size !== first.rows.length) problems.push("duplicate ids on the first pass");
  if (duplicateHits !== SEED_VISITORS.length) problems.push("a retry created another lead");
  if (first.alerts !== qualified) problems.push("alert count does not match MQL count");
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Replay held: one lead per visitor, one alert per MQL, retries collapsed.");
}

async function localPass(store = new LeadStore()): Promise<{ rows: Row[]; alerts: number; store: LeadStore }> {
  let alerts = 0;
  const rows: Row[] = [];
  for (const visitor of SEED_VISITORS) {
    const result = await runPipeline(toWebhook(visitor), {
      store,
      adapters: createAdapters({}),
      paceMs: 0,
      retry: { retries: 2, baseDelayMs: 0, factor: 2 },
      logger: createLogger(),
      requireSynthetic: true,
    });
    if (!result.duplicate && result.lead.alert.delivered) alerts += 1;
    rows.push(rowFrom(result.lead.visitor.fullName, result.lead.visitor.company, result.lead.score.total, result.lead.disposition, result.lead.id, result.duplicate));
  }
  return { rows, alerts, store };
}

async function remotePass(base: string, expectDuplicate: boolean): Promise<{ rows: Row[]; alerts: number; store: LeadStore }> {
  const endpoint = base.endsWith("/webhook/rb2b") ? base : `${base.replace(/\/$/, "")}/webhook/rb2b`;
  const rows: Row[] = [];
  let alerts = 0;
  for (const visitor of SEED_VISITORS) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toWebhook(visitor)),
    });
    if (!response.ok) throw new Error(`${visitor.email} returned ${response.status}`);
    const body = await response.json() as { duplicate: boolean; lead: { id: string; visitor: { fullName: string; company: string }; score: { total: number }; disposition: string; alert: { delivered: boolean } } };
    if (!expectDuplicate && !body.duplicate && body.lead.alert.delivered) alerts += 1;
    rows.push(rowFrom(body.lead.visitor.fullName, body.lead.visitor.company, body.lead.score.total, body.lead.disposition, body.lead.id, body.duplicate));
  }
  return { rows, alerts, store: new LeadStore() };
}

function rowFrom(name: string, company: string, score: number, disposition: string, id: string, duplicate: boolean): Row {
  return { name, company, score, route: disposition === "mql" ? "MQL" : "Nurture", id, duplicate };
}

function print(rows: Row[]): void {
  const header = `${"Visitor".padEnd(22)} ${"Company".padEnd(26)} ${"Score".padStart(5)}  Route`;
  console.log("");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) {
    console.log(`${row.name.padEnd(22)} ${row.company.padEnd(26)} ${String(row.score).padStart(5)}  ${row.route}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
