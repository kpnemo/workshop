import { Bot, Minus, RotateCcw, X } from "lucide-react";
import { CopilotChat } from "./copilot-chat";
import type { CopilotMessage } from "../lib/copilot-api";

interface CopilotPanelProps {
  messages: CopilotMessage[];
  isStreaming: boolean;
  isOpen: boolean;
  onSend: (text: string) => void;
  onToggle: () => void;
  onMinimize: () => void;
  onReset: () => void;
}

export function CopilotPanel({
  messages,
  isStreaming,
  isOpen,
  onSend,
  onToggle,
  onMinimize,
  onReset,
}: CopilotPanelProps) {
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-24 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg hover:bg-primary/90 transition-transform hover:scale-105"
        aria-label="Open Agent Copilot"
      >
        <Bot size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[450px] w-[350px] flex-col rounded-xl border border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-primary" />
          <span className="text-xs font-semibold">Agent Copilot</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Reset conversation"
            title="Reset"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={onMinimize}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Minimize"
            title="Minimize"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={onToggle}
            className="rounded p-1 text-muted hover:bg-surface hover:text-foreground"
            aria-label="Close"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <CopilotChat
        messages={messages}
        isStreaming={isStreaming}
        onSend={onSend}
      />
    </div>
  );
}
