// packages/admin-panel/src/contexts/AuthContext.tsx
import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthToken, getAuthToken } from "../lib/api.js";
import type { Me, LoginResponse } from "../types.js";

export interface AuthValue {
  user: { id: string; email: string } | null;
  privileges: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPrivilege: (key: string) => boolean;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(getAuthToken()));

  useEffect(() => {
    if (!getAuthToken()) return;
    api.get<Me>("/admin/me")
      .then((me) => { setUser(me.user); setPrivileges(me.privileges); })
      .catch(() => { setAuthToken(null); setUser(null); setPrivileges([]); })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user, privileges, loading,
    hasPrivilege: (k) => privileges.includes(k),
    login: async (email, password) => {
      const res = await api.post<LoginResponse>("/admin/login", { email, password });
      setAuthToken(res.token);
      setUser(res.user);
      setPrivileges(res.privileges);
    },
    logout: () => { setAuthToken(null); setUser(null); setPrivileges([]); },
  }), [user, privileges, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
