// We mock useAuth via vi.mock() rather than wrapping the test in <AuthContext.Provider>
// because App itself renders <AuthProvider>, which shadows any outer context.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const A = { id: "a", name: "A", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false };
const B = { id: "b", name: "B", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#00b894" }, hasGuardrails: false };
const C = { id: "c", name: "C", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#fd79a8" }, hasGuardrails: false };

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
  vi.mocked(agentsApi.fetchAgent).mockImplementation(async (id) => ({
    ...({ a: A, b: B, c: C } as Record<string, typeof A>)[id],
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: `You are ${id}.`,
  }));
});

describe("delete-agent flow", () => {
  it("deleting middle agent navigates to the agent now at the same index", async () => {
    vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([A, B, C]);
    vi.mocked(agentsApi.deleteAgent).mockResolvedValue(undefined);
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([A, C]);

    renderApp("/agents/b");
    await waitFor(() => expect(screen.getByDisplayValue("B")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^delete [a-z]/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    // Index of B was 1 in pre-delete list. Post-delete [A, C], same index = C.
    await waitFor(() => expect(screen.getByDisplayValue("C")).toBeInTheDocument());
  });

  it("deleting last agent in the list navigates to the new last", async () => {
    vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([A, B, C]);
    vi.mocked(agentsApi.deleteAgent).mockResolvedValue(undefined);
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([A, B]);

    renderApp("/agents/c");
    await waitFor(() => expect(screen.getByDisplayValue("C")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^delete [a-z]/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.getByDisplayValue("B")).toBeInTheDocument());
  });

  it("deleting the only remaining agent lands on the empty state", async () => {
    vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([A]);
    vi.mocked(agentsApi.deleteAgent).mockResolvedValue(undefined);
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([]);

    renderApp("/agents/a");
    await waitFor(() => expect(screen.getByDisplayValue("A")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^delete [a-z]/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(screen.getAllByText(/no agents yet/i).length).toBeGreaterThan(0));
  });
});
