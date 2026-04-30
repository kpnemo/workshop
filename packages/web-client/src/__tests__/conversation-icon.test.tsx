import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ConversationIcon } from "../components/conversation-icon";

const agentAvatar = { emoji: "🤖", color: "#7c5cff" };

describe("<ConversationIcon>", () => {
  it("renders the agent emoji when icon is null", () => {
    render(<ConversationIcon icon={null} agentAvatar={agentAvatar} size="sm" />);
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("renders an emoji icon when prefix is emoji:", () => {
    render(<ConversationIcon icon="emoji:🔢" agentAvatar={agentAvatar} size="sm" />);
    expect(screen.getByText("🔢")).toBeInTheDocument();
  });

  it("falls back to agent emoji when lucide name is unknown", () => {
    render(
      <ConversationIcon
        icon="lucide:not-a-real-icon-xyz"
        agentAvatar={agentAvatar}
        size="sm"
      />,
    );
    expect(screen.getByText("🤖")).toBeInTheDocument();
  });

  it("renders a known lucide icon", async () => {
    render(<ConversationIcon icon="lucide:plane" agentAvatar={agentAvatar} size="sm" />);
    // The component lazy-loads lucide icons; first render shows the agent emoji as fallback.
    // Wait for the lucide SVG to mount.
    await waitFor(() => {
      const svg = document.querySelector("svg.lucide-plane, svg.lucide.lucide-plane, svg[class*='plane']");
      expect(svg).not.toBeNull();
    });
  });

  it("renders inside a colored circle using agentAvatar.color", () => {
    const { container } = render(
      <ConversationIcon icon="emoji:🐛" agentAvatar={agentAvatar} size="sm" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.backgroundColor).toMatch(/#7c5cff|rgb\(124,\s*92,\s*255\)/);
  });
});
