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
  ShieldAlert,
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
  /**
   * The phase that builds this screen. Present = not built yet, and the catch-all
   * route renders an honest "coming in Phase N" page instead of a 404. Delete the
   * field when the real screen ships.
   */
  phase?: number;
  /** One line describing what the finished screen will do. */
  summary?: string;
}

const PATIENT_NAV: NavItem[] = [
  { href: "/patient", label: "Home", icon: Home },
  { href: "/patient/timeline", label: "Timeline", icon: Activity, permission: "record:read" },
  {
    href: "/patient/medicines",
    label: "Medicines",
    icon: Pill,
    permission: "medication:manage",
    phase: 4,
    summary: "Your medicine schedules, structured automatically from uploaded prescriptions.",
  },
  {
    href: "/patient/reports",
    label: "Reports",
    icon: FileText,
    permission: "report:read",
    phase: 4,
    summary: "Lab results and scans, with out-of-range values flagged in plain language.",
  },
  { href: "/patient/family", label: "Family", icon: Users, permission: "family:read" },
  {
    href: "/patient/emergency",
    label: "Emergency",
    icon: ShieldAlert,
    permission: "emergency-card:manage",
  },
  {
    href: "/patient/billing",
    label: "Billing",
    icon: CreditCard,
    permission: "invoice:read",
    phase: 6,
    summary: "Your plan, invoices, and payment by UPI, QR or bank transfer.",
  },
  { href: "/account", label: "Account", icon: UserCog },
];

function providerNav(base: string, phase: number, extras: NavItem[] = []): NavItem[] {
  return [
    { href: base, label: "Dashboard", icon: LayoutDashboard },
    {
      href: `${base}/patients`,
      label: "Patients",
      icon: Users,
      permission: "patient:read",
      phase,
      summary: "Look up and register patients.",
    },
    ...extras,
    {
      href: `${base}/billing`,
      label: "Billing",
      icon: Banknote,
      permission: "invoice:read",
      phase,
      summary: "Invoices, and collection by UPI, QR or bank transfer.",
    },
    {
      href: `${base}/users`,
      label: "Staff",
      icon: UserCog,
      permission: "user:read",
      phase: 11,
      summary: "Create staff accounts, reset passwords and suspend access.",
    },
    { href: "/account", label: "Account", icon: UserCog },
  ];
}

const CLINIC_EXTRAS: NavItem[] = [
  { href: "/clinic/appointments", label: "Appointments", icon: CalendarDays, permission: "appointment:read", phase: 7, summary: "Calendar, booking and visit status." },
  { href: "/clinic/prescriptions", label: "Prescriptions", icon: ScrollText, permission: "prescription:read", phase: 7, summary: "Write and print structured prescriptions." },
];

const HOSPITAL_EXTRAS: NavItem[] = [
  { href: "/hospital/appointments", label: "Appointments", icon: CalendarDays, permission: "appointment:read", phase: 8, summary: "Department-wise scheduling." },
  { href: "/hospital/admissions", label: "Admissions", icon: BedDouble, permission: "admission:read", phase: 8, summary: "Admit, transfer, discharge and operation notes." },
  { href: "/hospital/departments", label: "Departments", icon: Building2, permission: "org:read", phase: 8, summary: "Departments and the doctors in them." },
];

const DIAGNOSTIC_EXTRAS: NavItem[] = [
  { href: "/diagnostic/bookings", label: "Bookings", icon: ClipboardList, permission: "test-booking:manage", phase: 9, summary: "Test bookings and sample collection tracking." },
  { href: "/diagnostic/reports", label: "Reports", icon: FlaskConical, permission: "report:read", phase: 9, summary: "Upload, verify and publish reports to the patient's timeline." },
];

const PHARMACY_EXTRAS: NavItem[] = [
  { href: "/pharmacy/inventory", label: "Inventory", icon: Package, permission: "inventory:read", phase: 10, summary: "Stock by batch, with expiry alerts." },
  { href: "/pharmacy/orders", label: "Orders", icon: ShoppingCart, permission: "order:read", phase: 10, summary: "Verify prescriptions, fulfil orders and handle refills." },
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

  CLINIC_STAFF: providerNav("/clinic", 7, CLINIC_EXTRAS),
  CLINIC_ADMIN: providerNav("/clinic", 7, CLINIC_EXTRAS),

  HOSPITAL_STAFF: providerNav("/hospital", 8, HOSPITAL_EXTRAS),
  HOSPITAL_ADMIN: providerNav("/hospital", 8, HOSPITAL_EXTRAS),

  DIAGNOSTIC_STAFF: providerNav("/diagnostic", 9, DIAGNOSTIC_EXTRAS),
  DIAGNOSTIC_ADMIN: providerNav("/diagnostic", 9, DIAGNOSTIC_EXTRAS),

  PHARMACY_STAFF: providerNav("/pharmacy", 10, PHARMACY_EXTRAS),
  PHARMACY_ADMIN: providerNav("/pharmacy", 10, PHARMACY_EXTRAS),

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
