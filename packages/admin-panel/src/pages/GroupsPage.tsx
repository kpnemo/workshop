// packages/admin-panel/src/pages/GroupsPage.tsx
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import type { Group, AdminUser, ProfileWithKeys } from "../types.js";
import DataTable from "../components/DataTable.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import FormField from "../components/FormField.js";
import MultiSelect from "../components/MultiSelect.js";
import { useAuth } from "../hooks/use-auth.js";

export default function GroupsPage() {
  const { hasPrivilege } = useAuth();
  const canManage = hasPrivilege("manage:groups");
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithKeys[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [fieldErr, setFieldErr] = useState<{ name?: string }>({});
  const [editing, setEditing] = useState<Group | null>(null);
  const [editName, setEditName] = useState("");
  const [editMembers, setEditMembers] = useState<string[]>([]);
  const [editProfileIds, setEditProfileIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [g, u, p] = await Promise.all([
      api.get<Group[]>("/admin/groups"),
      api.get<AdminUser[]>("/admin/users").catch(() => []),
      api.get<ProfileWithKeys[]>("/admin/profiles").catch(() => []),
    ]);
    setGroups(g); setUsers(u); setProfiles(p);
  }
  useEffect(() => { refresh().catch((e) => setError(String(e))); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setFieldErr({});
    try {
      await api.post("/admin/groups", { name: newName });
      setCreating(false); setNewName("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.field) setFieldErr({ [err.field]: err.message });
      else setError(String(err));
    }
  }

  function openEdit(g: Group) {
    setEditing(g);
    setEditName(g.name);
    setEditMembers(g.memberIds ?? users.filter((u) => u.groupIds.includes(g.id)).map((u) => u.id));
    setEditProfileIds(g.profileIds ?? []);
  }

  async function onSaveEdit() {
    if (!editing) return;
    try {
      if (editName !== editing.name) await api.patch(`/admin/groups/${editing.id}`, { name: editName });
      await api.put(`/admin/groups/${editing.id}/members`, { userIds: editMembers });
      await api.put(`/admin/groups/${editing.id}/profiles`, { profileIds: editProfileIds });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    try { await api.del(`/admin/groups/${confirmDelete.id}`); setConfirmDelete(null); await refresh(); }
    catch (err) { setError(err instanceof ApiError ? err.message : String(err)); setConfirmDelete(null); }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Groups</h1>
          <p className="text-sm text-muted">{groups.length} group{groups.length === 1 ? "" : "s"}</p>
        </div>
        <button disabled={!canManage} onClick={() => setCreating(true)}
          className="px-3 py-2 text-sm rounded bg-primary text-primary-foreground font-medium disabled:opacity-50">
          + New group
        </button>
      </div>

      {error && <div role="alert" className="text-sm text-red-400">{error}</div>}

      <DataTable<Group>
        rows={groups}
        columns={[
          { header: "Name", cell: (g) => g.name, width: "1.2fr" },
          { header: "Members", cell: (g) => users.filter((u) => u.groupIds.includes(g.id)).length, width: "100px" },
          { header: "", cell: (g) => (
            <div className="flex gap-2 justify-end text-xs">
              <button disabled={!canManage} onClick={() => openEdit(g)} className="text-primary hover:underline disabled:opacity-50">Edit</button>
              <button disabled={!canManage} onClick={() => setConfirmDelete(g)} className="text-red-400 hover:underline disabled:opacity-50">Delete</button>
            </div>
          ), width: "150px" },
        ]}
      />

      {creating && (
        <form onSubmit={onCreate} className="bg-surface border border-border rounded-lg p-4 space-y-3 max-w-sm">
          <h2 className="font-semibold text-foreground">New group</h2>
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
          <MultiSelect label="Members" options={users.map((u) => ({ id: u.id, name: u.email }))} selectedIds={editMembers} onChange={setEditMembers} />
          <MultiSelect label="Profiles" options={profiles} selectedIds={editProfileIds} onChange={setEditProfileIds} />
          <div className="flex gap-2">
            <button onClick={onSaveEdit} className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground">Save</button>
            <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm rounded border border-border text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete group?"
        message={`Delete ${confirmDelete?.name}? Members and profile links are removed, user accounts are kept.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        danger
      />
    </div>
  );
}
