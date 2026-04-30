import { useChat } from "../hooks/use-chat";
import { useDebug } from "../hooks/use-debug";
import { useCopilot } from "../hooks/use-copilot";
import { useAgentsContext } from "../contexts/AgentsContext";
import { ChatSidebar } from "../components/chat-sidebar";
import { ChatContainer } from "../components/chat-container";
import { CopilotPanel } from "../components/copilot-panel";

export function ChatPage() {
  const { agents, loadAgents } = useAgentsContext();
  const debug = useDebug();
  const {
    state,
    currentAgentId,
    sendMessage,
    startNewChat,
    selectConversation,
    deleteConversation,
    switchAgent,
    setSummaryEnabled,
    refreshSummary,
  } = useChat(agents[0]?.id ?? null, agents.map((a) => a.id), debug);
  const copilot = useCopilot({
    agents,
    onAgentReady: () => {
      loadAgents();
    },
  });

  return (
    <div className="flex h-full">
      <ChatSidebar
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        agents={agents}
        onSelect={selectConversation}
        onNewChat={() => startNewChat()}
        onDelete={deleteConversation}
      />
      <ChatContainer
        conversationId={state.conversationId}
        messages={state.messages}
        isStreaming={state.isStreaming}
        isConnecting={state.isConnecting}
        error={state.error}
        agents={agents}
        currentAgentId={currentAgentId}
        onAgentChange={switchAgent}
        onSend={sendMessage}
        onRetry={() => startNewChat()}
        isDebug={debug.isDebug}
        onDebugToggle={debug.toggleDebug}
        debugEvents={debug.debugEvents}
        onDebugClear={debug.clearEvents}
        summary={state.summary}
        summaryEnabled={state.summaryEnabled}
        onSummaryToggle={() => setSummaryEnabled(!state.summaryEnabled)}
        onSummaryRefresh={refreshSummary}
      />
      <CopilotPanel
        messages={copilot.messages}
        isStreaming={copilot.isStreaming}
        isOpen={copilot.isOpen}
        onSend={copilot.sendMessage}
        onToggle={copilot.toggle}
        onMinimize={copilot.minimize}
        onReset={copilot.reset}
      />
    </div>
  );
}
