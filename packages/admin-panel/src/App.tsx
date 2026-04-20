import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.js";
import { useAuth } from "./hooks/use-auth.js";
import LoginPage from "./pages/LoginPage.js";
import AppShell from "./components/AppShell.js";
import UsersPage from "./pages/UsersPage.js";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          {/* Other pages mounted in later tasks */}
          <Route path="*" element={<div className="text-muted">Not found.</div>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
