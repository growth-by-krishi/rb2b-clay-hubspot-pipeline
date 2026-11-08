import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("readme", () => {
  const readme = readFileSync("README.md", "utf8");

  it("reads as a synthetic case study and points at the code", () => {
    expect(readme.toLowerCase()).toContain("personal portfolio demo");
    expect(readme.toLowerCase()).toContain("synthetic");
    expect(readme).toContain("PLACEHOLDER");
    expect(readme).toContain("marketing-portfolio");
    expect(readme.toLowerCase()).toContain("walkthrough video");
    expect(readme).toContain("src/scoring/icp.ts");
    expect(readme).toContain("src/adapters/enrichment.ts");
    expect(readme).toContain("src/adapters/crm.ts");
    expect(readme).toContain("src/adapters/slack.ts");
    expect(readme).toContain("npm run dev");
    expect(readme).toContain("npm run replay");
    expect(readme).toContain("wrangler deploy");
  });
});
