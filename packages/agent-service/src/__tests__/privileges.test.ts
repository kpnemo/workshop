import { describe, it, expect } from "vitest";
import { PRIVILEGES, PRIVILEGE_CATALOG, PRIVILEGE_KEYS } from "../services/privileges.js";

describe("privileges catalog", () => {
  it("exposes three Phase 1 keys", () => {
    expect(PRIVILEGES.MANAGE_USERS).toBe("manage:users");
    expect(PRIVILEGES.MANAGE_GROUPS).toBe("manage:groups");
    expect(PRIVILEGES.MANAGE_PROFILES).toBe("manage:profiles");
  });

  it("catalog lists each privilege with label and description", () => {
    const keys = PRIVILEGE_CATALOG.map((p) => p.key);
    expect(keys).toEqual(["manage:users", "manage:groups", "manage:profiles"]);
    for (const entry of PRIVILEGE_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("PRIVILEGE_KEYS is a Set of all catalog keys", () => {
    expect(PRIVILEGE_KEYS.has("manage:users")).toBe(true);
    expect(PRIVILEGE_KEYS.has("manage:groups")).toBe(true);
    expect(PRIVILEGE_KEYS.has("manage:profiles")).toBe(true);
    expect(PRIVILEGE_KEYS.has("manage:nope")).toBe(false);
  });
});
