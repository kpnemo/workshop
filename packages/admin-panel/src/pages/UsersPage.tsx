// packages/admin-panel/src/pages/UsersPage.tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import type { AdminUser, Group } from "../types.js";
import DataTable from "../components/DataTable.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import FormField from "../components/FormField.js";
import MultiSelect from "../components/MultiSelect.js";
import { useAuth } from "../hooks/use-auth.js";

export default function UsersPage() {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege("manage:users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editGroupIds, setEditGroupIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [u, g] = await Promise.all([api.get<AdminUser[]>("/admin/users"), api.get<Group[]>("/admin/groups")]);
    setUsers(u); setGroups(g);
  }
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setFieldErr({});
    try {
      await api.post("/admin/users", { email: newEmail, password: newPassword });
      setCreating(false); setNewEmail(""); setNewPassword("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldErr({ [err.field]: err.message });
      else setError(String(err));
    }
  }

  async function onSaveGroups() {
    if (!editing) return;
    try {
      await api.put(`/admin/users/${editing.id}/groups`, { groupIds: editGroupIds });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try {
      await api.del(`/admin/users/${confirmDelete.id}`);
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Users</h1>
          <p className="text-sm text-muted">{users.length} user{users.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={!canManage} onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
          + New user
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}

      <DataTable<AdminUser>
        rows={users}
        columns={[
          { header: "Email", cell: (u) => u.email, width: "1.4fr" },
          { header: "Groups", cell: (u) => (
              <div className="flex flex-wrap gap-1">
                {u.groupIds.map((gid) => {
                  const g = groups.find((x) => x.id === gid);
                  return g ? <span key={gid} className="text-[10px] px-2 py-0.5 rounded bg-primary/20 text-[#a29bfe]">{g.name}</span> : null;
                })}
                {u.groupIds.length === 0 && <span className="text-muted text-xs">—</span>}
              </div>
          ), width: "2fr" },
          { header: "", cell: (u) => (
            <div className="flex gap-2 justify-end text-xs">
              <button disabled={!canManage} onClick={() => { setEditing(u); setEditGroupIds(u.groupIds); }} className="text-primary hover:underline disabled:opacity-50">Groups</button>
              <button disabled={!canManage} onClick={() => setConfirmDelete(u)} className="text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          ), width: "150px" },
        ]}
      />

      {creating && (
        <form onSubmit={onCreate} className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">New user</h2>
          <FormField label="Email" error={fieldErr.email}>
            <input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <FormField label="Password" error={fieldErr.password}>
            <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">Groups for {editing.email}</h2>
          <MultiSelect label="Groups" options={groups} selectedIds={editGroupIds} onChange={setEditGroupIds} />
          <div className="flex gap-2">
            <button onClick={onSaveGroups} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete user?"
        message={`This will permanently delete ${confirmDelete?.email} and their conversations.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        danger
      />
    </div>
  );
}
