# TASK-데이터수집.md — collect-daily 정합성 + 타임아웃 + addtocart 제거

> 작성: 모찌 | 2026-02-25
> 우선순위: 긴급 (데이터 수집이 안 되면 QA 불가)

---

## 개요

collect-daily와 collect-benchmarks의 수식/필드를 완전히 동일하게 맞추고, addtocart를 제거하고, Vercel 타임아웃을 최대로 설정한다.

> 기획서: TASK-데이터수집.md 자체가 기획서 (코드 레벨 수정만, 목업 불필요)

---

## T1. addtocart 관련 코드 제거

### 현재:
- `src/app/api/cron/collect-daily/route.ts` → `calculateMetrics()` 내:
  ```typescript
  const addToCart =
    getActionValue(actions, "add_to_cart") ||
    getActionValue(actions, "omni_add_to_cart");
  ```
  반환값: `add_to_cart: Math.trunc(addToCart)`
- `daily_ad_insights` 테이블에 `add_to_cart` 컬럼 존재

### 변경:
1. `calculateMetrics()`에서 `addToCart` 변수 및 `add_to_cart` 반환값 삭제
2. DB INSERT/UPSERT 시 `add_to_cart` 필드 제거
3. `collect-benchmarks`에서도 `add_to_cart` 참조 있으면 제거
4. **DB 컬럼은 건드리지 말 것** (마이그레이션 리스크)

---

## T2. collect-daily 수식을 collect-benchmarks와 완전 동일하게

### 현재 문제점
| 항목 | collect-daily | collect-benchmarks | 문제 |
|---|---|---|---|
| CPC | Meta API 요청 O | 벤치마크에서 SELECT | daily_ad_insights에 저장 안 됨 |
| CPM | Meta API 요청 O | 벤치마크에서 SELECT | daily_ad_insights에 저장 안 됨 |
| frequency | Meta API 요청 O | - | daily_ad_insights에 저장 안 됨 |
| initiate_checkout | 저장 O | BENCHMARK_METRICS에 없음 | 벤치마크 미반영 |

### 변경
1. `calculateMetrics()` 반환값에 추가:
   - `cpc: safeFloat(insight.cpc)` (Meta API가 직접 반환하는 값 사용)
   - `cpm: safeFloat(insight.cpm)` (Meta API가 직접 반환하는 값 사용)
   - `frequency: safeFloat(insight.frequency)` (Meta API가 직접 반환하는 값 사용)
2. DB UPSERT에 `cpc`, `cpm`, `frequency` 포함
3. `collect-benchmarks`의 `BENCHMARK_METRICS` 배열 확인:
   - `initiate_checkout` 불필요하면 제거 (addtocart 제거에 따라)
   - `cpc`, `cpm` 벤치마크 필요 시 추가
4. **두 파일의 계산 수식이 100% 일치하는지 검증** — 동일 지표는 반드시 동일 공식

### 수식 정의 (최종)
| 지표 | 공식 | 비고 |
|---|---|---|
| ctr | Meta API 직접 반환값 (`insight.ctr`) | |
| cpc | Meta API 직접 반환값 (`insight.cpc`) | |
| cpm | Meta API 직접 반환값 (`insight.cpm`) | |
| frequency | Meta API 직접 반환값 (`insight.frequency`) | |
| roas | purchaseValue / spend | spend=0이면 0 |
| video_p3s_rate | video_play_actions합 / impressions × 100 | 3초 재생률 |
| thruplay_rate | thruplay / impressions × 100 | |
| retention_rate | thruplay / video_play_actions합 × 100 | |
| reactions_per_10k | reactions / impressions × 10000 | post_reaction or like |
| comments_per_10k | comments / impressions × 10000 | |
| shares_per_10k | shares / impressions × 10000 | post action_type |
| engagement_per_10k | (reactions+comments+shares) / impressions × 10000 | |
| click_to_purchase_rate | purchases / clicks × 100 | |
| checkout_to_purchase_rate | purchases / initiateCheckout × 100 | |
| reach_to_purchase_rate | purchases / impressions × 100 | 노출대비 구매전환율 |
| creative_type | video_play_actions > 0 ? 'VIDEO' : 'IMAGE' | |

---

## T3. Vercel maxDuration 설정

### 현재
- `next.config.ts`에 `maxDuration` 없음
- Cron route에 `export const maxDuration` 없음
- Vercel Pro 기본: 60초

### 변경
1. `src/app/api/cron/collect-daily/route.ts` 상단에 추가:
   ```typescript
   export const maxDuration = 300; // 5분 (Vercel Pro 최대)
   ```
2. `src/app/api/cron/collect-benchmarks/route.ts` 상단에 추가:
   ```typescript
   export const maxDuration = 300;
   ```
3. 주석의 UTC/KST 시각 오류 수정:
   - collect-daily: `0 3 * * *` = UTC 03:00 = KST 12:00
   - collect-benchmarks: `0 2 * * 1` = 월 UTC 02:00 = KST 11:00

---

## T4. active 갱신 버그 수정

### 현재
- `saveAdAccount()`, `approveMember()` 모두 UPDATE 분기에서 `active: true` 누락
- 비활성 계정이 재연결되어도 active=false 유지

### 변경
1. `src/actions/onboarding.ts` → `saveAdAccount()` UPDATE 분기에 `active: true` 추가:
   ```typescript
   await svc.from("ad_accounts").update({
     user_id: user.id,
     active: true,  // ← 추가
     mixpanel_project_id: data.mixpanelProjectId || null,
     mixpanel_board_id: data.mixpanelBoardId || null,
   }).eq("id", existing.id);
   ```
2. `src/actions/admin.ts` → `approveMember()` UPDATE 분기에 동일하게 `active: true` 추가

---

## 완료 기준

- [ ] addtocart 관련 코드 제거 (calculateMetrics, DB UPSERT)
- [ ] collect-daily에 cpc/cpm/frequency 저장 추가
- [ ] collect-daily ↔ collect-benchmarks 수식 100% 일치
- [ ] maxDuration = 300 설정
- [ ] active 갱신 버그 수정
- [ ] 주석 시각 오류 수정
- [ ] `npm run build` PASS
- [ ] `npx tsc --noEmit` PASS

---

## 리뷰 결과
- 코드 리뷰 완료: 4개 파일 변경 검증
- T1~T4 항목별 코드 수정 확인

## 금지 사항
- DB 마이그레이션 (컬럼 추가/삭제) 금지 — 코드 레벨만 수정
- UI 변경 없음
- 다른 파일 수정 금지 (위 명시된 파일만)
