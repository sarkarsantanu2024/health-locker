import type { Role } from "@/shared/enums";
import type { PermissionKey } from "@/shared/permissions";

/**
 * Portal navigation per role. `permission` hides a link the user cannot use —
 * presentation only. Each destination still enforces its own guard server-side.
 *
 * Later phases add their own entries here as the screens land.
 */

export interface NavItem {
  href: string;
  label: string;
  permission?: PermissionKey;
}

const PATIENT_NAV: NavItem[] = [
  { href: "/patient", label: "Overview" },
  { href: "/patient/timeline", label: "Timeline", permission: "record:read" },
  { href: "/patient/family", label: "Family", permission: "family:read" },
  { href: "/patient/billing", label: "Billing", permission: "invoice:read" },
  { href: "/account", label: "Account" },
];

function providerNav(base: string, extras: NavItem[] = []): NavItem[] {
  return [
    { href: base, label: "Dashboard" },
    { href: `${base}/patients`, label: "Patients", permission: "patient:read" },
    ...extras,
    { href: `${base}/billing`, label: "Billing", permission: "invoice:read" },
    { href: `${base}/users`, label: "Staff", permission: "user:read" },
    { href: "/account", label: "Account" },
  ];
}

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  PATIENT: PATIENT_NAV,
  FAMILY_MEMBER: PATIENT_NAV,

  CLINIC_STAFF: providerNav("/clinic", [
    { href: "/clinic/appointments", label: "Appointments", permission: "appointment:read" },
  ]),
  CLINIC_ADMIN: providerNav("/clinic", [
    { href: "/clinic/appointments", label: "Appointments", permission: "appointment:read" },
  ]),

  HOSPITAL_STAFF: providerNav("/hospital", [
    { href: "/hospital/admissions", label: "Admissions", permission: "admission:read" },
  ]),
  HOSPITAL_ADMIN: providerNav("/hospital", [
    { href: "/hospital/admissions", label: "Admissions", permission: "admission:read" },
  ]),

  DIAGNOSTIC_STAFF: providerNav("/diagnostic", [
    { href: "/diagnostic/bookings", label: "Bookings", permission: "test-booking:manage" },
    { href: "/diagnostic/reports", label: "Reports", permission: "report:read" },
  ]),
  DIAGNOSTIC_ADMIN: providerNav("/diagnostic", [
    { href: "/diagnostic/bookings", label: "Bookings", permission: "test-booking:manage" },
    { href: "/diagnostic/reports", label: "Reports", permission: "report:read" },
  ]),

  PHARMACY_STAFF: providerNav("/pharmacy", [
    { href: "/pharmacy/inventory", label: "Inventory", permission: "inventory:read" },
    { href: "/pharmacy/orders", label: "Orders", permission: "order:read" },
  ]),
  PHARMACY_ADMIN: providerNav("/pharmacy", [
    { href: "/pharmacy/inventory", label: "Inventory", permission: "inventory:read" },
    { href: "/pharmacy/orders", label: "Orders", permission: "order:read" },
  ]),

  PLATFORM_ADMIN: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Users", permission: "user:read" },
    { href: "/admin/onboarding", label: "Onboarding", permission: "access-request:read" },
    { href: "/admin/payments", label: "Payments", permission: "payment:verify" },
    { href: "/admin/audit", label: "Audit", permission: "audit:read" },
    { href: "/account", label: "Account" },
  ],
  SUPER_ADMIN: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Users", permission: "user:read" },
    { href: "/admin/onboarding", label: "Onboarding", permission: "access-request:read" },
    { href: "/admin/payments", label: "Payments", permission: "payment:verify" },
    { href: "/admin/organizations", label: "Tenants", permission: "org:manage" },
    { href: "/admin/audit", label: "Audit", permission: "audit:read" },
    { href: "/account", label: "Account" },
  ],
};
