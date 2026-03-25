import { useChat } from "../hooks/use-chat";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";
import { Button } from "./ui/button";

export function ChatContainer() {
  const { state, sendMessage, startNewChat } = useChat();

  if (state.isConnecting) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">Connecting...</p>
      </div>
    );
  }

  if (state.error && !state.conversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-red-400">Failed to connect: {state.error}</p>
        <Button onClick={startNewChat}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm text-white">
            S
          </div>
          <div>
            <div className="text-sm font-semibold">Support Bot</div>
            <div className="text-xs text-success">Online</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={startNewChat}>
          New Chat
        </Button>
      </div>

      {/* Messages */}
      <MessageList
        messages={state.messages}
        isStreaming={state.isStreaming}
      />

      {/* Error banner */}
      {state.error && state.conversationId && (
        <div className="border-t border-red-900/50 bg-red-950/30 px-4 py-2 text-center text-sm text-red-400">
          {state.error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={sendMessage}
        disabled={state.isStreaming || state.isConnecting}
      />
    </div>
  );
}
