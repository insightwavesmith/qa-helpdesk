"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function updateBusinessCertUrl(userId: string, url: string) {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("profiles")
    .update({ business_cert_url: url } as never)
    .eq("id", userId);

  if (error) {
    console.error("updateBusinessCertUrl error:", error);
    return { error: error.message };
  }

  return { error: null };
}
