import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { useChat } from "./hooks/use-chat";
import { useAgents } from "./hooks/use-agents";
import { Sidebar } from "./components/sidebar";
import { ChatContainer } from "./components/chat-container";
import { AgentDrawer } from "./components/agent-drawer";
import { CopilotPanel } from "./components/copilot-panel";
import { useCopilot } from "./hooks/use-copilot";
import { useDebug } from "./hooks/use-debug";

function AuthenticatedApp() {
  const { agents, createAgent, updateAgent, deleteAgent, loadAgents } = useAgents();
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const copilot = useCopilot({
    agents,
    onAgentReady: () => {
      loadAgents();
      setDrawerOpen(true);
    },
  });

  return (
    <div className="flex h-full">
      <Sidebar
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        agents={agents}
        onSelect={selectConversation}
        onNewChat={() => startNewChat()}
        onDelete={deleteConversation}
        onManageAgents={() => setDrawerOpen(true)}
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
      {drawerOpen && (
        <AgentDrawer
          agents={agents}
          onClose={() => setDrawerOpen(false)}
          onCreate={createAgent}
          onUpdate={updateAgent}
          onDelete={deleteAgent}
          onAgentSaved={loadAgents}
        />
      )}
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

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <Routes>
      <Route path="*" element={<AuthenticatedApp />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
