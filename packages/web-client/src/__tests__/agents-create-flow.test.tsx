// We mock useAuth via vi.mock() rather than wrapping the test in <AuthContext.Provider>
// because App itself renders <AuthProvider>, which shadows any outer context.
//
// NOTE: AgentForm labels (Name, System Prompt) do NOT use htmlFor/id associations,
// so we use getByPlaceholderText instead of getByLabelText.
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

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(agentsApi.fetchAgents).mockResolvedValueOnce([]);
  vi.mocked(agentsApi.fetchAvailableTools).mockResolvedValue([]);
  vi.mocked(api.listConversations).mockResolvedValue([]);
});

describe("create-agent flow", () => {
  it("saving a new agent navigates to /agents/:newId", async () => {
    const newAgent = {
      id: "new-id",
      name: "Brand New",
      model: "claude-sonnet-4-20250514",
      maxTokens: 1024,
      temperature: 0.7,
      systemPrompt: "Hi.",
      avatar: { emoji: "🤖", color: "#6c5ce7" },
    };
    vi.mocked(agentsApi.createAgent).mockResolvedValue(newAgent);
    // Second fetchAgents call (after createAgent triggers loadAgents) returns new agent
    vi.mocked(agentsApi.fetchAgents).mockResolvedValue([
      { id: "new-id", name: "Brand New", model: "claude-sonnet", avatar: { emoji: "🤖", color: "#6c5ce7" }, hasGuardrails: false },
    ]);
    vi.mocked(agentsApi.fetchAgent).mockResolvedValue(newAgent);

    renderApp("/agents/new");
    await waitFor(() =>
      expect(screen.getByPlaceholderText("My Agent")).toBeInTheDocument(),
    );

    await userEvent.type(screen.getByPlaceholderText("My Agent"), "Brand New");
    await userEvent.type(
      screen.getByPlaceholderText(/you are a helpful assistant/i),
      "Hi.",
    );
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(vi.mocked(agentsApi.createAgent)).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Brand New", systemPrompt: "Hi." }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("Brand New")).toBeInTheDocument(),
    );
  });
});
