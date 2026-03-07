# 경쟁사 분석기 전체 리뷰 — 코드리뷰 결과 (T1)

> 작성일: 2026-03-07
> 리뷰 범위: 24개 파일 전수 점검
> Plan: `docs/01-plan/features/competitor-full-review.plan.md`
> Design: `docs/02-design/features/competitor-full-review.design.md`

---

## 리뷰 대상 파일

| # | 파일 | 역할 |
|---|------|------|
| 1 | `src/lib/competitor/meta-ad-library.ts` | Meta Ad Library API 클라이언트 |
| 2 | `src/lib/competitor/analyze-ads.ts` | AI 인사이트 분석 로직 |
| 3 | `src/app/api/competitor/search/route.ts` | 키워드 검색 API |
| 4 | `src/app/api/competitor/pages/route.ts` | 페이지 검색 API |
| 5 | `src/app/api/competitor/monitors/route.ts` | 모니터링 CRUD |
| 6 | `src/app/api/competitor/monitors/[id]/route.ts` | 모니터링 단건 삭제 |
| 7 | `src/app/api/competitor/monitors/[id]/alerts/route.ts` | 알림 조회/읽음처리 |
| 8 | `src/app/api/competitor/insights/route.ts` | AI 인사이트 API |
| 9 | `src/app/api/cron/competitor-check/route.ts` | 크론 체크 |
| 10 | `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` | 대시보드 |
| 11-20 | `src/app/(main)/protractor/competitor/components/*.tsx` | UI 컴포넌트 10종 |
| 21 | `src/types/competitor.ts` | 타입 정의 |
| 22 | `src/lib/supabase/middleware.ts` | PUBLIC_PATHS |

---

## 발견된 이슈

### Critical (반드시 수정)

| # | 파일 | 이슈 | 영향 | 조치 |
|---|------|------|------|------|
| C1 | `cron/competitor-check/route.ts` L66-69 | `ads.slice(0, diff)` — durationDays DESC 정렬이라 신규 광고(짧은 운영기간)가 리스트 끝에 있어 잘못된 ID 추출 | 잘못된 알림 | T4에서 `slice(-diff)` 수정 |
| C2 | `api/competitor/insights/route.ts` L14 | 인증 체크 없음 — 누구나 POST로 AI 분석 트리거 가능 | 비용 보안 취약점 | T3에서 인증 추가 (단, T3은 AI 숨기기로 변경됨 — API 코드는 보존하되 인증 추가) |
| C3 | 전체 API routes (7곳) | `(svc as any)` — `database.ts`에 competitor 테이블 미포함 | 타입 안전성 저하 | DB Row 타입을 `types/competitor.ts`에 추가하여 부분 개선 |

### High (수정 권장)

| # | 파일 | 이슈 | 영향 | 조치 |
|---|------|------|------|------|
| H1 | `monitors/[id]/alerts/route.ts` | GET 핸들러 없음 — 알림 목록 조회 불가 | 클라이언트에서 알림 상세 표시 불가 | T2에서 GET 추가 |
| H2 | `analyze-ads.ts` L47-69 | `callAnthropicDirect`에 timeout/AbortController 없음 | 무한 대기 가능 | T3에서 timeout 추가 |
| H3 | `analyze-ads.ts` L167 | `JSON.parse() as CompetitorInsight` — 런타임 검증 없이 unsafe 캐스트 | 런타임 에러 | T3에서 JSON 검증 추가 |
| H4 | `ad-card.tsx` L112-116 | caption을 URL로 사용 — caption은 텍스트이므로 깨진 링크 생성 | UX 문제 | T3에서 조건부 렌더링 |

### Medium (개선 사항)

| # | 파일 | 이슈 | 조치 |
|---|------|------|------|
| M1 | `meta-ad-library.ts` L70-75 | 디버그 console.log | T5 삭제 |
| M2 | `search/route.ts` L32-35 | 디버그 console.log | T5 삭제 |
| M3 | `monitors/route.ts` POST | 동일 브랜드 중복 등록 방지 없음 | T2 추가 |
| M4 | `monitors/[id]/route.ts` DELETE | 삭제 대상 존재 여부 미확인 | 현재 유지 (멱등성 원칙) |
| M5 | `monitors/[id]/alerts/route.ts` PATCH | update 에러 미처리 | T2 추가 |
| M6 | `cron/competitor-check/route.ts` L55 | 브랜드 간 rate limiting 딜레이 없음 | T4 추가 |
| M7 | `cron/competitor-check/route.ts` L85 | page_id 자동 업데이트 — 의도치 않은 변경 | T4 제거 |
| M9 | `add-monitor-dialog.tsx` | ESC 키 닫기 미구현 | 공통에서 추가 |
| M10 | `competitor-dashboard.tsx` L97 | `handleAnalyze` deps에 `filteredAds` 불안정 참조 | T3에서 정리 (AI 숨기기) |

### Low (참고)

| # | 파일 | 이슈 |
|---|------|------|
| L1 | `ad-card.tsx` L41-58 | iframe sandbox `allow-same-origin` — 보안 최소화 검토 |
| L2 | `pages/route.ts` L32 | Graph API 프로필 이미지 403 가능 |
| L3 | `types/competitor.ts` | `CompetitorInsight.analyzedAt` 클라이언트 설정 |

---

## T2~T5 수정 계획

T1 리뷰 결과를 기반으로 다음 태스크에서 수정:

- **T2**: H1(GET 추가), M3(중복방지), M5(PATCH 에러), DB Row 타입 추가
- **T3**: AI 인사이트 기능 숨기기 (InsightSection 렌더링 제거 + state 정리). C2(인증), H2(timeout), H3(JSON 검증)은 API 파일에 적용하되 UI에서는 숨김.
- **T4**: C1(slice 방향), M6(딜레이), M7(page_id 제거)
- **T5**: M1+M2(디버그 로그 삭제)
- **공통**: H4(caption 링크), M9(ESC 키)

---

## 구현 결과 (T2~T5)

### Match Rate: 95%

### 일치 항목 (19/20)

| # | 설계 항목 | 구현 상태 |
|---|----------|----------|
| 1 | T2: DB Row 타입 3종 추가 | ✅ CompetitorMonitorRow, CompetitorAlertRow, CompetitorInsightCacheRow |
| 2 | T2: CompetitorErrorCode에 DUPLICATE_MONITOR, DB_ERROR 추가 | ✅ |
| 3 | T2: POST 중복 브랜드 체크 (M3) | ✅ 409 Conflict 반환 확인 |
| 4 | T2: GET 알림 목록 조회 (H1) | ✅ camelCase 변환 + limit 50 |
| 5 | T2: PATCH 알림 에러 처리 (M5) | ✅ updateError 체크 추가 |
| 6 | T2: curl 테스트 등록/조회/중복/알림/삭제 | ✅ 6개 테스트 모두 통과 |
| 7 | T3: InsightSection import 주석 처리 | ✅ |
| 8 | T3: InsightSection 렌더링 주석 처리 | ✅ |
| 9 | T3: insight, loadingInsight state 제거 | ✅ |
| 10 | T3: handleAnalyze 함수 제거 | ✅ |
| 11 | T3: CompetitorInsight import 제거 | ✅ |
| 12 | T3: insights/route.ts 인증 추가 (C2) | ✅ createClient() + getUser() |
| 13 | T3: callAnthropicDirect timeout 추가 (H2) | ✅ AbortController + 120s |
| 14 | T3: JSON 응답 검증 (H3) | ✅ 필수 필드 타입 검증 + 안전한 객체 생성 |
| 15 | T3: ad-card caption 조건부 렌더링 (H4) | ✅ `/^https?:\/\//.test()` |
| 16 | T4: slice 방향 수정 (C1) | ✅ `slice(-diff)` |
| 17 | T4: page_id 자동 업데이트 제거 (M7) | ✅ |
| 18 | T4: 브랜드 간 500ms 딜레이 (M6) | ✅ |
| 19 | T5: meta-ad-library.ts debug log 삭제 (M1) | ✅ |
| 20 | T5: search/route.ts debug log 삭제 (M2) | ✅ |

### 불일치 항목 (1/20)

| # | 설계 항목 | 상태 | 이유 |
|---|----------|------|------|
| 1 | filteredAds useMemo (M10) | ✅ 구현됨 (설계서에 있으나 T3 AI 숨기기로 deps 이슈 자체가 사라짐) | handleAnalyze 제거로 M10 이슈 무효화, 그래도 useMemo 적용하여 성능 최적화 |

### 빌드 검증

- `npx tsc --noEmit` — ✅ 에러 0개
- `npm run lint` — ✅ competitor 관련 에러 0개 (기존 15개 에러는 다른 파일)
- `npm run build` — ✅ 빌드 성공

### curl 테스트 결과

```
TEST 1: GET /api/competitor/monitors -> 200 (monitors: [])
TEST 2: POST /api/competitor/monitors -> 201 (등록 성공)
TEST 3: POST /api/competitor/monitors -> 409 (중복 등록 차단)
TEST 4: GET /api/competitor/monitors/{id}/alerts -> 200 (alerts: [])
TEST 5: DELETE /api/competitor/monitors/{id} -> 200 (삭제 성공)
TEST 6: GET /api/competitor/monitors -> 200 (삭제 확인)
TEST 7: GET /api/cron/competitor-check -> 200 (processed: 0, 인증 통과)
```

### 변경 파일 목록 (11개)

| 파일 | 변경 내용 |
|------|----------|
| `src/types/competitor.ts` | DB Row 타입 3종 + ErrorCode 2종 추가 |
| `src/app/api/competitor/monitors/route.ts` | POST 중복 체크 추가 |
| `src/app/api/competitor/monitors/[id]/alerts/route.ts` | GET 추가 + PATCH 에러 처리 |
| `src/app/api/competitor/insights/route.ts` | 인증 체크 추가 |
| `src/lib/competitor/analyze-ads.ts` | timeout + JSON 검증 |
| `src/app/(main)/protractor/competitor/components/ad-card.tsx` | caption 조건부 |
| `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` | AI 숨기기 + useMemo |
| `src/app/api/cron/competitor-check/route.ts` | slice 방향 + page_id 제거 + 딜레이 |
| `src/lib/competitor/meta-ad-library.ts` | debug log 삭제 |
| `src/app/api/competitor/search/route.ts` | debug log 삭제 |
| `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx` | ESC 핸들러 |
