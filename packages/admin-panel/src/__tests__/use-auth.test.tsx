// packages/admin-panel/src/__tests__/use-auth.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthProvider } from "../contexts/AuthContext.js";
import { useAuth } from "../hooks/use-auth.js";
import { setAuthToken } from "../lib/api.js";

let captured: ReturnType<typeof useAuth> | null = null;
function Probe() { captured = useAuth(); return null; }

describe("useAuth", () => {
  beforeEach(() => { captured = null; setAuthToken(null); sessionStorage.clear(); });

  it("login sets token + user + privileges", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "tok", user: { id: "u1", email: "a@x" }, privileges: ["manage:users"],
    }), { status: 200 }));

    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await captured!.login("a@x", "pw12345678"); });
    expect(captured!.user?.email).toBe("a@x");
    expect(captured!.hasPrivilege("manage:users")).toBe(true);
    expect(captured!.hasPrivilege("manage:groups")).toBe(false);
  });

  it("logout clears state", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "tok", user: { id: "u1", email: "a@x" }, privileges: ["manage:users"],
    }), { status: 200 }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => { await captured!.login("a@x", "pw12345678"); });
    act(() => captured!.logout());
    expect(captured!.user).toBeNull();
    expect(captured!.privileges).toEqual([]);
  });
});
