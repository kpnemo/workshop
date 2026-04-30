import { Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { AgentsProvider } from "./contexts/AgentsContext";
import { AuthPage } from "./components/AuthPage";
import { ChatPage } from "./pages/chat-page";
import { AgentsPage } from "./pages/agents-page";
import { AgentsIndex } from "./pages/agents-index";
import { AgentEditor } from "./pages/agent-editor";

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex h-full items-center justify-center"><p className="text-muted">Loading...</p></div>;
  if (!isAuthenticated) return <AuthPage />;
  return (
    <AgentsProvider>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/agents" element={<AgentsPage />}>
          <Route index element={<AgentsIndex />} />
          <Route path="new" element={<AgentEditor />} />
          <Route path=":id" element={<AgentEditor />} />
          <Route path="*" element={<AgentsIndex />} />
        </Route>
        <Route path="*" element={<ChatPage />} />
      </Routes>
    </AgentsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
