// packages/admin-panel/src/pages/PrivilegesPage.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import type { PrivilegeEntry } from "../types.js";

export default function PrivilegesPage() {
  const [entries, setEntries] = useState<PrivilegeEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PrivilegeEntry[]>("/admin/privileges").then(setEntries).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Privileges</h1>
        <p className="text-sm text-muted">Fixed catalog of permission keys. Assign to profiles from the Profiles page.</p>
      </div>
      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.key} className="bg-surface border border-border rounded-lg p-4 flex items-start gap-4">
            <code className="text-sm bg-background border border-border rounded px-2 py-1 text-[#a29bfe] whitespace-nowrap">{e.key}</code>
            <div className="flex-1">
              <div className="text-foreground font-medium">{e.label}</div>
              <div className="text-sm text-muted">{e.description}</div>
            </div>
            <div className="text-xs text-muted whitespace-nowrap">{e.profileCount} profile{e.profileCount === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
