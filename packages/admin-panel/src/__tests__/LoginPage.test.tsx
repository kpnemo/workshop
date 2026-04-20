// packages/admin-panel/src/__tests__/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext.js";
import LoginPage from "../pages/LoginPage.js";
import { setAuthToken } from "../lib/api.js";

function renderLogin() {
  return render(
    <MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => { setAuthToken(null); sessionStorage.clear(); vi.restoreAllMocks(); });

  it("logs in and shows no error on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      token: "tok", user: { id: "u1", email: "a@x" }, privileges: ["manage:users"],
    }), { status: 200 }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(sessionStorage.getItem("admin_token")).toBe("tok"));
  });

  it("shows error message on 401", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Invalid email or password" }), { status: 401 }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText(/invalid email or password/i);
  });

  it("shows not-admin message on 403", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@x" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await screen.findByText(/do not have access/i);
  });
});
