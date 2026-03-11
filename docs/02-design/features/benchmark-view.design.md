# 벤치마크 뷰 개선 — Design

## 1. 데이터 모델
변경 없음. DB benchmarks 테이블 (wide format):
- `creative_type × ranking_type × ranking_group` 조합
- 14개 지표 컬럼 (video_p3s_rate, thruplay_rate, ... , roas)

## 2. API 설계
변경 없음. `/api/protractor/benchmarks` GET → 전체 벤치마크 반환 (creative_type 포함)

## 3. 컴포넌트 구조

### 3.1 benchmark-admin.tsx 변경

#### 지표 카테고리 정의 (BENCHMARK_CATEGORIES)
| 카테고리 | 지표 | ranking_type |
|----------|------|-------------|
| 기반 | 3초시청률, 완시청률, 잔존율, CTR | engagement |
| 참여 | 반응/만, 댓글/만, 공유/만, 저장/만, 참여/만 | engagement |
| 전환 | 구매전환율, 결제시작률, 결제→구매, ROAS | conversion |

#### 영상 지표 숨김
- `VIDEO_ONLY_KEYS = ["avg_video_p3s_rate", "avg_thruplay_rate", "avg_retention_rate"]`
- IMAGE/CATALOG 탭에서 이 키들 필터링

#### 계산방식 툴팁 (METRIC_FORMULAS)
각 avg_key → 공식 문자열 매핑. Info 아이콘 hover 시 표시.

#### MetricTable 리팩토링
- 기존: ranking_type별 → METRIC_DEFS 전체 표시
- 변경: BENCHMARK_CATEGORIES 순회 → 각 카테고리별 해당 ranking_type 행에서 값 추출

### 3.2 content-ranking.tsx 변경

#### BenchmarkCompareGrid
- `ad.creative_type` 확인
- IMAGE/CATALOG일 때 foundation 그룹(groupKey="foundation") 전체 숨김
- METRIC_GROUPS 순회 시 조건 추가

## 4. 에러 처리
- 해당 creative_type 데이터 없을 때 기존 "데이터 없음" 메시지 유지
- 카테고리 내 모든 지표가 null일 때 카테고리 섹션 숨김

## 5. 구현 순서
1. benchmark-admin.tsx에 BENCHMARK_CATEGORIES, VIDEO_ONLY_KEYS, METRIC_FORMULAS 상수 추가
2. MetricTable → CategoryMetricTable로 리팩토링 (카테고리별 표시)
3. 각 지표 옆 Info 아이콘 + 툴팁 추가
4. IMAGE/CATALOG 탭에서 영상 지표 필터링
5. content-ranking.tsx BenchmarkCompareGrid에 creative_type 조건 추가
6. tsc + lint + build 검증
