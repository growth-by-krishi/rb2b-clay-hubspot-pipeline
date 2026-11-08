import page from "../public/index.html";

function asHtml(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "default" in value) {
    const nested = (value as { default: unknown }).default;
    if (typeof nested === "string") return nested;
  }
  throw new Error("Demo page failed to load");
}

export const demoPage = asHtml(page);
