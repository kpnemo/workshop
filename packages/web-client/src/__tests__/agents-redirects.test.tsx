// We mock useAuth via vi.mock() rather than wrapping the test in <AuthContext.Provider>
// because App itself renders <AuthProvider>, which shadows any outer context.
//
// NOTE: AgentForm labels (Name, System Prompt) do NOT use htmlFor/id associations,
// so we use getByDisplayValue to confirm the form is populated after navigation.
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

const FAKE_AGENTS = [
  { id: "main", name: "Main Agent", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false },
  { id: "support", name: "Support Bot", model: "claude-sonnet", avatar: { emoji: "🛟", color: "#00b894" }, hasGuardrails: false },
];

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValue(FAKE_AGENTS);
  vi.mocked(agentsApi.fetchAgent).mockImplementation(async (id) => ({
    ...FAKE_AGENTS.find((a) => a.id === id)!,
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: `You are ${id}.`,
  }));
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
});

describe("/agents redirects", () => {
  it("/agents redirects to /agents/<first-id> when there is at least one agent", async () => {
    renderApp("/agents");
    await waitFor(() =>
      expect(screen.getByDisplayValue("Main Agent")).toBeInTheDocument(),
    );
  });

  it("/agents/<unknown-id> redirects back to /agents (and then on to first agent)", async () => {
    renderApp("/agents/garbage-id");
    await waitFor(() =>
      expect(screen.getByDisplayValue("Main Agent")).toBeInTheDocument(),
    );
  });
});
