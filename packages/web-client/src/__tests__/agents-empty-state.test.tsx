// We mock useAuth via vi.mock() rather than wrapping the test in <AuthContext.Provider>
// because App itself renders <AuthProvider>, which shadows any outer context.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import * as agentsApi from "../lib/agents-api";
import * as api from "../lib/api";

vi.mock("../lib/agents-api");
vi.mock("../lib/api");
vi.mock("../contexts/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../contexts/AuthContext")>();
  return {
    ...actual,
    useAuth: () => ({
      user: { id: "u1", email: "test@example.com" },
      isAuthenticated: true,
      loading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValue([]);
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
});

describe("agents empty state", () => {
  it("renders the empty-state pane when there are zero agents", async () => {
    renderApp("/agents");
    await waitFor(() => expect(screen.getByText(/no agents yet/i)).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /new agent/i })).toHaveAttribute("href", "/agents/new");
  });
});
