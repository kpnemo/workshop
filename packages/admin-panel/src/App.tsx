// packages/admin-panel/src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.js";
import { useAuth } from "./hooks/use-auth.js";
import LoginPage from "./pages/LoginPage.js";

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
        <Route path="/*" element={<RequireAuth><div className="p-8">Authenticated shell (wired in Task 17).</div></RequireAuth>} />
      </Routes>
    </AuthProvider>
  );
}
