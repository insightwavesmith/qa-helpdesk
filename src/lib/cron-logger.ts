"use server";
import { createServiceClient } from "@/lib/supabase/server";

export async function startCronRun(cronName: string): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
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
  errorMessage?: string
): Promise<void> {
  if (!id) return;
  try {
    const supabase = createServiceClient();
    await supabase.from("cron_runs").update({
      status,
      records_count: recordsCount,
      finished_at: new Date().toISOString(),
      error_message: errorMessage || null,
    }).eq("id", id);
  } catch (e) { console.error("[cron-logger] complete exception:", e); }
}
