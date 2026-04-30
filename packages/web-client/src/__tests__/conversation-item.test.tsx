import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConversationItem } from "../components/conversation-item";
import type { AgentSummary, ConversationSummary } from "../types";

const agents: AgentSummary[] = [
  {
    id: "support-bot",
    name: "Support Bot",
    model: "claude-opus-4-5",
    avatar: { emoji: "🤖", color: "#7c5cff" },
    hasGuardrails: false,
  },
];

const baseConversation: ConversationSummary = {
  id: "c1",
  agentId: "support-bot",
  title: "Counting One Through Five",
  updatedAt: new Date().toISOString(),
  messageCount: 4,
  summaryEnabled: false,
  icon: null,
};

describe("<ConversationItem>", () => {
  it("renders the agent emoji when icon is null", () => {
    render(
      <ConversationItem
        conversation={baseConversation}
        agents={agents}
        isActive={false}
        onClick={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("renders the content emoji when icon is set", () => {
    render(
      <ConversationItem
        conversation={{ ...baseConversation, icon: "emoji:🔢" }}
        agents={agents}
        isActive={false}
        onClick={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText("🔢")).toBeInTheDocument();
  });
});
