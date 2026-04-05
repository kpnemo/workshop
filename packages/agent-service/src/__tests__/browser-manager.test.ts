import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so mock objects are available inside vi.mock factory
const { mockPage, mockContext, mockBrowser } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn(),
    content: vi.fn().mockResolvedValue("<html><body>Hello</body></html>"),
    close: vi.fn(),
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn(),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn(),
    isConnected: vi.fn().mockReturnValue(true),
  };

  return { mockPage, mockContext, mockBrowser };
});

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

import { BrowserManager } from "../services/tools/browser-manager.js";

describe("BrowserManager", () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await manager.close();
  });

  it("does not launch browser until first withPage call", async () => {
    const { chromium } = await import("playwright");
    expect(chromium.launch).not.toHaveBeenCalled();

    await manager.withPage(async () => "test");

    expect(chromium.launch).toHaveBeenCalledOnce();
  });

  it("creates and closes context for each withPage call", async () => {
    await manager.withPage(async (page) => {
      expect(page).toBe(mockPage);
      return "result";
    });

    expect(mockBrowser.newContext).toHaveBeenCalledOnce();
    expect(mockContext.close).toHaveBeenCalledOnce();
  });

  it("returns the callback result", async () => {
    const result = await manager.withPage(async () => "hello");
    expect(result).toBe("hello");
  });

  it("closes context even if callback throws", async () => {
    await expect(
      manager.withPage(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(mockContext.close).toHaveBeenCalledOnce();
  });

  it("reuses browser across multiple withPage calls", async () => {
    const { chromium } = await import("playwright");

    await manager.withPage(async () => "first");
    await manager.withPage(async () => "second");

    expect(chromium.launch).toHaveBeenCalledOnce();
    expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);
  });

  it("close() shuts down the browser", async () => {
    await manager.withPage(async () => "init");
    await manager.close();

    expect(mockBrowser.close).toHaveBeenCalledOnce();
  });

  it("relaunches browser if disconnected", async () => {
    const { chromium } = await import("playwright");

    await manager.withPage(async () => "init");
    mockBrowser.isConnected.mockReturnValueOnce(false);
    await manager.withPage(async () => "relaunch");

    expect(chromium.launch).toHaveBeenCalledTimes(2);
  });
});
