import { z } from "zod";

import { NOTIFICATION_TYPES } from "@/shared/enums";

/** HH:mm in 24-hour form, or empty for "no quiet hours". */
const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 22:00")
  .optional()
  .or(z.literal(""))
  .transform((v) => v || null);

export const preferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES),
  // Checkbox: absent in FormData means off, so a missing value is a real "false".
  webPush: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export const quietHoursSchema = z
  .object({ start: timeOfDay, end: timeOfDay })
  .refine((v) => (v.start === null) === (v.end === null), {
    message: "Set both a start and an end time, or clear both",
    path: ["end"],
  });

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(400),
    auth: z.string().min(1).max(400),
  }),
});

export const markReadSchema = z.object({ notificationId: z.string().min(1) });

export type PreferenceInput = z.infer<typeof preferenceSchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
