// packages/admin-panel/src/__tests__/UsersPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import UsersPage from "../pages/UsersPage.js";
import { setAuthToken } from "../lib/api.js";

async function renderWithAdmin() {
  const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (url: string | URL | Request, init) => {
    if (url.toString().endsWith("/admin/me")) {
      return new Response(JSON.stringify({ user: { id: "u1", email: "a@x" }, privileges: ["manage:users"] }), { status: 200 });
    }
    if (url.toString().endsWith("/admin/users") && (!init || init.method === "GET" || init.method === undefined)) {
      return new Response(JSON.stringify([
        { id: "u1", email: "a@x", createdAt: "2026-04-20", groupIds: ["g1"] },
      ]), { status: 200 });
    }
    if (url.toString().endsWith("/admin/groups")) {
      return new Response(JSON.stringify([{ id: "g1", name: "Admins", createdAt: "x" }]), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
  setAuthToken("tok");
  const ret = render(
    <MemoryRouter><AuthProvider><UsersPage /></AuthProvider></MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByText("a@x")).toBeInTheDocument());
  return { fetchMock, ...ret };
}

describe("UsersPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("renders user rows", async () => { await renderWithAdmin(); });

  it("shows inline field error on 409 duplicate email", async () => {
    const { fetchMock } = await renderWithAdmin();
    fetchMock.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: "Email already registered", field: "email" }), { status: 409 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));
    await screen.findByText(/already registered/i);
  });
});
