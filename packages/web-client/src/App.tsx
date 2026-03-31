import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AuthPage } from "./components/AuthPage";
import { useChat } from "./hooks/use-chat";
import { Sidebar } from "./components/sidebar";
import { ChatContainer } from "./components/chat-container";

function AuthenticatedApp() {
  const { state, sendMessage, startNewChat, selectConversation, deleteConversation } = useChat();

  return (
    <div className="flex h-full">
      <Sidebar
        conversations={state.conversations}
        activeConversationId={state.conversationId}
        onSelect={selectConversation}
        onNewChat={startNewChat}
        onDelete={deleteConversation}
      />
      <ChatContainer
        conversationId={state.conversationId}
        messages={state.messages}
        isStreaming={state.isStreaming}
        isConnecting={state.isConnecting}
        error={state.error}
        onSend={sendMessage}
        onRetry={startNewChat}
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

  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
