import { describe, expect, it } from "vitest";
import { SEED_VISITORS, toDemoBody, toWebhook } from "../src/data/visitors.js";
import { createHandler } from "../src/http.js";
import { demoPage } from "../src/demo.js";

const jane = SEED_VISITORS.find((visitor) => visitor.key === "jane-demo");
if (!jane) throw new Error("missing sample");

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://demo.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("http", () => {
  it("serves the demo page and the read endpoints", async () => {
    const handle = createHandler({ html: demoPage, silent: true, paceMs: 0 });
    const page = await handle(new Request("https://demo.example/"));
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain("Visitor");
    expect(html).toContain("synthetic data");
    expect(html).toContain("Start here");
    const health = await handle(new Request("https://demo.example/api/health"));
    expect(await health.json()).toMatchObject({ ok: true, synthetic: true });
    const samples = await handle(new Request("https://demo.example/api/samples"));
    const sampleBody = await samples.json() as { samples: unknown[] };
    expect(sampleBody.samples).toHaveLength(6);
  });

  it("accepts an RB2B-shaped webhook and a snake_case twin", async () => {
    const handle = createHandler({ silent: true, paceMs: 0 });
    const spaced = await handle(jsonRequest("/webhook/rb2b", toWebhook(jane)));
    expect(spaced.status).toBe(200);
    const first = await spaced.json() as { duplicate: boolean; lead: { id: string; score: { total: number } } };
    expect(first.duplicate).toBe(false);
    expect(first.lead.score.total).toBe(96);
    const again = await handle(jsonRequest("/webhook/rb2b", toWebhook(jane)));
    const second = await again.json() as { duplicate: boolean; lead: { id: string } };
    expect(second.duplicate).toBe(true);
    expect(second.lead.id).toBe(first.lead.id);

    const snake = await handle(jsonRequest("/webhook/rb2b", {
      first_name: "Ada",
      last_name: "Example",
      business_email: "ada.example@example.com",
      title: "Director of Growth",
      company_name: "Fieldnote Commerce",
      website: "https://fieldnote-commerce.example",
      industry: "Ecommerce",
      employee_count: 210,
      captured_url: "https://acme-loyalty.example/pricing",
      seen_at: "2026-04-16T12:00:00.000Z",
      pages: ["/pricing"],
    }));
    expect(snake.status).toBe(200);
    const snakeBody = await snake.json() as { lead: { disposition: string; visitor: { email: string } } };
    expect(snakeBody.lead.visitor.email).toBe("ada.example@example.com");
    expect(snakeBody.lead.disposition).toBe("mql");
  });

  it("streams stage events for the demo runner", async () => {
    const handle = createHandler({ silent: true, paceMs: 0 });
    const response = await handle(jsonRequest("/api/demo/run", toDemoBody(jane)));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: stage");
    expect(text).toContain("\"stage\":\"identify\"");
    expect(text).toContain("\"stage\":\"alert\"");
    expect(text).toContain("event: result");
    const leads = await handle(new Request("https://demo.example/api/leads"));
    const listed = await leads.json() as { leads: Array<{ email: string }> };
    expect(listed.leads.map((lead) => lead.email)).toContain("jane.demo@example.com");
  });

  it("rejects real-looking addresses and malformed JSON", async () => {
    const handle = createHandler({ silent: true, paceMs: 0 });
    const rejected = await handle(jsonRequest("/webhook/rb2b", {
      "Business Email": "person@" + "gmail.com",
      Website: "https://acme.com",
      "First Name": "Pat",
    }));
    expect(rejected.status).toBe(422);
    const bad = await handle(new Request("https://demo.example/webhook/rb2b", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    expect(bad.status).toBe(400);
    const missing = await handle(new Request("https://demo.example/api/leads/lead_missing"));
    expect(missing.status).toBe(404);
  });

  it("rate limits repeated posts", async () => {
    const handle = createHandler({ silent: true, paceMs: 0, rateLimit: { limit: 1, windowMs: 60_000 } });
    const ok = await handle(jsonRequest("/webhook/rb2b", toWebhook(jane)));
    expect(ok.status).toBe(200);
    const limited = await handle(jsonRequest("/webhook/rb2b", toWebhook(jane)));
    expect(limited.status).toBe(429);
  });
});
