// We mock useAuth via vi.mock() rather than wrapping the test in <AuthContext.Provider>
// because App itself renders <AuthProvider>, which shadows any outer context. The mock
// is the only reliable way to inject test auth state into the full App tree.
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
      isAuthenticated: true,
      loading: false,
      user: { email: "test@example.com", id: "u1" },
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

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValue(FAKE_AGENTS);
  vi.mocked(agentsApi.fetchAgent).mockResolvedValue({
    ...FAKE_AGENTS[0],
    maxTokens: 1024,
    temperature: 0.7,
    systemPrompt: "You are Main.",
  });
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
  vi.mocked(api.createConversation).mockResolvedValue({ conversationId: "c1", agentId: "main", createdAt: "2026-04-30T00:00:00Z" });
});

describe("Manage Agents routing", () => {
  it("clicking 'Manage Agents' swaps sidebar contents and updates the URL", async () => {
    renderApp("/");
    await waitFor(() => expect(screen.getByText("Chats")).toBeInTheDocument());
    const button = await screen.findByRole("button", { name: /manage agents/i });
    await userEvent.click(button);
    await waitFor(() => expect(screen.getByText("Agents")).toBeInTheDocument());
    expect(screen.getByText("Main Agent")).toBeInTheDocument();
    expect(screen.getByText("Support Bot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to chats/i })).toBeInTheDocument();
  });

  it("clicking 'Back to chats' restores the conversations sidebar", async () => {
    renderApp("/agents");
    await waitFor(() => expect(screen.getByText("Agents")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /back to chats/i }));
    await waitFor(() => expect(screen.getByText("Chats")).toBeInTheDocument());
  });
});
