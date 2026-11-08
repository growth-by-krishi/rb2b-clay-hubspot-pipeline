import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { companyByDomain } from "../src/data/companies.js";
import { SEED_VISITORS } from "../src/data/visitors.js";

const root = process.cwd();
const skip = new Set(["node_modules", ".git", ".wrangler", "dist", "coverage", "package-lock.json"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return [path];
  });
}

describe("synthetic data", () => {
  it("keeps the seed fictional and aligned with the company directory", () => {
    expect(SEED_VISITORS).toHaveLength(20);
    expect(SEED_VISITORS.filter((visitor) => visitor.sample)).toHaveLength(6);
    for (const visitor of SEED_VISITORS) {
      expect(visitor.email.endsWith("@example.com")).toBe(true);
      expect(visitor.domain.endsWith(".example")).toBe(true);
      expect(companyByDomain.get(visitor.domain)?.company).toBe(visitor.company);
    }
  });

  it("does not commit real emails, tokens, or webhook secrets", () => {
    const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
    const tokenMarkers = ["sk_" + "live", "sk_" + "test", "xox" + "b-", "xox" + "p-", "gh" + "p_", "github_" + "pat_", "AKI" + "A"];
    const privateKey = "-----BEGIN " + "PRIVATE KEY-----";
    const allowedSlack = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXX";
    const offenders: string[] = [];
    for (const path of files(root)) {
      if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".lock")) continue;
      let text = "";
      try {
        text = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      if (text.includes("\u0000")) continue;
      const found = text.match(email) ?? [];
      for (const address of found) {
        const domain = address.split("@")[1]?.toLowerCase() ?? "";
        const allowed = domain === "example.com" || domain.endsWith(".example");
        if (!allowed) offenders.push(`${relative(root, path)}: ${address}`);
      }
      const slackHits = text.match(/https:\/\/hooks\.slack\.com\/services\/\S+/g) ?? [];
      for (const hit of slackHits) {
        if (!hit.startsWith(allowedSlack)) offenders.push(`${relative(root, path)}: ${hit}`);
      }
      for (const marker of tokenMarkers) {
        if (text.includes(marker)) offenders.push(`${relative(root, path)} contains a token marker`);
      }
      if (text.includes(privateKey)) offenders.push(`${relative(root, path)} contains a private key`);
      if (/Bearer\s+[A-Za-z0-9]{20,}/.test(text)) offenders.push(`${relative(root, path)} contains a raw bearer token`);
    }
    expect(offenders).toEqual([]);
  });
});
