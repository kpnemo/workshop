export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  groupIds: string[];
}
export interface Group { id: string; name: string; createdAt: string; }
export interface ProfileWithKeys { id: string; name: string; createdAt: string; privilegeKeys: string[]; }
export interface PrivilegeEntry { key: string; label: string; description: string; profileCount: number; }
export interface Me { user: { id: string; email: string }; privileges: string[]; }
export interface LoginResponse { token: string; user: { id: string; email: string }; privileges: string[]; }
