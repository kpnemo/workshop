// packages/admin-panel/src/pages/ProfilesPage.tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import type { ProfileWithKeys, PrivilegeEntry } from "../types.js";
import DataTable from "../components/DataTable.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import FormField from "../components/FormField.js";
import PrivilegeBadge from "../components/PrivilegeBadge.js";
import { useAuth } from "../hooks/use-auth.js";

export default function ProfilesPage() {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege("manage:profiles");
  const [profiles, setProfiles] = useState<ProfileWithKeys[]>([]);
  const [catalog, setCatalog] = useState<PrivilegeEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [fieldErr, setFieldErr] = useState<{ name?: string }>({});
  const [editing, setEditing] = useState<ProfileWithKeys | null>(null);
  const [editName, setEditName] = useState("");
  const [editKeys, setEditKeys] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<ProfileWithKeys | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [p, c] = await Promise.all([
      api.get<ProfileWithKeys[]>("/admin/profiles"),
      api.get<PrivilegeEntry[]>("/admin/privileges"),
    ]);
    setProfiles(p); setCatalog(c);
  }
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setFieldErr({});
    try {
      await api.post("/admin/profiles", { name: newName });
      setCreating(false); setNewName("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldErr({ [err.field]: err.message });
      else setError(String(err));
    }
  }

  async function onSaveEdit() {
    if (!editing) return;
    try {
      if (editName !== editing.name) await api.patch(`/admin/profiles/${editing.id}`, { name: editName });
      await api.put(`/admin/profiles/${editing.id}/privileges`, { keys: editKeys });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try { await api.del(`/admin/profiles/${confirmDelete.id}`); setConfirmDelete(null); await refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : String(err)); setConfirmDelete(null); }
  }

  function togglePriv(k: string) {
    setEditKeys((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Profiles</h1>
          <p className="text-sm text-muted">{profiles.length} profile{profiles.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={!canManage} onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
          + New profile
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}

      <DataTable<ProfileWithKeys>
        rows={profiles}
        columns={[
          { header: "Name", cell: (p) => p.name, width: "1fr" },
          { header: "Privileges", cell: (p) => (
              <div className="flex flex-wrap gap-1">
                {p.privilegeKeys.map((k) => <PrivilegeBadge key={k} k={k} />)}
                {p.privilegeKeys.length === 0 && <span className="text-muted text-xs">—</span>}
              </div>
          ), width: "2fr" },
          { header: "", cell: (p) => (
            <div className="flex gap-2 justify-end text-xs">
              <button disabled={!canManage} onClick={() => { setEditing(p); setEditName(p.name); setEditKeys(p.privilegeKeys); }} className="text-primary hover:underline disabled:opacity-50">Edit</button>
              <button disabled={!canManage} onClick={() => setConfirmDelete(p)} className="text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          ), width: "150px" },
        ]}
      />

      {creating && (
        <form onSubmit={onCreate} className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">New profile</h2>
          <FormField label="Name" error={fieldErr.name}>
            <input required value={newName} onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <div className="bg-surface border border-border rounded-lg p-4 space-y-4 max-w-lg">
          <h2 className="font-semibold text-foreground">Edit {editing.name}</h2>
          <FormField label="Name">
            <input value={editName} onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-background border border-border rounded px-3 py-2 text-foreground" />
          </FormField>
          <div>
            <div className="text-sm text-muted mb-2">Privileges</div>
            <div className="space-y-1 border border-border rounded p-2 bg-background">
              {catalog.map((entry) => (
                <label key={entry.key} className="flex items-start gap-2 text-sm cursor-pointer px-1 py-1 rounded hover:bg-surface">
                  <input type="checkbox" checked={editKeys.includes(entry.key)} onChange={() => togglePriv(entry.key)} />
                  <div>
                    <div className="text-foreground"><code className="text-xs">{entry.key}</code> — {entry.label}</div>
                    <div className="text-xs text-muted">{entry.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete profile?"
        message={`Delete ${confirmDelete?.name}? Groups using this profile will lose its privileges.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        danger
      />
    </div>
  );
}
