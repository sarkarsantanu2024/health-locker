import type { NotificationType, Role } from "@/shared/enums";
import { CONSUMER_ROLES, PLATFORM_ROLES } from "@/shared/enums";

/**
 * Human wording for every notification type, plus who is allowed to see it in
 * the preferences screen.
 *
 * The audience filter exists so a pharmacist is not offered a "vaccination due"
 * toggle they can never receive — an empty switch is worse than no switch.
 */

export interface NotificationMeta {
  label: string;
  description: string;
  /** Bypasses quiet hours: it is worth waking someone for. */
  urgent?: boolean;
}

export const NOTIFICATION_META: Record<NotificationType, NotificationMeta> = {
  MEDICINE_REMINDER: {
    label: "Medicine reminders",
    description: "When a dose on one of your schedules is due.",
  },
  APPOINTMENT_REMINDER: {
    label: "Appointment reminders",
    description: "The day before a booked appointment, and when one is rescheduled.",
  },
  REPORT_READY: {
    label: "Reports ready",
    description: "When a lab or imaging report is published to your timeline.",
  },
  PAYMENT_DUE: {
    label: "Payments due",
    description: "When an invoice is issued or a subscription is about to lapse.",
  },
  PAYMENT_APPROVED: {
    label: "Payment approved",
    description: "When a submitted UPI or bank payment is verified.",
  },
  PAYMENT_REJECTED: {
    label: "Payment rejected",
    description: "When a payment could not be matched and needs re-submitting.",
  },
  DRUG_INTERACTION_ALERT: {
    label: "Drug interaction alerts",
    description: "When two medicines on your list may interact.",
    urgent: true,
  },
  VACCINATION_DUE: {
    label: "Vaccinations due",
    description: "When a next dose falls due for you or a family member.",
  },
  STOCK_EXPIRY: {
    label: "Stock expiry",
    description: "When a batch in your inventory is close to expiring.",
  },
  ACCOUNT_NOTICE: {
    label: "Account notices",
    description: "Sign-in problems, password resets and access changes.",
    urgent: true,
  },
};

const CONSUMER_TYPES: NotificationType[] = [
  "MEDICINE_REMINDER",
  "APPOINTMENT_REMINDER",
  "REPORT_READY",
  "VACCINATION_DUE",
  "PAYMENT_DUE",
  "PAYMENT_APPROVED",
  "PAYMENT_REJECTED",
  "DRUG_INTERACTION_ALERT",
  "ACCOUNT_NOTICE",
];

const PROVIDER_TYPES: NotificationType[] = [
  "APPOINTMENT_REMINDER",
  "REPORT_READY",
  "PAYMENT_DUE",
  "PAYMENT_APPROVED",
  "ACCOUNT_NOTICE",
];

const PLATFORM_TYPES: NotificationType[] = [
  "PAYMENT_DUE",
  "PAYMENT_APPROVED",
  "PAYMENT_REJECTED",
  "ACCOUNT_NOTICE",
];

export function notificationTypesForRole(role: Role): NotificationType[] {
  if (CONSUMER_ROLES.includes(role)) return CONSUMER_TYPES;
  if (PLATFORM_ROLES.includes(role)) return PLATFORM_TYPES;
  if (role === "PHARMACY_STAFF" || role === "PHARMACY_ADMIN") {
    return ["STOCK_EXPIRY", ...PROVIDER_TYPES];
  }
  return PROVIDER_TYPES;
}

export function isUrgent(type: NotificationType): boolean {
  return NOTIFICATION_META[type].urgent === true;
}
