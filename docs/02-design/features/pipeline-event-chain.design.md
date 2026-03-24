# 수집 파이프라인 이벤트 체인 설계서

## 1. 아키텍처

### Fire-and-Forget 패턴
```
collect-daily (5분)
  ↓ triggerNext("process-media") — 응답 안 기다림
process-media (30분)
  ↓ triggerNext(["embed-creatives", "creative-saliency", "video-saliency"]) — 병렬, 응답 안 기다림
embed-creatives (30분)  |  creative-saliency (10분)  |  video-saliency (20분)
```

### 트리거 흐름
- `chain=true` 쿼리 파라미터가 있을 때만 다음 단계 트리거
- Cloud Scheduler가 `collect-daily?chain=true`로 호출
- collect-daily가 완료 후 `process-media?chain=true` 트리거
- process-media가 완료 후 3개 병렬 트리거

## 2. 신규 모듈

### `src/lib/pipeline-chain.ts`
```typescript
const CLOUD_RUN_URL = process.env.CLOUD_RUN_URL
  || "https://bscamp-cron-906295665279.asia-northeast3.run.app";

/**
 * 다음 파이프라인 단계를 fire-and-forget으로 트리거
 * - 응답을 기다리지 않음 (AbortController 1초 timeout)
 * - 실패해도 현재 단계에 영향 없음
 */
export async function triggerNext(
  endpoints: string | string[],
  params?: Record<string, string>
): Promise<void> {
  const targets = Array.isArray(endpoints) ? endpoints : [endpoints];
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  for (const endpoint of targets) {
    try {
      const url = new URL(`/api/cron/${endpoint}`, CLOUD_RUN_URL);
      url.searchParams.set("chain", "true");
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }

      // Fire-and-forget: 1초 후 abort (연결만 확인)
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1000);

      fetch(url.toString(), {
        method: "GET",
        headers: { "Authorization": `Bearer ${secret}` },
        signal: controller.signal,
      }).catch(() => {}); // 무시

      console.log(`[pipeline-chain] triggered: ${endpoint}`);
    } catch (e) {
      console.warn(`[pipeline-chain] trigger failed: ${endpoint}`, e);
    }
  }
}
```

## 3. 기존 파일 수정

### collect-daily/route.ts — GET 핸들러 끝에 추가
```typescript
import { triggerNext } from "@/lib/pipeline-chain";

// GET handler 내, result 반환 직전:
const isChain = searchParams.get("chain") === "true";
if (isChain && result.results && result.results.length > 0) {
  await triggerNext("process-media");
  console.log("[collect-daily] chain → process-media triggered");
}
```

### process-media/route.ts — 응답 반환 직전:
```typescript
import { triggerNext } from "@/lib/pipeline-chain";

// 결과 반환 직전:
const isChain = searchParams.get("chain") === "true";
if (isChain && (result.uploaded > 0 || result.processed > 0)) {
  await triggerNext([
    "embed-creatives",
    "creative-saliency",
    "video-saliency",
  ]);
  console.log("[process-media] chain → embed+saliency triggered");
}
```

## 4. Cloud Scheduler 등록

| Job Name | Schedule (KST) | URL | 역할 |
|----------|----------------|-----|------|
| collect-daily | 매일 09:00 | /api/cron/collect-daily?chain=true | 수집 (체인 시작점) |
| embed-creatives | 매일 20:00 | /api/cron/embed-creatives | 임베딩 (백업 크론) |
| creative-saliency | 매일 20:30 | /api/cron/creative-saliency | 이미지 시선 (백업 크론) |
| video-saliency | 매일 21:00 | /api/cron/video-saliency | 영상 시선 (백업 크론) |

**참고**: embed/saliency는 체인으로도 트리거되고, Cloud Scheduler로도 독립 실행 가능 (멱등성).

## 5. 에러 처리
| 시나리오 | 처리 |
|---------|------|
| 트리거 실패 | fire-and-forget, 에러 무시. 백업 크론이 보완 |
| process-media 장시간 | 체인 영향 없음. 완료 시 다음 단계 트리거 |
| embed/saliency 실패 | 다음 날 체인 + 백업 크론에서 재처리 |
| CRON_SECRET 없음 | 트리거 스킵 (개발환경) |

## 6. 구현 순서
1. `src/lib/pipeline-chain.ts` 생성
2. `collect-daily/route.ts` 체인 트리거 추가
3. `process-media/route.ts` 체인 트리거 추가
4. tsc + build 확인
5. Cloud Scheduler 등록 (gcloud CLI)
