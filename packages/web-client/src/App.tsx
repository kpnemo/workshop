import { useState } from "react";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { useChat } from "./hooks/use-chat";
import { useAgents } from "./hooks/use-agents";
import { Sidebar } from "./components/sidebar";
import { ChatContainer } from "./components/chat-container";
import { AgentDrawer } from "./components/agent-drawer";

function AuthenticatedApp() {
  const { agents, createAgent, updateAgent, deleteAgent, loadAgents } = useAgents();
  const {
    state,
    currentAgentId,
    sendMessage,
    startNewChat,
    selectConversation,
    deleteConversation,
    switchAgent,
  } = useChat(agents[0]?.id ?? null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
