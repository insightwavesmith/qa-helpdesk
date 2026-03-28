# 경쟁사 분석기 전체 리뷰 + 개선 Plan

> 작성일: 2026-03-07
> 태스크: TASK-경쟁사분석기-전체리뷰.md

---

## 배경

경쟁사 분석기(competitor-analyzer)가 Phase 1~2를 거쳐 구현 완료(Match Rate 95%) 상태이나, 전체 기능(검색, 모니터링, AI 인사이트, 크론)에 대한 종합 코드리뷰가 미실시. 24개 파일을 전수 점검하여 코드 품질, 에러 처리, 타입 안전성, 누락 기능을 식별하고, 발견된 이슈를 T2~T5에서 수정한다.

## 선행 문서 (충돌 방지 확인 완료)

| 문서 | 상태 | 충돌 여부 |
|------|------|-----------|
| `competitor-analyzer.plan.md` | completed (95%) | 없음 — 본 문서는 리뷰+개선 범위 |
| `competitor-analyzer.design.md` | completed | 없음 — 본 설계는 기존 설계 기반 개선 |
| `competitor-brand-registration.plan.md` | completed (95%) | 없음 — 브랜드 등록 UI 개선은 완료 |
| `competitor-analyzer-inspection.analysis.md` | completed | 없음 — 이전 점검의 후속 작업 |

## 범위

| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| **T1** | 전체 코드리뷰 (24개 파일) — 리뷰만, 코드 수정 금지 | 없음 |
| **T2** | 모니터링 기능 점검 + 수정 | T1 리뷰 결과 |
| **T3** | AI 인사이트 기능 점검 + 수정 | T1 리뷰 결과 |
| **T4** | 크론 체크 기능 점검 | T1 리뷰 결과 |
| **T5** | 디버그 로그 정리 | T1 리뷰 결과 |

## T1 코드리뷰 결과 (24개 파일 전수 점검)

### Critical (반드시 수정)

| # | 파일 | 이슈 | 영향 |
|---|------|------|------|
| C1 | `cron/competitor-check/route.ts` L66-69 | 신규 광고 감지 로직 결함: `currentAdCount > prevAdCount`로 단순 카운트 비교. 광고 제거+추가 시 감지 실패. `ads.slice(0, diff)`는 durationDays DESC 정렬이라 신규(짧은 운영기간) 광고가 끝에 있어 잘못된 ID 추출 | 알림 누락 또는 잘못된 알림 |
| C2 | `api/competitor/insights/route.ts` L14 | 인증 체크 없음. 누구나 POST로 AI 분석 트리거 가능 (Anthropic API 비용 발생) | 비용 보안 취약점 |
| C3 | 전체 API routes (7곳) | `(svc as any)` 캐스팅 — `database.ts` 타입에 competitor 테이블 미포함 | 타입 안전성 저하, 런타임 에러 미감지 |

### High (수정 권장)

| # | 파일 | 이슈 | 영향 |
|---|------|------|------|
| H1 | `monitors/[id]/alerts/route.ts` | GET 핸들러 없음. 알림 목록 조회 불가. PATCH(읽음 처리)만 존재 | 클라이언트에서 알림 상세 표시 불가 |
| H2 | `lib/competitor/analyze-ads.ts` L47-69 | 직접 Anthropic 호출 시 timeout/AbortController 없음 (프록시는 120초 timeout 있음) | 무한 대기 가능 |
| H3 | `lib/competitor/analyze-ads.ts` L167 | `JSON.parse(jsonStr) as CompetitorInsight` — 런타임 검증 없이 unsafe 캐스트 | AI가 예상 외 JSON 반환 시 런타임 에러 |
| H4 | `components/ad-card.tsx` L112-116 | `caption`을 URL로 사용: `ad.caption.startsWith("http") ? ad.caption : https://${ad.caption}`. caption은 `ad_creative_link_captions`로 URL이 아닌 텍스트 | 깨진 링크 생성 |

### Medium (개선 사항)

| # | 파일 | 이슈 |
|---|------|------|
| M1 | `meta-ad-library.ts` L70-75 | 디버그 console.log (토큰 길이+런타임 정보 출력) — T5 범위 |
| M2 | `search/route.ts` L32-35 | 디버그 console.log (토큰 존재 확인) — T5 범위 |
| M3 | `monitors/route.ts` POST | 동일 브랜드 중복 등록 방지 없음 |
| M4 | `monitors/[id]/route.ts` DELETE | 삭제 대상 존재 여부 미확인 (항상 success 반환) |
| M5 | `monitors/[id]/alerts/route.ts` PATCH | update 에러 미처리 (결과 무시) |
| M6 | `cron/competitor-check/route.ts` L55 | 브랜드 간 API 호출에 rate limiting 딜레이 없음 |
| M7 | `cron/competitor-check/route.ts` L85 | page_id를 검색 결과 첫 번째 광고에서 자동 업데이트 — 의도치 않은 page_id 변경 |
| M8 | `components/filter-chips.tsx` | 설계서의 "한국", "영상", "이미지" 칩 누락 (4개 중 3개만 구현) |
| M9 | `components/add-monitor-dialog.tsx` | ESC 키로 다이얼로그 닫기 미구현 |
| M10 | `competitor-dashboard.tsx` L97 | `handleAnalyze`의 deps에 `filteredAds` — 매 렌더링 새 참조 생성으로 불필요한 재생성 |

### Low (참고)

| # | 파일 | 이슈 |
|---|------|------|
| L1 | `components/ad-card.tsx` L41-58 | iframe sandbox에 `allow-same-origin` — Meta 도메인 접근 허용. 보안 최소화 원칙상 제거 검토 |
| L2 | `api/competitor/pages/route.ts` L32 | Graph API 프로필 이미지 URL이 일부 페이지에서 403 반환 가능 |
| L3 | `types/competitor.ts` | `CompetitorInsight.analyzedAt`이 AI 응답이 아닌 클라이언트에서 설정됨 — 동작은 정상이나 문서화 필요 |

## 성공 기준

- [ ] T1: 리뷰 결과 `docs/03-analysis/competitor-full-review.analysis.md`에 기록
- [ ] T2: 모니터링 CRUD 동작 확인 (등록/조회/삭제/알림 조회), C3 타입 안전성 개선
- [ ] T3: AI 인사이트 동작 확인, C2 인증 추가, H2 timeout 추가, H3 JSON 검증 추가
- [ ] T4: 크론 동작 확인, C1 신규 광고 감지 로직 수정
- [ ] T5: M1+M2 디버그 로그 제거, 에러 로그만 유지
- [ ] `npm run build` 성공
- [ ] lint 에러 0개

## 실행 순서

```
T1 (코드리뷰 — 본 문서로 완료) → T2 (모니터링) → T3 (AI 인사이트) → T4 (크론) → T5 (디버그 정리)
→ tsc + lint + build → Gap 분석 문서 작성
```

## 위험 요소

| 위험 | 영향 | 완화 |
|------|------|------|
| `database.ts` 타입 재생성 불가 (Supabase CLI 접근 제한) | C3 `as any` 제거 불가 | 로컬 인터페이스 정의로 대체 |
| AI 인사이트 테스트 시 API 비용 발생 | Anthropic API 과금 | 캐시된 결과로 UI 검증, 실 호출 최소화 |
| Cron 로직 변경 시 기존 알림 데이터와 비호환 | 기존 alerts 무효화 가능 | 하위 호환 유지, 새 필드 추가 방식 |
