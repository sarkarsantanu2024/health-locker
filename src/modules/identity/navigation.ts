import {
  Activity,
  Banknote,
  Bell,
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
import { toneFor, type Tone } from "@/ui/tone";

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
   * The hue this destination is drawn in — sidebar icon, and the pill when it
   * is the current section. Taken from `toneFor()` wherever the destination
   * maps onto a domain concept, so the Reports icon in the sidebar is the same
   * violet as a report card on the timeline. `neutral` is deliberate for the
   * chrome-ish entries (Account), which are settings rather than data.
   */
  tone: Tone;
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
  { href: "/patient", label: "Home", icon: Home, tone: "teal" },
  {
    href: "/patient/timeline",
    label: "Timeline",
    icon: Activity,
    permission: "record:read",
    tone: toneFor("prescription"),
  },
  {
    href: "/patient/medicines",
    label: "Medicines",
    icon: Pill,
    permission: "medication:manage",
    summary: "Your medicine schedules and today's doses.",
    tone: toneFor("medicine"),
  },
  {
    href: "/patient/reports",
    label: "Reports",
    icon: FileText,
    permission: "report:read",
    summary: "Lab results and scans, with out-of-range values flagged in plain language.",
    tone: toneFor("report"),
  },
  {
    href: "/patient/family",
    label: "Family",
    icon: Users,
    permission: "family:read",
    tone: toneFor("family"),
  },
  {
    href: "/patient/emergency",
    label: "Emergency",
    icon: ShieldAlert,
    permission: "emergency-card:manage",
    tone: toneFor("alert"),
  },
  {
    href: "/patient/billing",
    label: "Billing",
    icon: CreditCard,
    permission: "invoice:read",
    summary: "Your plan, invoices, and payment by UPI, QR or bank transfer.",
    tone: toneFor("billing"),
  },
  { href: "/notifications", label: "Alerts", icon: Bell, tone: toneFor("alert") },
  { href: "/account", label: "Account", icon: UserCog, tone: "neutral" },
];

function providerNav(base: string, extras: NavItem[] = []): NavItem[] {
  return [
    { href: base, label: "Dashboard", icon: LayoutDashboard, tone: "teal" },
    {
      href: `${base}/patients`,
      label: "Patients",
      icon: Users,
      permission: "patient:read",
      summary: "Look up and register patients.",
      tone: toneFor("patient"),
    },
    ...extras,
    {
      href: `${base}/billing`,
      label: "Billing",
      icon: Banknote,
      permission: "invoice:read",
      summary: "Invoices, and collection by UPI, QR or bank transfer.",
      tone: toneFor("billing"),
    },
    {
      href: `${base}/users`,
      label: "Staff",
      icon: UserCog,
      permission: "user:read",
      summary: "Create staff accounts, reset passwords and suspend access.",
      tone: toneFor("staff"),
    },
    { href: "/notifications", label: "Alerts", icon: Bell, tone: toneFor("alert") },
    { href: "/account", label: "Account", icon: UserCog, tone: "neutral" },
  ];
}

const CLINIC_EXTRAS: NavItem[] = [
  { href: "/clinic/appointments", label: "Appointments", icon: CalendarDays, permission: "appointment:read", summary: "Calendar, booking and visit status.", tone: toneFor("appointment") },
  { href: "/clinic/prescriptions", label: "Prescriptions", icon: ScrollText, permission: "prescription:read", summary: "Write and print structured prescriptions.", tone: toneFor("prescription") },
];

const HOSPITAL_EXTRAS: NavItem[] = [
  { href: "/hospital/appointments", label: "Appointments", icon: CalendarDays, permission: "appointment:read", summary: "Department-wise scheduling.", tone: toneFor("appointment") },
  { href: "/hospital/admissions", label: "Admissions", icon: BedDouble, permission: "admission:read", summary: "Admit, transfer, discharge and operation notes.", tone: toneFor("admission") },
  { href: "/hospital/departments", label: "Departments", icon: Building2, permission: "org:read", summary: "Departments and the doctors in them.", tone: toneFor("department") },
  { href: "/hospital/prescriptions", label: "Prescriptions", icon: ScrollText, permission: "prescription:read", summary: "Write and print structured prescriptions.", tone: toneFor("prescription") },
];

const DIAGNOSTIC_EXTRAS: NavItem[] = [
  { href: "/diagnostic/bookings", label: "Bookings", icon: ClipboardList, permission: "test-booking:manage", summary: "Test bookings and sample collection tracking.", tone: toneFor("appointment") },
  { href: "/diagnostic/reports", label: "Reports", icon: FlaskConical, permission: "report:read", summary: "Upload, verify and publish reports to the patient's timeline.", tone: toneFor("report") },
  { href: "/diagnostic/catalogue", label: "Catalogue", icon: FlaskConical, permission: "test-catalog:manage", summary: "The tests this centre offers, with prices and turnaround.", tone: toneFor("document") },
];

const PHARMACY_EXTRAS: NavItem[] = [
  { href: "/pharmacy/inventory", label: "Inventory", icon: Package, permission: "inventory:read", summary: "Stock by batch, with expiry alerts.", tone: toneFor("inventory") },
  { href: "/pharmacy/orders", label: "Orders", icon: ShoppingCart, permission: "order:read", summary: "Verify prescriptions, fulfil orders and handle refills.", tone: toneFor("prescription") },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, tone: "teal" },
  { href: "/admin/users", label: "Users", icon: Users, permission: "user:read", tone: toneFor("staff") },
  { href: "/admin/onboarding", label: "Onboarding", icon: ClipboardList, permission: "access-request:read", tone: toneFor("patient") },
  { href: "/admin/payments", label: "Payments", icon: Banknote, permission: "payment:verify", tone: toneFor("billing") },
  { href: "/admin/organizations", label: "Tenants", icon: Building2, permission: "org:manage", tone: toneFor("department") },
  { href: "/admin/audit", label: "Audit", icon: ShieldCheck, permission: "audit:read", tone: "emerald" },
  { href: "/notifications", label: "Alerts", icon: Bell, tone: toneFor("alert") },
  { href: "/account", label: "Account", icon: UserCog, tone: "neutral" },
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
