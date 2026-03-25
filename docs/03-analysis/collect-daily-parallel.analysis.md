# collect-daily 병렬화 리팩토링 — Gap 분석

## Match Rate: 97%

## 분석 대상
- 설계: `docs/02-design/features/collect-daily-refactor.design.md` (Phase 1 병렬화 파트)
- 구현: `src/app/api/cron/collect-daily/route.ts`
- 관련 파일: `src/lib/collect-daily-utils.ts`, `src/lib/pipeline-chain.ts`, `src/lib/cron-logger.ts`
- 분석 일시: 2026-03-25
- 리뷰어: qa-engineer

---

## 빌드 상태

| 항목 | 결과 | 비고 |
|------|------|------|
| tsc --noEmit | PASS | 타입 에러 0개 |
| eslint (대상 4파일) | PASS | eslint-disable 주석 정상 처리 |
| npm run build | PASS | Compiled successfully in 4.9s |

---

## 코드 품질 메트릭

| 항목 | 수치 |
|------|------|
| 총 줄 수 | 511줄 |
| collectAccount() 함수 | 57~317줄 (260줄) |
| runCollectDaily() 함수 | 319~479줄 (160줄) |
| GET 핸들러 | 481~511줄 (30줄) |
| CONCURRENCY 상수 | 5 (54줄) |
| any 사용 | 13건 (모두 eslint-disable 처리) |

---

## 일치 항목

### 1. Promise.allSettled + CONCURRENCY=5 청킹 [PASS]

설계 목표: 계정 병렬 처리, 에러 격리

구현 (438~456줄):
- `const CONCURRENCY = 5` 상수 정의 (54줄)
- `accountsToCollect`를 CONCURRENCY 단위로 청킹
- `Promise.allSettled(chunk.map(account => collectAccount(...)))` 실행
- fulfilled/rejected 결과 분리 처리 — `hasPartialError` 플래그로 partial 상태 기록
- 설계보다 안전한 구현: `Promise.all` 대신 `Promise.allSettled` 사용

Rate-limit 고려 여부:
- `collect-daily-utils.ts`의 `fetchMetaWithRetry` (246~280줄): 429 응답 시 Retry-After 헤더 또는 지수 백오프(3s, 6s)
- CONCURRENCY=5로 동시 5계정 병렬 호출 → 동시에 5개 Meta API 요청 발생
- fetchMetaWithRetry가 계정 단위로 동작하므로 rate limit 대응 존재
- 설계에서 Cloud Run 기준으로 방법 A(단일 요청, 내부 병렬)를 권장했으며 구현과 일치

### 2. collectAccount() 함수 분리 [PASS]

설계 목표: 단일 계정 수집 로직 독립 함수화

구현 (57~317줄):
```typescript
async function collectAccount(
  svc: ReturnType<typeof createServiceClient>,
  account: { account_id: string; account_name: string },
  yesterday: string,
  dateParam: string | undefined,
  backfill: boolean,
): Promise<Record<string, unknown>>
```
- 시그니처 일관성: 5개 인자 (svc, account, yesterday, dateParam, backfill)
- 단일 책임: Meta API 수집 + landing_pages/creatives/creative_media UPSERT
- 내부에서 v2 UPSERT(LP 정규화, creatives, creative_media)를 독립 try-catch로 격리
- runCollectDaily는 160줄로 축소 (설계 목표 ~450줄보다 더 경량화됨)

### 3. incremental 수집 로직 [PASS]

설계 목표: 같은 날 중복 수집 방지

구현 (420~433줄):
- `backfill` 파라미터가 false일 때만 활성화 (의도적 설계)
- `daily_ad_insights` WHERE date=yesterday AND account_id IN (permittedAccounts) 조회
- 이미 수집된 account_id를 Set으로 관리
- `accountsToCollect = permittedAccounts.filter(a => !alreadyCollected.has(a.account_id))`
- 스킵 시 로그 출력: `"incremental: N개 계정 이미 수집됨, 스킵"`

### 4. 배치 분할 로직 [PASS]

구현 (361~370줄):
- BATCH_SIZE = 10 (내부 상수)
- batch 1~3: `accounts.slice((batch-1)*10, batch*10)`
- batch 4: `accounts.slice(30)` — 나머지 전부
- `created_at` 정렬로 배치 간 일관된 계정 순서 보장
- batch 4가 나머지를 전부 처리하는 설계 의도 정확히 구현됨

### 5. triggerNext("process-media") 체인 [PASS]

구현 (499~504줄):
- GET 파라미터 `chain=true`가 있을 때만 실행
- `result.results.length > 0` 조건: 수집된 결과가 있을 때만 트리거
- `pipeline-chain.ts`의 `triggerNext`: fire-and-forget, 2초 AbortSignal, CRON_SECRET 포함
- CRON_SECRET 미설정 시 trigger 스킵 처리 (`if (!secret) return`)

### 6. cron-logger 통합 [PASS]

구현:
- `startCronRun(cronName)`: 크론 실행 시작 기록 (324줄)
- cronName: batch 파라미터 있으면 `collect-daily-{batch}`, 없으면 `collect-daily`
- `completeCronRun(cronRunId, status, totalRecords, errorMessage)`: 완료 기록
  - 정상: `"success"`, 일부 실패: `"partial"`, 치명 에러: `"error"`
- catch 블록에서도 `completeCronRun(cronRunId, "error", 0, errorMessage)` 호출

### 7. 에러 시 partial status 기록 [PASS]

구현:
- Promise.allSettled rejected: `hasPartialError = true` + results에 meta_error 포함
- fulfilled이지만 meta_error 필드 있으면: `hasPartialError = true`
- `completeCronRun(cronRunId, hasPartialError ? "partial" : "success", ...)`
- v2 UPSERT 실패는 독립 catch로 처리 → 상위 collectAccount catch에 영향 없음

### 8. 공용 모듈 분리 [PASS]

설계 목표: `collect-daily-utils.ts` 분리

구현:
- `src/lib/collect-daily-utils.ts` 생성 완료
- 이동된 함수: `normalizeRanking`, `extractLpUrl`, `calculateMetrics`, `checkMetaPermission`, `fetchMetaWithRetry`, `fetchAccountAds`
- `AD_FIELDS`, `INSIGHT_FIELDS` 상수도 분리
- `route.ts`에서 import로 교체

---

## 불일치 항목 (경미)

### 1. Meta API 권한 체크 순차 처리 [INFO]

- 구현: `for (const account of filteredAccounts)` 루프에서 `await checkMetaPermission()` 순차 호출 (382~397줄)
- 설계 4.2 방법 A에서 "38계정 순차 처리, 각 계정 try-catch로 격리"라고 명시 — 수집 병렬화 범위에 권한 체크 포함은 명시되지 않음
- 계정 30개 기준: 권한 체크 30회 순차 API 호출, 계정당 10초 timeout → 최대 300초 지연 가능
- 수집 단계(Promise.allSettled)는 병렬화 완료이므로 설계 목표는 달성
- 이전 메모리 기록: "크론 실행 시간 위험 패턴 — 권한체크(순차)" — 반복 패턴

### 2. any 타입 광범위 사용 [INFO, 반복 패턴 #8]

- 13건의 `any` 모두 eslint-disable 처리됨 (의도적 사용)
- Meta API 응답 복잡한 구조(ads, insight), Supabase 타입 미생성(landing_pages, creative_media)에 기인
- 이전 메모리 기록: "supabase as any 패턴" — T1 타입 재생성 시 일괄 해소 예정

### 3. CRON_SECRET 미설정 방어 로직 [WARNING, 반복 2회]

- 39~43줄 `verifyCron`:
  ```typescript
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  ```
- `CRON_SECRET` 미설정 시 `"Bearer undefined"` 문자열 비교 — 일반적인 요청 헤더로는 통과 불가하지만 인증 설계 의도에서 벗어남
- 안전한 패턴: `const secret = process.env.CRON_SECRET; if (!secret) return false;` 먼저 체크
- 이전 메모리 기록: "Cron 인증 패턴 버그 (2026-03-23, 반복 2회)" — TASK B 수정 범위 외

---

## 이전 리뷰 대비 개선 확인

| 이전 이슈 | 현재 상태 |
|-----------|-----------|
| 크론 실행 시간 위험 (수집 순차) | 부분 개선 — 수집 단계 CONCURRENCY=5 병렬화 완료. 권한 체크는 여전히 순차. |
| 382줄 runCollectDaily 비대 | 개선 완료 — collectAccount 분리, runCollectDaily 160줄로 축소 |
| any 남용 eslint-disable 미적용 | 개선 완료 — 모든 any에 eslint-disable 처리 |
| mp4 다운로드 타임아웃 위험 | 개선 완료 — process-media로 분리, collect-daily에서 제거 |
| 후처리(embedMissing, precompute) 배치4 혼재 | 개선 완료 — collect-daily에서 제거, 별도 크론으로 위임 |

---

## 수정 필요 사항

### Critical (없음)

### Warning
- **CRON_SECRET 미설정 방어 로직** (반복 2회): `verifyCron` 함수에서 CRON_SECRET null 체크 선행 없음. TASK B 범위 외이므로 별도 이슈 추적 권장.

### Info
- Meta API 권한 체크 순차 처리 (382~397줄) — 최악 케이스 계정 수 × 10s 지연 가능. 권한 체크도 CONCURRENCY 병렬화 적용 고려.
- `any` 타입 사용 (13건) — T1 Supabase 타입 재생성 시 일괄 해소 가능.

---

## 결론

TASK B의 3개 목표 모두 달성:
1. Promise.allSettled + CONCURRENCY=5 병렬 수집 ✓
2. collectAccount() 함수 분리 ✓
3. incremental 수집 로직 (중복 방지) ✓

빌드 3종 모두 통과. Critical 이슈 없음.

**Match Rate: 97%** (TASK B 요구사항 기준)
