// packages/admin-panel/src/__tests__/PrivilegesPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import PrivilegesPage from "../pages/PrivilegesPage.js";
import { setAuthToken } from "../lib/api.js";

describe("PrivilegesPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders catalog entries with profile counts", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const u = url.toString();
      if (u.endsWith("/admin/me")) return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: [] }), { status: 200 });
      if (u.endsWith("/admin/privileges")) return new Response(JSON.stringify([
        { key: "manage:users", label: "Manage users", description: "CRUD users.", profileCount: 2 },
        { key: "manage:groups", label: "Manage groups", description: "CRUD groups.", profileCount: 1 },
      ]), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    setAuthToken("tok");
    render(<MemoryRouter><AuthProvider><PrivilegesPage /></AuthProvider></MemoryRouter>);
    await screen.findByText(/Manage users/);
    expect(screen.getByText(/2 profiles/)).toBeInTheDocument();
    expect(screen.getByText(/1 profile/)).toBeInTheDocument();
  });
});
