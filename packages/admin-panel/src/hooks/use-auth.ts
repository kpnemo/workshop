// packages/admin-panel/src/hooks/use-auth.ts
import { useContext } from "react";
import { AuthContext } from "../contexts/AuthContext.js";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
