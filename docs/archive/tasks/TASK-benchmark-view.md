# TASK: 벤치마크 뷰 개선 — 크리에이티브 타입별 벤치마크 + 계산방식 표시

## 배경
벤치마크 수집 로직이 개선됨 (커밋 `21a8bb2`, `071c4ca`):
- creative_type 정확 분류 (VIDEO / IMAGE / CATALOG)
- Trimmed Weighted Mean 계산방식
- impressions >= 3500 필터
- creative_type별 벤치마크 데이터 DB에 이미 저장됨

이제 프론트엔드에서 이 데이터를 소재타입별로 보여줘야 한다.

## 현재 구조
- **진단 API** (`/api/diagnose/route.ts`): 이미 `creative_type`별 벤치마크 매칭 완료
  - 광고의 `creative_type`에 맞는 벤치마크 ABOVE_AVERAGE 값으로 비교
  - `gcpBenchmarks[ct][rt]` 구조로 VIDEO/IMAGE/CATALOG 분리
- **벤치마크 API** (`/api/protractor/benchmarks/route.ts`): 전체 조회 (creative_type 포함)
- **벤치마크 관리** (`admin/protractor/benchmarks/page.tsx`): admin 전용 raw 데이터
- **총가치각도기** (`protractor/components/content-ranking.tsx`): 수강생 광고별 벤치마크 비교 표시
- **벤치마크 탭** (`protractor/components/benchmark-admin.tsx`): 관리자 벤치마크 현황

## 작업 1: 벤치마크 관리 탭 개선 (benchmark-admin.tsx)

### 현재
- creative_type 구분 없이 ALL만 표시

### 변경
- 탭 추가: **전체(ALL)** / **영상(VIDEO)** / **이미지(IMAGE)** / **카탈로그(CATALOG)**
- 각 탭 선택 시 해당 creative_type의 벤치마크 표시
- 지표 카테고리 3개로 그룹핑:
  1. **기반**: 3초시청률, 완시청률, 잔존율, CTR → 참여율순위(engagement) 기준
  2. **참여**: 반응/만, 댓글/만, 공유/만, 저장/만, 참여/만 → 참여율순위(engagement) 기준
  3. **전환**: 구매전환율, 결제시작률, 결제→구매, ROAS → 전환율순위(conversion) 기준

### 핵심 규칙
- **기반 + 참여** 지표 → `ranking_type = 'engagement'` 기준으로 ABOVE/AVERAGE/BELOW 표시
- **전환** 지표 → `ranking_type = 'conversion'` 기준으로 ABOVE/AVERAGE/BELOW 표시
- IMAGE 탭에서는 영상 지표(3초시청률, 완시청률, 잔존율) 숨기기
- CATALOG 탭에서도 영상 지표 숨기기

### 계산방식 툴팁
각 지표 옆에 info 아이콘 → 호버 시 공식 표시:
- 3초시청률: "3초 재생수 ÷ 노출수 × 100 (Trimmed 가중평균, impressions 가중)"
- 완시청률: "ThruPlay수 ÷ 노출수 × 100"
- 잔존율: "100%시청수 ÷ 3초시청수 × 100"
- CTR: "클릭수 ÷ 노출수 × 100"
- 반응/만: "반응수 ÷ 노출수 × 10,000"
- 댓글/만: "댓글수 ÷ 노출수 × 10,000"
- 공유/만: "공유수 ÷ 노출수 × 10,000"
- 저장/만: "저장수 ÷ 노출수 × 10,000"
- 참여/만: "(반응+댓글+공유+저장) ÷ 노출수 × 10,000"
- 구매전환율: "구매수 ÷ 클릭수 × 100 (clicks 가중)"
- 결제시작률: "결제시작수 ÷ 클릭수 × 100"
- 결제→구매: "구매수 ÷ 결제시작수 × 100"
- ROAS: "구매매출 ÷ 광고비 (spend 가중)"

## 작업 2: 총가치각도기 벤치마크 비교 (content-ranking.tsx)

### 현재
- 수강생 광고별로 진단 API 결과에서 벤치마크 비교 표시
- 진단 API가 이미 creative_type별 벤치마크 매칭 중

### 확인/수정 사항
- 진단 API의 `adCreativeType` 매칭이 새 분류(VIDEO/IMAGE/CATALOG)와 일치하는지 확인
- 카탈로그 광고에 대해서는 CTR, 참여, 구매전환율만 벤치마크 비교 표시 (기반 영상 지표 제외)
- 이미지 광고에 대해서도 영상 지표 제외

## 작업 순서
1. benchmark-admin.tsx에 creative_type 탭 추가
2. 지표 카테고리 3개 그룹핑 (기반/참여/전환) + 각 랭킹 기준 매핑
3. 각 지표 옆에 계산방식 툴팁 추가
4. IMAGE/CATALOG 탭에서 영상 지표 숨기기
5. content-ranking.tsx에서 creative_type별 영상 지표 표시/숨김 처리
6. 빌드 검증 (tsc + lint + build)
7. 커밋 + 푸시

## 참고
- 벤치마크 DB에 VIDEO/IMAGE/CATALOG 행이 이미 존재함
- 벤치마크 API(`/api/protractor/benchmarks`)는 creative_type 포함하여 전체 반환
- 프론트에서 creative_type으로 필터링하면 됨
- 계산방식: Trimmed Weighted Mean (상하10% 제거 + 규모 가중)
