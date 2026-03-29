import { useChat } from "./hooks/use-chat";
import { Sidebar } from "./components/sidebar";
import { ChatContainer } from "./components/chat-container";

export default function App() {
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
