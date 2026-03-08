"use client";

import { SWRConfig } from "swr";
import { swrDefaultConfig } from "@/lib/swr/config";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrDefaultConfig}>{children}</SWRConfig>;
}
