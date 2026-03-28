# 총가치각도기 리팩토링 Plan

## 배경
LP/장바구니 지표 제거, 4파트→3파트 구조 변경, 총가치수준 게이지 신규, 벤치마크 수집 Meta API 직접 호출로 전환.

## 범위
T1~T10 (10개 태스크), 숨은 이슈 H1~H5

## 성공 기준
- npm run build 성공
- lint 에러 0개
- 진단 API 3파트 응답
- 총가치수준 API 정상 동작

## 실행 순서
Phase 1(병렬): T1, T2, T4, T9
Phase 2: T3, T5
Phase 3: T6, T10
Phase 4: T7
Phase 5: T8

## 상세 분석
코드리뷰 보고서 참조 (TASK.md 리뷰 결과 섹션)

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 대상 함수/API | 입력 | 기대 출력 | 비고 |
|---------------|------|-----------|------|
| `GET /api/protractor/diagnose` | `{ ad_account_id, media_id }` | 3파트 진단 응답 (기반/참여/전환) | 4파트→3파트 변경 확인 |
| `GET /api/protractor/total-value` | `{ ad_account_id }` | `{ level, score, gauge_data }` | 총가치수준 게이지 |
| `calculatePartScore(metrics, benchmarks)` | 지표 값 + 벤치마크 | 파트별 점수 (0~100) | LP/장바구니 지표 제거됨 |
| `fetchBenchmarks("ALL")` | creative_type="ALL" | 벤치마크 객체 | Meta API 직접 호출 |
| `formatDiagnosis(scores)` | 3파트 점수 배열 | `{ foundation, engagement, conversion }` | 4파트 필드 없어야 함 |

### T2. 엣지 케이스 정의

| 시나리오 | 입력/상황 | 기대 동작 |
|----------|-----------|-----------|
| 벤치마크 데이터 없음 | benchmarks 테이블 비어있음 | 기본값(0) 반환 + 경고 로그 |
| 4파트 필드 요청 | 레거시 클라이언트가 `cart_rate` 요청 | 필드 무시, 3파트만 반환 |
| Meta API 장애 | 벤치마크 수집 실패 | 마지막 캐시된 벤치마크 사용 |
| ad_account_id 없음 | null/undefined | 400 에러 반환 |
| 총가치수준 0점 | 모든 파트 POOR | gauge 최소값 표시 |

### T3. 모킹 데이터 (Fixture)

```json
// fixtures/protractor-refactoring/diagnose-response.json
{
  "media_id": "cm_test_001",
  "diagnosis": {
    "foundation": { "score": 65, "grade": "FAIR", "metrics": { "three_sec_rate": 0.35, "thruplay_rate": 0.12 } },
    "engagement": { "score": 42, "grade": "POOR", "metrics": { "engagement_rate": 0.018 } },
    "conversion": { "score": 78, "grade": "GOOD", "metrics": { "ctr": 0.023 } }
  }
}

// fixtures/protractor-refactoring/benchmarks-all.json
{
  "creative_type": "ALL",
  "three_sec_rate": 0.30,
  "thruplay_rate": 0.10,
  "ctr": 0.020,
  "engagement_rate": 0.025,
  "updated_at": "2026-03-28T00:00:00Z"
}
```

### T4. 테스트 파일 경로 규약

| 테스트 파일 | 테스트 대상 | 프레임워크 |
|-------------|-------------|------------|
| `__tests__/protractor-refactoring/diagnose-api.test.ts` | 진단 API 3파트 응답 | vitest |
| `__tests__/protractor-refactoring/total-value-api.test.ts` | 총가치수준 게이지 API | vitest |
| `__tests__/protractor-refactoring/benchmark-fetch.test.ts` | ALL 벤치마크 조회 | vitest |
| `__tests__/protractor-refactoring/fixtures/` | JSON fixture 파일 | - |
