// packages/agent-service/src/services/admin-bootstrap.ts
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "./database.js";
import { PRIVILEGE_CATALOG } from "./privileges.js";

const SALT_ROUNDS = 10;
const SUPERADMIN_PROFILE_NAME = "superadmin";
const ADMINS_GROUP_NAME = "Admins";

export interface BootstrapEnv {
  email: string | undefined;
  password: string | undefined;
}

export async function ensureBootstrapAdmin(
  db: Database,
  env: BootstrapEnv,
): Promise<void> {
  const hasEmail = typeof env.email === "string" && env.email.trim().length > 0;
  const hasPassword = typeof env.password === "string" && env.password.length > 0;

  if (!hasEmail && !hasPassword) {
    if (db.listAdminUsers().length === 0) {
      console.warn("[admin-bootstrap] No ADMIN_EMAIL/ADMIN_PASSWORD set and no admin user exists; admin UI will be unreachable until one is created.");
    }
    return;
  }
  if (hasEmail !== hasPassword) {
    throw new Error("Must set both ADMIN_EMAIL and ADMIN_PASSWORD (or neither).");
  }

  const email = env.email!.trim().toLowerCase();
  const password = env.password!;

  // 1) superadmin profile
  let profile = db.listProfiles().find((p) => p.name === SUPERADMIN_PROFILE_NAME);
  if (!profile) profile = db.createProfile(uuidv4(), SUPERADMIN_PROFILE_NAME);
  db.setProfilePrivileges(profile.id, PRIVILEGE_CATALOG.map((p) => p.key));

  // 2) Admins group linked to profile
  let group = db.listGroups().find((g) => g.name === ADMINS_GROUP_NAME);
  if (!group) group = db.createGroup(uuidv4(), ADMINS_GROUP_NAME);
  const current = db.listGroupProfileIds(group.id);
  if (!current.includes(profile.id)) {
    db.setGroupProfiles(group.id, Array.from(new Set([...current, profile.id])));
  }

  // 3) admin user (create only if missing; never overwrite password)
  const existingUser = db.findUserByEmail(email);
  let userId: string;
  if (!existingUser) {
    userId = uuidv4();
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    db.createUser(userId, email, hashed);
    console.log(`[admin-bootstrap] Created admin user ${email}`);
  } else {
    userId = existingUser.id;
    console.log(`[admin-bootstrap] Admin user ${email} already exists; not modifying password`);
  }

  // 4) ensure membership
  const memberships = db.listUserGroupIds(userId);
  if (!memberships.includes(group.id)) {
    db.setUserGroups(userId, Array.from(new Set([...memberships, group.id])));
  }
}
