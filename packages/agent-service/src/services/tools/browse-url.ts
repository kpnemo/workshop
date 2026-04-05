import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Tool } from "./types.js";
import type { BrowserManager } from "./browser-manager.js";

const MAX_CONTENT_LENGTH = 50000;

export function createBrowseUrlTool(browserManager: BrowserManager): Tool {
  return {
    name: "browse_url",
    definition: {
      name: "browse_url",
      description: "Fetch a web page and extract its main text content",
      input_schema: {
        type: "object" as const,
        properties: {
          url: { type: "string", description: "The URL to browse" },
        },
        required: ["url"],
      },
    },
    async execute(input: unknown): Promise<string> {
      const { url } = (input ?? {}) as { url?: string };

      if (!url || typeof url !== "string") {
        return "Error: A valid url string is required.";
      }

      try {
        return await browserManager.withPage(async (page) => {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          const html = await page.content();
          const { document } = parseHTML(html);
          const reader = new Readability(document as any);
          const article = reader.parse();

          let content: string;
          if (article && article.textContent.trim().length > 50) {
            content = `# ${article.title}\n\n${article.textContent.trim()}`;
          } else {
            const fallback = await page.innerText("body");
            content = fallback;
          }

          if (content.length > MAX_CONTENT_LENGTH) {
            content = content.slice(0, MAX_CONTENT_LENGTH) + "\n\n[Content truncated]";
          }

          return content;
        });
      } catch (err) {
        return `Error browsing ${url}: ${(err as Error).message}`;
      }
    },
  };
}
