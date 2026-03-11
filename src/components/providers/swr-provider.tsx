"use client";

import { useEffect } from "react";
import { SWRConfig, mutate } from "swr";
import { swrDefaultConfig, jsonFetcher } from "@/lib/swr/config";
import { SWR_KEYS } from "@/lib/swr/keys";

/** 레이아웃 마운트 시 수강생이 자주 쓰는 데이터를 SWR 캐시에 워밍 */
function usePrefetch() {
  useEffect(() => {
    const prefetchKeys = [
      SWR_KEYS.SALES_SUMMARY,
    ];
    for (const key of prefetchKeys) {
      // populateCache: true → 캐시에 넣고, revalidate: false → 추가 요청 안 함
      mutate(key, jsonFetcher(key), { populateCache: true, revalidate: false });
    }
  }, []);
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  usePrefetch();
  return <SWRConfig value={swrDefaultConfig}>{children}</SWRConfig>;
}
