import { NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { authenticateJob } from "@/lib/jobs";
import { runAllReminders } from "@/modules/notify/reminders.service";
import { AppError, errorBody } from "@/shared/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel's free tier caps a function at 60s; the pass is batched to fit.
export const maxDuration = 60;

/**
 * The scheduled reminder pass: materialise doses, send what is due, expire what
 * was missed.
 *
 * Called by Vercel Cron (bearer `CRON_SECRET`) or QStash (signed). There is no
 * always-on worker anywhere in this stack — see `vercel.json` for the schedule.
 */
export async function POST(request: Request) {
  try {
    const { caller } = await authenticateJob(request);
    const startedAt = Date.now();

    const result = await runAllReminders();

    await audit({
      action: "job:reminders",
      entityType: "Job",
      metadata: { ...result, caller, durationMs: Date.now() - startedAt },
    });

    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(error.toBody(), { status: error.status });
    }

    console.error("[job:reminders] failed", error);
    return NextResponse.json(errorBody("INTERNAL", "The reminder pass failed."), { status: 500 });
  }
}

/** Vercel Cron issues GET requests; same guard, same work. */
export async function GET(request: Request) {
  return POST(request);
}
