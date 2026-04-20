// packages/admin-panel/src/__tests__/ProfilesPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import ProfilesPage from "../pages/ProfilesPage.js";
import { setAuthToken } from "../lib/api.js";

describe("ProfilesPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders profiles and their privilege keys", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.endsWith("/admin/me")) return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: ["manage:profiles"] }), { status: 200 });
      if (u.endsWith("/admin/profiles")) return new Response(JSON.stringify([
        { id: "p1", name: "superadmin", createdAt: "x", privilegeKeys: ["manage:users", "manage:groups", "manage:profiles"] },
      ]), { status: 200 });
      if (u.endsWith("/admin/privileges")) return new Response(JSON.stringify([
        { key: "manage:users", label: "Manage users", description: "...", profileCount: 1 },
        { key: "manage:groups", label: "Manage groups", description: "...", profileCount: 1 },
        { key: "manage:profiles", label: "Manage profiles", description: "...", profileCount: 1 },
      ]), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    setAuthToken("tok");
    render(<MemoryRouter><AuthProvider><ProfilesPage /></AuthProvider></MemoryRouter>);
    await screen.findByText("superadmin");
    await waitFor(() => expect(screen.getByText("manage:users")).toBeInTheDocument());
  });
});
