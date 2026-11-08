import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "html-as-text",
      enforce: "pre",
      load(id) {
        const clean = id.split("?")[0];
        if (clean.endsWith(".html")) {
          return `export default ${JSON.stringify(readFileSync(clean, "utf8"))};`;
        }
        return null;
      },
    },
  ],
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
