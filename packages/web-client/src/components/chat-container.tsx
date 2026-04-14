import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { AgentSelector } from "./agent-selector";
import { DebugToggle } from "./debug-toggle";
import { DebugPanel } from "./debug-panel";
import { SummaryPanel } from "./summary-panel";
import { SummaryToggle } from "./summary-toggle";
import { Button } from "./ui/button";
import type { Message, AgentSummary, DebugEvent, FileInfo } from "../types";

interface ChatContainerProps {
  conversationId: string | null;
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  error: string | null;
  agents: AgentSummary[];
  currentAgentId: string;
  onAgentChange: (agentId: string) => void;
  onSend: (text: string, attachment?: FileInfo) => void;
  onRetry: () => void;
  isDebug: boolean;
  onDebugToggle: () => void;
  debugEvents: DebugEvent[];
  onDebugClear: () => void;
  summary: string | null;
  summaryEnabled: boolean;
  onSummaryToggle: () => void;
  onSummaryRefresh: () => Promise<void>;
}

export function ChatContainer({
  conversationId,
  messages,
  isStreaming,
  isConnecting,
  error,
  agents,
  currentAgentId,
  onAgentChange,
  onSend,
  onRetry,
  isDebug,
  onDebugToggle,
  debugEvents,
  onDebugClear,
  summary,
  summaryEnabled,
  onSummaryToggle,
  onSummaryRefresh,
}: ChatContainerProps) {
  if (isConnecting) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted">Connecting...</p>
      </div>
    );
  }

  if (error && !conversationId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-red-400">Failed to connect: {error}</p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  const hasMessages = messages.some((m) => m.role === "user");

  return (
    <div className="flex flex-1">
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <AgentSelector
            agents={agents}
            currentAgentId={currentAgentId}
            locked={hasMessages}
            onSelect={onAgentChange}
          />
          <div className="flex items-center gap-2">
            <SummaryToggle
              enabled={summaryEnabled}
              disabled={isStreaming}
              onToggle={onSummaryToggle}
            />
            <DebugToggle isDebug={isDebug} onToggle={onDebugToggle} />
          </div>
        </div>

        {summaryEnabled && (
          <SummaryPanel
            summary={summary}
            onRefresh={onSummaryRefresh}
            isStreaming={isStreaming}
          />
        )}

        {/* Messages */}
        <MessageList messages={messages} isStreaming={isStreaming} agents={agents} />

        {/* Error banner */}
        {error && conversationId && (
          <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Input */}
        <ChatInput onSend={onSend} disabled={isStreaming || isConnecting} />
      </div>

      {isDebug && <DebugPanel events={debugEvents} onClear={onDebugClear} />}
    </div>
  );
}
