# 성능 코드 리뷰 설계서

## 1. 데이터 모델
변경 없음 (DB 스키마 수정 없음)

## 2. API 설계

### T2. overlap API 병렬화
- **변경 파일**: `src/app/api/protractor/overlap/route.ts`
- **변경 내용**: 208~267줄 이중 for 루프 → Promise.allSettled 병렬화
- **concurrency**: 동시 5개 제한 (Meta rate limit 고려)
- **에러 격리**: 개별 pair 실패 시 skip, 나머지 정상 반환
- **DB upsert**: 각 pair 완료 후 개별 upsert (기존 동작 유지)

### T3. total-value select 최적화
- **변경 파일**: `src/app/api/protractor/total-value/route.ts`
- **변경 내용**: `.select("*").limit(1000)` → `.select("spend,impressions,reach,clicks,purchases,purchase_value,date,ad_id")` (limit 제거)

### T4. insights 안전장치
- **변경 파일**: `src/app/api/protractor/insights/route.ts`
- **변경 내용**:
  - `.select("*")` → 필요 컬럼만 select
  - start/end 미입력 시 기본 최근 90일 제한
  - `.limit(10000)` 상한 추가 (OOM 방지)

## 3. 컴포넌트 구조

### T1. SWR 프리페치 검증
- **검증 대상 파일들**:
  - `src/components/providers/swr-provider.tsx` (프리페치)
  - `src/lib/swr/keys.ts` (키 상수)
  - `src/app/(main)/protractor/real-dashboard.tsx` (소비)
  - `src/components/dashboard/SalesSummary.tsx` (소비)
  - `src/app/(main)/protractor/competitor/components/monitor-panel.tsx` (소비)
- **결과**: 3개 프리페치 키 모두 페이지에서 동일 SWR_KEYS 상수 사용 → 키 일치 확인됨
- **수정 불필요** (설정도 적절)

## 4. 에러 처리
- T2: 개별 pair 실패 → catch에서 skip (기존 동작 유지)
- T4: 기간 미입력 → 기본 90일 적용 (400 에러 아닌 기본값)

## 5. 구현 순서
1. [backend-dev] T3: total-value limit 제거 + select 최적화
2. [backend-dev] T4: insights 안전장치 + select 최적화
3. [backend-dev] T2: overlap 병렬화
4. [qa-engineer] T1: SWR 프리페치 검증 리포트 + 전체 빌드 검증
