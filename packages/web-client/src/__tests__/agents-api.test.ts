import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAgents, fetchAgent, createAgent, updateAgent, deleteAgent } from "../lib/agents-api";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => { mockFetch.mockReset(); });

describe("fetchAgents", () => {
  it("sends GET to /api/agents and returns array", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([{ id: "test", name: "Test" }]) });
    const result = await fetchAgents();
    expect(mockFetch).toHaveBeenCalledWith("/api/agents");
    expect(result).toEqual([{ id: "test", name: "Test" }]);
  });
});

describe("fetchAgent", () => {
  it("sends GET to /api/agents/:id and returns agent", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "test", name: "Test", systemPrompt: "You are test." }) });
    const result = await fetchAgent("test");
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/test");
    expect(result.id).toBe("test");
  });

  it("throws on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Agent not found" }) });
    await expect(fetchAgent("bad")).rejects.toThrow("Agent not found");
  });
});

describe("createAgent", () => {
  it("sends POST to /api/agents and returns created agent", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "new-bot", name: "New Bot", systemPrompt: "Hello." }) });
    const result = await createAgent({ name: "New Bot", systemPrompt: "Hello." });
    expect(mockFetch).toHaveBeenCalledWith("/api/agents", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Bot", systemPrompt: "Hello." }),
    });
    expect(result.id).toBe("new-bot");
  });

  it("throws on 409 conflict", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Agent with this name already exists" }) });
    await expect(createAgent({ name: "Dup", systemPrompt: "Dup." })).rejects.toThrow("Agent with this name already exists");
  });
});

describe("updateAgent", () => {
  it("sends PUT to /api/agents/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: "bot", name: "Updated" }) });
    const result = await updateAgent("bot", { name: "Updated", systemPrompt: "Updated." });
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/bot", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated", systemPrompt: "Updated." }),
    });
    expect(result.name).toBe("Updated");
  });
});

describe("deleteAgent", () => {
  it("sends DELETE to /api/agents/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await deleteAgent("bot");
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/bot", { method: "DELETE" });
  });

  it("throws on 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: "Agent not found" }) });
    await expect(deleteAgent("bad")).rejects.toThrow("Agent not found");
  });
});
