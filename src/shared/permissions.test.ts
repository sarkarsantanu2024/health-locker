import { describe, expect, it } from "vitest";

import { ROLES, type Role } from "@/shared/enums";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  type PermissionKey,
} from "@/shared/permissions";

describe("permission catalogue", () => {
  it("covers every role", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role], `${role} has no entry`).toBeDefined();
    }
  });

  it("grants only permissions that exist in the catalogue", () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSION_KEYS, `${role} grants unknown "${permission}"`).toContain(permission);
      }
    }
  });

  it("never grants the same permission twice to a role", () => {
    for (const role of ROLES) {
      const granted = ROLE_PERMISSIONS[role];
      expect(new Set(granted).size, `${role} has duplicate grants`).toBe(granted.length);
    }
  });

  it("gives every permission a group and description", () => {
    for (const [key, meta] of Object.entries(PERMISSIONS)) {
      expect(meta.group, `${key} has no group`).toBeTruthy();
      expect(meta.description, `${key} has no description`).toBeTruthy();
    }
  });
});

describe("deny-by-default", () => {
  const forbidden: Array<[Role, PermissionKey]> = [
    // A patient must never reach admin or provider capability.
    ["PATIENT", "user:create"],
    ["PATIENT", "payment:verify"],
    ["PATIENT", "org:manage"],
    ["PATIENT", "audit:read"],
    ["PATIENT", "prescription:create"],
    ["PATIENT", "inventory:manage"],
    ["PATIENT", "access-request:review"],
    // Provider staff are not their own admin.
    ["CLINIC_STAFF", "user:create"],
    ["CLINIC_STAFF", "payment:verify"],
    ["CLINIC_STAFF", "merchant-profile:manage"],
    ["PHARMACY_STAFF", "user:create"],
    // Only a pharmacy verifies a prescription before dispensing.
    ["CLINIC_STAFF", "prescription:verify"],
    // Plans are a platform-level concern.
    ["CLINIC_ADMIN", "plan:manage"],
    ["PLATFORM_ADMIN", "plan:manage"],
    // A clinic does not sign off lab results.
    ["CLINIC_ADMIN", "report:verify"],
  ];

  it.each(forbidden)("%s cannot %s", (role, permission) => {
    expect(roleHasPermission(role, permission)).toBe(false);
  });
});

describe("role capabilities", () => {
  const allowed: Array<[Role, PermissionKey]> = [
    ["PATIENT", "document:upload"],
    ["PATIENT", "payment:submit"],
    ["PATIENT", "emergency-card:manage"],
    ["CLINIC_STAFF", "prescription:create"],
    ["CLINIC_ADMIN", "payment:verify"],
    ["HOSPITAL_STAFF", "admission:manage"],
    ["DIAGNOSTIC_STAFF", "report:upload"],
    ["DIAGNOSTIC_ADMIN", "report:verify"],
    ["PHARMACY_STAFF", "prescription:verify"],
    ["PHARMACY_STAFF", "inventory:manage"],
    ["PLATFORM_ADMIN", "access-request:review"],
  ];

  it.each(allowed)("%s can %s", (role, permission) => {
    expect(roleHasPermission(role, permission)).toBe(true);
  });

  it("gives SUPER_ADMIN everything", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(PERMISSION_KEYS.length);
  });

  it("gives a family member no more than a patient", () => {
    const patient = new Set(ROLE_PERMISSIONS.PATIENT);
    for (const permission of ROLE_PERMISSIONS.FAMILY_MEMBER) {
      expect(patient.has(permission), `FAMILY_MEMBER exceeds PATIENT via ${permission}`).toBe(true);
    }
  });

  it("makes every org admin a superset of its staff role", () => {
    const pairs: Array<[Role, Role]> = [
      ["CLINIC_STAFF", "CLINIC_ADMIN"],
      ["HOSPITAL_STAFF", "HOSPITAL_ADMIN"],
      ["DIAGNOSTIC_STAFF", "DIAGNOSTIC_ADMIN"],
      ["PHARMACY_STAFF", "PHARMACY_ADMIN"],
    ];

    for (const [staff, admin] of pairs) {
      const adminSet = new Set(ROLE_PERMISSIONS[admin]);
      for (const permission of ROLE_PERMISSIONS[staff]) {
        expect(adminSet.has(permission), `${admin} is missing ${permission}`).toBe(true);
      }
    }
  });
});
