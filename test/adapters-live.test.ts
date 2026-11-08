import { describe, expect, it } from "vitest";
import { buildContactUpsert, executeHubSpotUpsert, industryEnum } from "../src/adapters/crm.js";
import { executeApollo, executeClearbit, executePdl } from "../src/adapters/live-enrichment.js";
import { buildSlackPayload, postSlackWebhook, SLACK_WEBHOOK_PLACEHOLDER } from "../src/adapters/slack.js";
import { createAdapters } from "../src/adapters/index.js";
import { toWebhook, SEED_VISITORS } from "../src/data/visitors.js";
import { runPipeline } from "../src/pipeline.js";
import { createDeps } from "./helpers.js";

const jane = SEED_VISITORS.find((visitor) => visitor.key === "jane-demo");
if (!jane) throw new Error("missing jane");

describe("live adapter stubs", () => {
  it("does not call the network when adapters stay on the mock", async () => {
    let called = false;
    const fetchImpl: typeof fetch = async () => {
      called = true;
      throw new Error("network should not be called");
    };
    const adapters = createAdapters({}, fetchImpl);
    const deps = createDeps();
    await runPipeline(toWebhook(jane), { ...deps, adapters });
    expect(called).toBe(false);
  });

  it("posts the HubSpot v3 upsert shape and never records the token", async () => {
    const deps = createDeps();
    const routed = await runPipeline(toWebhook(jane), deps);
    const input = {
      leadId: routed.lead.id,
      visitor: routed.lead.visitor,
      score: routed.lead.score,
      enrichment: routed.lead.enrichment,
    };
    const built = buildContactUpsert(input);
    expect(built.path).toBe("/crm/v3/objects/contacts/batch/upsert");
    expect(industryEnum("Venture Capital")).toBeNull();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/associations/")) return new Response(null, { status: 200 });
      const id = String(url).includes("companies") ? "501" : "401";
      return new Response(JSON.stringify({ status: "COMPLETE", results: [{ id }] }), { status: 200 });
    };
    const result = await executeHubSpotUpsert(input, "hubspot-demo-token", fetchImpl);
    expect(calls[0]?.url).toBe("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert");
    expect(calls[0]?.init?.headers).toMatchObject({ Authorization: "Bearer hubspot-demo-token" });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(built.body);
    expect(calls[1]?.url).toContain("/crm/v3/objects/companies/batch/upsert");
    expect(calls[2]?.url).toContain("/crm/v4/objects/contacts/401/associations/default/companies/501");
    expect(JSON.stringify(result.requests)).not.toContain("hubspot-demo-token");
    expect(result.contactId).toBe("401");
  });

  it("builds a Slack payload and posts it only through the explicit stub", async () => {
    const deps = createDeps();
    const routed = await runPipeline(toWebhook(jane), deps);
    const input = {
      leadId: routed.lead.id,
      visitor: routed.lead.visitor,
      score: routed.lead.score,
      crm: routed.lead.crm!,
    };
    const payload = buildSlackPayload(input);
    expect(payload.text).toContain("Jane Demo");
    expect(payload.blocks[0]).toMatchObject({ type: "header" });
    const calls: string[] = [];
    const result = await postSlackWebhook(input, "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX", async (url) => {
      calls.push(String(url));
      return new Response("ok", { status: 200 });
    });
    expect(calls).toHaveLength(1);
    expect(result.request?.url).toBe(SLACK_WEBHOOK_PLACEHOLDER);
    expect(result.simulated).toBe(false);
  });

  it("parses Clearbit, Apollo, and People Data Labs response shapes", async () => {
    const visitor = (await runPipeline(toWebhook(jane), createDeps())).lead.visitor;
    const clearbit = await executeClearbit(visitor, "clearbit-demo-token", async (url, init) => {
      expect(String(url)).toContain("person.clearbit.com/v2/combined/find");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer clearbit-demo-token" });
      return new Response(JSON.stringify({
        company: {
          name: "Northwind Retail",
          category: { industry: "Retail" },
          metrics: { employees: 420, estimatedAnnualRevenue: "$50M-$100M" },
          geo: { city: "Sample Harbor", state: "EX" },
        },
      }), { status: 200 });
    });
    expect(clearbit.employeeCount).toBe(420);
    const apollo = await executeApollo(visitor, "apollo-demo-token", async (_url, init) => {
      expect(init?.headers).toMatchObject({ "X-Api-Key": "apollo-demo-token" });
      const body = JSON.parse(String(init?.body));
      expect(body.reveal_personal_emails).toBe(false);
      return new Response(JSON.stringify({
        person: { email_status: "verified", organization: { industry: "retail", estimated_num_employees: 420, name: "Northwind Retail" } },
      }), { status: 200 });
    });
    expect(apollo.emailStatus).toBe("valid");
    const pdl = await executePdl(visitor, "pdl-demo-token", async (url, init) => {
      expect(String(url)).toContain("api.peopledatalabs.com/v5/person/enrich");
      expect(init?.headers).toMatchObject({ "X-Api-Key": "pdl-demo-token" });
      return new Response(JSON.stringify({ data: { job_company_industry: "retail", job_company_size: "201-500", job_company_name: "northwind retail" } }), { status: 200 });
    });
    expect(pdl.employeeRange).toBe("201-500");
  });
});
