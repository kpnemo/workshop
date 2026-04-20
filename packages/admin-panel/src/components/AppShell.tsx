import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/use-auth.js";
import { cn } from "../lib/cn.js";

const NAV: { to: string; label: string; privilege?: string }[] = [
  { to: "/users",      label: "Users",      privilege: "manage:users" },
  { to: "/groups",     label: "Groups",     privilege: "manage:groups" },
  { to: "/profiles",   label: "Profiles",   privilege: "manage:profiles" },
  { to: "/privileges", label: "Privileges" },
];

export default function AppShell() {
  const { user, logout, hasPrivilege } = useAuth();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="w-56 bg-surface border-r border-border px-3 py-4 flex flex-col">
        <div className="text-primary font-bold text-lg mb-6 px-2">⌘ Admin</div>
        <nav className="flex-1 space-y-1">
          {NAV.filter((n) => !n.privilege || hasPrivilege(n.privilege)).map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => cn(
                "block px-3 py-2 rounded text-sm",
                isActive ? "bg-primary/15 text-foreground" : "text-muted hover:text-foreground",
              )}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 border-t border-border pt-4 text-xs">
          <div className="text-muted truncate" title={user?.email}>{user?.email}</div>
          <button className="mt-2 text-primary hover:underline" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="flex-1 p-6"><Outlet /></main>
    </div>
  );
}
