// packages/admin-panel/src/__tests__/GroupsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import GroupsPage from "../pages/GroupsPage.js";
import { setAuthToken } from "../lib/api.js";

describe("GroupsPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders and creates a group", async () => {
    let groupsCall = 0;
    vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request, init) => {
      const u = url.toString();
      if (u.endsWith("/admin/me")) return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: ["manage:groups"] }), { status: 200 });
      if (u.endsWith("/admin/groups") && (!init || init.method === "GET" || init.method === undefined)) {
        groupsCall++;
        const data = groupsCall === 1
          ? [{ id: "g1", name: "Admins", createdAt: "x" }]
          : [{ id: "g1", name: "Admins", createdAt: "x" }, { id: "g2", name: "Editors", createdAt: "x" }];
        return new Response(JSON.stringify(data), { status: 200 });
      }
      if (u.endsWith("/admin/groups") && init?.method === "POST") {
        return new Response(JSON.stringify({ group: { id: "g2", name: "Editors", createdAt: "x" } }), { status: 201 });
      }
      if (u.endsWith("/admin/users")) return new Response("[]", { status: 200 });
      if (u.endsWith("/admin/profiles")) return new Response("[]", { status: 200 });
      return new Response("{}", { status: 200 });
    });
    setAuthToken("tok");
    render(<MemoryRouter><AuthProvider><GroupsPage /></AuthProvider></MemoryRouter>);
    await screen.findByText("Admins");
    fireEvent.click(screen.getByRole("button", { name: /new group/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Editors" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await waitFor(() => expect(screen.getByText("Editors")).toBeInTheDocument());
  });
});
