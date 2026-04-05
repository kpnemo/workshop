import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrowserManager } from "../services/tools/browser-manager.js";

function createMockBrowserManager(html: string): BrowserManager {
  return {
    withPage: vi.fn(async (fn) => {
      const mockPage = {
        goto: vi.fn(),
        content: vi.fn().mockResolvedValue(html),
        innerText: vi.fn().mockResolvedValue("fallback text"),
      };
      return fn(mockPage as any);
    }),
    close: vi.fn(),
  } as unknown as BrowserManager;
}

import { createBrowseUrlTool } from "../services/tools/browse-url.js";

describe("browse_url tool", () => {
  it("has correct name and schema", () => {
    const manager = createMockBrowserManager("");
    const tool = createBrowseUrlTool(manager);

    expect(tool.name).toBe("browse_url");
    expect(tool.definition.name).toBe("browse_url");
    expect(tool.definition.input_schema.required).toEqual(["url"]);
  });

  it("extracts readable content from HTML", async () => {
    const html = `
      <html><head><title>Test Page</title></head>
      <body>
        <nav>Navigation links</nav>
        <article>
          <h1>Main Article</h1>
          <p>This is the main content of the page with enough text to be considered an article by Readability. It needs to be reasonably long to pass the content scoring algorithm that Readability uses internally.</p>
          <p>Here is another paragraph with more content to ensure the article is detected properly by the extraction algorithm.</p>
        </article>
        <footer>Footer stuff</footer>
      </body></html>
    `;
    const manager = createMockBrowserManager(html);
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({ url: "https://example.com" });

    expect(result).toContain("Main Article");
    expect(result).toContain("main content");
    expect(typeof result).toBe("string");
  });

  it("falls back to innerText when Readability fails", async () => {
    const html = "<html><body><p>Short</p></body></html>";
    const manager = createMockBrowserManager(html);
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({ url: "https://example.com" });

    expect(result).toContain("fallback text");
  });

  it("truncates content exceeding 50k characters", async () => {
    const longContent = "x".repeat(60000);
    const html = `
      <html><head><title>Long Page</title></head>
      <body><article>
        <h1>Long Article</h1>
        <p>${longContent}</p>
        <p>More padding content for Readability to detect this as an article properly.</p>
      </article></body></html>
    `;
    const manager = createMockBrowserManager(html);
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({ url: "https://example.com" });

    expect(result.length).toBeLessThanOrEqual(50100); // 50k + some header
  });

  it("returns error string on navigation failure", async () => {
    const manager = {
      withPage: vi.fn(async (fn) => {
        const mockPage = {
          goto: vi.fn().mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED")),
          content: vi.fn(),
          innerText: vi.fn(),
        };
        return fn(mockPage as any);
      }),
      close: vi.fn(),
    } as unknown as BrowserManager;

    const tool = createBrowseUrlTool(manager);
    const result = await tool.execute({ url: "https://nonexistent.invalid" });

    expect(result).toContain("Error");
    expect(result).toContain("net::ERR_NAME_NOT_RESOLVED");
  });

  it("returns error string when url is missing", async () => {
    const manager = createMockBrowserManager("");
    const tool = createBrowseUrlTool(manager);

    const result = await tool.execute({});

    expect(result).toContain("Error");
    expect(result).toContain("url");
  });
});
