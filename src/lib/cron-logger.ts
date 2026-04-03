"use server";
import { createServiceClient } from "@/lib/db";
import { notifyCronError } from "@/lib/cron-alert";

export async function startCronRun(cronName: string): Promise<string | null> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("cron_runs")
      .insert({ cron_name: cronName, status: "running" })
      .select("id")
      .single();
    if (error) { console.error("[cron-logger] start failed:", error.message); return null; }
    return data.id;
  } catch (e) { console.error("[cron-logger] start exception:", e); return null; }
}

export async function completeCronRun(
  id: string | null,
  status: "success" | "error" | "partial",
  recordsCount: number,
  errorMessage?: string,
  details?: unknown
): Promise<void> {
  if (!id) return;
  try {
    const db = createServiceClient();
    await db.from("cron_runs").update({
      status,
      records_count: recordsCount,
      finished_at: new Date().toISOString(),
      error_message: errorMessage || null,
      ...(details !== undefined && { details }),
    }).eq("id", id);

    if (status === "error" || status === "partial") {
      const { data: run } = await db
        .from("cron_runs")
        .select("cron_name")
        .eq("id", id)
        .single();
      if (run?.cron_name) {
        await notifyCronError(run.cron_name, errorMessage || "unknown", recordsCount);
      }
    }
  } catch (e) { console.error("[cron-logger] complete exception:", e); }
}
