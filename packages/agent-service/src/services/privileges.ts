export const PRIVILEGES = {
  MANAGE_USERS: "manage:users",
  MANAGE_GROUPS: "manage:groups",
  MANAGE_PROFILES: "manage:profiles",
} as const;

export type PrivilegeKey = typeof PRIVILEGES[keyof typeof PRIVILEGES];

export interface PrivilegeCatalogEntry {
  key: PrivilegeKey;
  label: string;
  description: string;
}

export const PRIVILEGE_CATALOG: readonly PrivilegeCatalogEntry[] = [
  {
    key: PRIVILEGES.MANAGE_USERS,
    label: "Manage users",
    description: "Create, edit, and delete user accounts; set group membership.",
  },
  {
    key: PRIVILEGES.MANAGE_GROUPS,
    label: "Manage groups",
    description: "Create, rename, delete groups; assign profiles and members.",
  },
  {
    key: PRIVILEGES.MANAGE_PROFILES,
    label: "Manage profiles",
    description: "Create, rename, delete profiles; assign privileges.",
  },
] as const;

export const PRIVILEGE_KEYS: ReadonlySet<string> = new Set(
  PRIVILEGE_CATALOG.map((p) => p.key),
);

export const ADMIN_PRIVILEGE_KEYS = PRIVILEGE_KEYS;
