import {
  Activity,
  Banknote,
  BedDouble,
  Building2,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  Home,
  LayoutDashboard,
  Package,
  Pill,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/shared/enums";
import type { PermissionKey } from "@/shared/permissions";

/**
 * Portal navigation per role. `permission` hides a link the user cannot use —
 * presentation only. Each destination still enforces its own guard server-side.
 *
 * Later phases add their entries here as screens land.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
}

const PATIENT_NAV: NavItem[] = [
  { href: "/patient", label: "Home", icon: Home },
  { href: "/patient/timeline", label: "Timeline", icon: Activity, permission: "record:read" },
  { href: "/patient/medicines", label: "Medicines", icon: Pill, permission: "medication:manage" },
  { href: "/patient/reports", label: "Reports", icon: FileText, permission: "report:read" },
  { href: "/patient/family", label: "Family", icon: Users, permission: "family:read" },
  { href: "/patient/billing", label: "Billing", icon: CreditCard, permission: "invoice:read" },
  { href: "/account", label: "Account", icon: UserCog },
];

function providerNav(base: string, extras: NavItem[] = []): NavItem[] {
  return [
    { href: base, label: "Dashboard", icon: LayoutDashboard },
    { href: `${base}/patients`, label: "Patients", icon: Users, permission: "patient:read" },
    ...extras,
    { href: `${base}/billing`, label: "Billing", icon: Banknote, permission: "invoice:read" },
    { href: `${base}/users`, label: "Staff", icon: UserCog, permission: "user:read" },
    { href: "/account", label: "Account", icon: UserCog },
  ];
}

const CLINIC_EXTRAS: NavItem[] = [
  { href: "/clinic/appointments", label: "Appointments", icon: CalendarDays, permission: "appointment:read" },
  { href: "/clinic/prescriptions", label: "Prescriptions", icon: ScrollText, permission: "prescription:read" },
];

const HOSPITAL_EXTRAS: NavItem[] = [
  { href: "/hospital/appointments", label: "Appointments", icon: CalendarDays, permission: "appointment:read" },
  { href: "/hospital/admissions", label: "Admissions", icon: BedDouble, permission: "admission:read" },
  { href: "/hospital/departments", label: "Departments", icon: Building2, permission: "org:read" },
];

const DIAGNOSTIC_EXTRAS: NavItem[] = [
  { href: "/diagnostic/bookings", label: "Bookings", icon: ClipboardList, permission: "test-booking:manage" },
  { href: "/diagnostic/reports", label: "Reports", icon: FlaskConical, permission: "report:read" },
];

const PHARMACY_EXTRAS: NavItem[] = [
  { href: "/pharmacy/inventory", label: "Inventory", icon: Package, permission: "inventory:read" },
  { href: "/pharmacy/orders", label: "Orders", icon: ShoppingCart, permission: "order:read" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users, permission: "user:read" },
  { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList, permission: "access-request:read" },
  { href: "/admin/payments", label: "Payments", icon: Banknote, permission: "payment:verify" },
  { href: "/admin/organizations", label: "Tenants", icon: Building2, permission: "org:manage" },
  { href: "/admin/audit", label: "Audit", icon: ShieldCheck, permission: "audit:read" },
  { href: "/account", label: "Account", icon: UserCog },
];

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  PATIENT: PATIENT_NAV,
  FAMILY_MEMBER: PATIENT_NAV,

  CLINIC_STAFF: providerNav("/clinic", CLINIC_EXTRAS),
  CLINIC_ADMIN: providerNav("/clinic", CLINIC_EXTRAS),

  HOSPITAL_STAFF: providerNav("/hospital", HOSPITAL_EXTRAS),
  HOSPITAL_ADMIN: providerNav("/hospital", HOSPITAL_EXTRAS),

  DIAGNOSTIC_STAFF: providerNav("/diagnostic", DIAGNOSTIC_EXTRAS),
  DIAGNOSTIC_ADMIN: providerNav("/diagnostic", DIAGNOSTIC_EXTRAS),

  PHARMACY_STAFF: providerNav("/pharmacy", PHARMACY_EXTRAS),
  PHARMACY_ADMIN: providerNav("/pharmacy", PHARMACY_EXTRAS),

  PLATFORM_ADMIN: ADMIN_NAV,
  SUPER_ADMIN: ADMIN_NAV,
};

/** Label shown under the wordmark, e.g. "Clinic console". */
export const PORTAL_LABEL: Record<Role, string> = {
  PATIENT: "My health",
  FAMILY_MEMBER: "My health",
  CLINIC_STAFF: "Clinic",
  CLINIC_ADMIN: "Clinic",
  HOSPITAL_STAFF: "Hospital",
  HOSPITAL_ADMIN: "Hospital",
  DIAGNOSTIC_STAFF: "Diagnostics",
  DIAGNOSTIC_ADMIN: "Diagnostics",
  PHARMACY_STAFF: "Pharmacy",
  PHARMACY_ADMIN: "Pharmacy",
  PLATFORM_ADMIN: "Platform",
  SUPER_ADMIN: "Platform",
};
