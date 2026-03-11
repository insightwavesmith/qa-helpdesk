# 벤치마크 수집/계산 로직 수정 Plan

## 배경
현재 벤치마크 계산에 2가지 문제:
1. **creative_type 분류 오류**: 수동업로드 광고가 CATALOG로 잘못 분류 (object_type=SHARE → 무조건 CATALOG)
2. **계산 방식 왜곡**: 단순 산술 평균 → 이상치(전환율 54% 등)가 벤치마크 왜곡

## 왜 필요한지
- 카탈로그 설정 사용 + 수동업로드 영상/이미지가 CATALOG로 오분류 → 소재 타입별 벤치마크 부정확
- 이상치 1건이 평균을 크게 왜곡 → 벤치마크 신뢰도 저하

## 범위

### 작업 1: creative_type 분류 로직 수정
- `getCreativeType()` — creative 필드(video_id, image_hash) 기반 분류로 변경
- `AD_FIELDS` — video_id, image_hash 필드 추가 요청

### 작업 2: 계산 방식 변경 (Trimmed Weighted Mean)
- `calcGroupAvg()` → `calcTrimmedWeightedAvg()` 변경
- 상하위 10% 제거 + 지표별 가중치 적용

### 작업 3: creative_type별 벤치마크 계산
- ALL + VIDEO + IMAGE + CATALOG 각각 계산
- benchmarks 테이블에 creative_type별 행 생성

## 대상 파일
- `src/app/api/cron/collect-benchmarks/route.ts` (단일 파일)

## 성공 기준
- `npm run build` 성공
- 타입 에러 없음
- 기존 ALL 벤치마크 계산 동작 유지
- creative_type별 벤치마크 행 생성 구조 확인
- DB 마이그레이션 불필요 (unique key에 creative_type 포함)
