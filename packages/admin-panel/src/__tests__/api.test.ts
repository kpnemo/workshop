// packages/admin-panel/src/__tests__/api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, ApiError, setAuthToken } from "../lib/api.js";

describe("api client", () => {
  beforeEach(() => { vi.restoreAllMocks(); setAuthToken(null); });

  it("sends Authorization header when token set", async () => {
    setAuthToken("tok");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    await api.get("/admin/me");
    const init = fetchSpy.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("throws typed ApiError with status, error, and field", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Email already registered", field: "email" }), { status: 409 }),
    );
    await expect(api.post("/admin/users", {})).rejects.toBeInstanceOf(ApiError);
    try { await api.post("/admin/users", {}); } catch (e) {
      expect((e as ApiError).status).toBe(409);
      expect((e as ApiError).field).toBe("email");
    }
  });

  it("parses JSON body on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await api.get<{ ok: boolean }>("/x");
    expect(res).toEqual({ ok: true });
  });

  it("returns null for 204", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const res = await api.del("/x");
    expect(res).toBeNull();
  });
});
