# 총가치각도기 API 응답속도 개선 Plan

## 배경
총가치각도기 페이지 로드 시 API 응답 합계 10초+, 탭 전환마다 4~5초 대기.
수강생 체감 속도 매우 나쁨.

## 현재 실측
| API | 응답시간 | 비고 |
|-----|----------|------|
| /api/protractor/accounts | 1,217ms | 중복 호출 (2회) |
| /api/sales-summary | 475ms | |
| /api/protractor/insights | 1,273ms | |
| /api/protractor/total-value | 2,126ms | 사전계산 있으나 미활용 |
| /api/protractor/overlap | 4,471ms | 최대 병목 |

## 태스크

### T1. accounts 중복 호출 제거
- **원인**: swr-provider.tsx가 prefetch + real-dashboard.tsx가 useSWR → 같은 키 2회 호출
- **수정**: prefetch 목록에서 PROTRACTOR_ACCOUNTS 제거 (useSWR이 담당)
- **기대**: 네트워크 요청 1회 절감

### T2. overlap 속도 개선
- **원인**: Meta API pair별 호출 (최대 28조합 × 500ms), fetchActiveAdsets 순차 호출
- **수정**:
  1. 계산 완료 후 daily_overlap_insights에 저장 (현재 adset_overlap_cache에만 저장)
  2. fetchActiveAdsets 캠페인별 adset 조회 병렬화
- **기대**: 첫 로드 3초대, 캐시 히트 시 200ms 이내

### T3. total-value 사전계산 활용 확대
- **원인**: PRECOMPUTED_PERIODS = [7, 30, 90]이지만 UI 기본값 period=1(어제)
- **수정**: period 1, 14도 사전계산에 포함
- **기대**: 캐시 히트 시 500ms 이내

### T4. Supabase 쿼리 최적화
- **insights API**: select 컬럼 최적화, date range 필터 인덱스 활용
- **total-value**: fetchBenchmarks 2회 쿼리 → 1회로 통합
- **기대**: 주요 API 평균 1초 이내

## 검증 기준
- `npm run build` 성공
- 전체 로딩 5초 → 2초 이내
- 기존 기능/데이터 정확도 유지

## 하지 말 것
- UI/디자인 변경
- 새 외부 의존성 추가
- 다른 페이지 수정
