import type { SWRConfiguration } from "swr";

/** 표준 JSON API fetcher — CDN 캐시 무력화 */
export const jsonFetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`API error: ${r.status}`);
    return r.json();
  });

/** Server Action 래퍼 fetcher — SWR에서 server action 호출용 */
export const actionFetcher = <T>(action: () => Promise<T>) => action();

/** 전역 SWR 기본 설정 */
export const swrDefaultConfig: SWRConfiguration = {
  revalidateOnFocus: false, // 포커스 시 재검증 비활성 (불필요한 API 호출 방지)
  dedupingInterval: 300_000, // 300초(5분) 내 동일 키 요청 중복 제거 (페이지 전환 시 캐시 히트)
  errorRetryCount: 2, // 에러 시 최대 2회 재시도
  keepPreviousData: true, // 키 변경 시 이전 데이터 유지 (로딩 깜빡임 방지)
  revalidateOnReconnect: false, // 네트워크 재연결 시 자동 재검증 비활성
  onError: (error) => {
    console.error("SWR fetch error:", error);
  },
};
