# TASK: 사전계산 Phase 1 — 크론 후 자동 계산 + DB 캐시 + 폴백

> 참고: `docs/precompute-audit.md` (전수 조사 결과)

---

## 빌드/테스트
- `npm run build` 성공 필수
- 기존 API 엔드포인트 동작 그대로 유지 (폴백)
- 사전계산 테이블 비어있어도 기존 실시간 계산으로 자동 전환

---

## T1. T3 총가치각도기 점수 사전계산

### 이게 뭔지
collect-daily 크론 완료 후 전 광고계정의 T3 점수를 자동 계산해서 DB에 저장. 프론트에서는 사전계산 테이블을 먼저 조회하고, 없으면 기존 실시간 계산으로 폴백.

### 왜 필요한지
현재 총가치각도기 페이지 로드 시 1K~50K행의 daily_ad_insights를 매번 루프 돌면서 14개 지표 계산 → 100~300ms 지연. 사전계산하면 50ms 이하로 단축. 관리자 + 수강생 모두 사용하는 핵심 대시보드.

### 파일
- `src/app/api/protractor/total-value/route.ts` (기존 — 폴백 유지)
- `src/lib/protractor/t3-engine.ts` (기존 계산 로직 — 재사용)
- `src/lib/cron/collect-daily.ts` (기존 — 크론 완료 후 사전계산 호출 추가)
- 신규: 사전계산 실행 모듈
- 신규: Supabase 테이블 `t3_scores_precomputed`

### 검증 기준
- collect-daily 크론 실행 후 `t3_scores_precomputed` 테이블에 계정별 × 기간별(7/30/90일) × 크리에이티브별(ALL/VIDEO/IMAGE/CATALOG) 행 생성됨
- `/api/protractor/total-value` 호출 시 사전계산 테이블 우선 조회
- 사전계산 테이블이 비어있으면 기존 실시간 계산으로 폴백 (기존 동작 100% 동일)
- `npm run build` 성공
- 기존 총가치각도기 UI에서 점수/등급 동일하게 표시

### 하지 말 것
- 기존 t3-engine.ts 계산 로직 변경 금지 (재사용만)
- 기존 API route 삭제 금지 (폴백 유지)
- 프론트 UI 변경 금지 (데이터 소스만 바뀜)

---

## T2. 수강생 성과 분석 사전계산

### 이게 뭔지
collect-daily 크론 완료 후 전 수강생의 성과 지표(spend/revenue/roas/t3_score/t3_grade)를 일괄 계산해서 DB에 저장. 관리자 성과 페이지에서는 사전계산 테이블만 SELECT.

### 왜 필요한지
현재 `/admin/performance` 로드 시 수강생 20~30명 × 30일 × 광고 N개 = 수만 행을 for 루프로 순회하며 T3 점수까지 계산 → 500ms~2초 지연. 수강생 수 늘어나면 더 느려짐. 사전계산하면 100ms 이하.

### 파일
- `src/actions/performance.ts` (기존 — 폴백 유지)
- `src/lib/cron/collect-daily.ts` (기존 — 크론 완료 후 호출)
- 신규: 사전계산 실행 모듈
- 신규: Supabase 테이블 `student_performance_daily`

### 검증 기준
- collect-daily 크론 실행 후 `student_performance_daily` 테이블에 수강생별 × 기간별 행 생성됨
- 각 행에 student_id, period, spend, revenue, roas, t3_score, t3_grade, computed_at 포함
- `/admin/performance` 페이지에서 사전계산 데이터 우선 표시
- 사전계산 없으면 기존 실시간 계산 폴백 (기존 동작 동일)
- `npm run build` 성공

### 하지 말 것
- 기존 performance.ts 삭제 금지 (폴백)
- 수강생 프로필/역할 로직 변경 금지
- 관리자 UI 레이아웃 변경 금지

---

## T3. 광고 진단 사전계산

### 이게 뭔지
collect-daily 크론 완료 후 계정별 상위 광고(spend 기준)의 진단 결과를 미리 계산해서 DB에 저장. 진단 탭 로드 시 JSON 캐시만 읽기.

### 왜 필요한지
현재 진단 탭 로드 시 1000행 조회 → ad_id별 그룹화 → 상위 5개 광고 × 12개 판정(6파트 × 2지표) 계산 → 50~150ms. 사전계산하면 30ms 이하. 관리자 + 수강생 모두 사용.

### 파일
- `src/app/api/diagnose/route.ts` (기존 — 폴백 유지)
- `src/lib/diagnosis/engine.ts` (기존 계산 로직 — 재사용)
- `src/lib/cron/collect-daily.ts` (기존 — 크론 완료 후 호출)
- 신규: 사전계산 실행 모듈
- 신규: Supabase 테이블 `ad_diagnosis_cache`

### 검증 기준
- collect-daily 크론 실행 후 `ad_diagnosis_cache` 테이블에 계정별 상위 광고 진단 결과 저장됨
- 각 행에 account_id, ad_id, verdict, parts_json, one_liner, computed_at 포함
- `/api/diagnose` 호출 시 캐시 테이블 우선 조회
- 캐시 없으면 기존 실시간 진단 폴백
- `npm run build` 성공

### 하지 말 것
- 기존 diagnosis/engine.ts 판정 로직 변경 금지
- 기존 diagnose API 삭제 금지
- 벤치마크 데이터 구조 변경 금지

---

## 공통 주의사항
- 모든 신규 테이블에 `computed_at` 타임스탬프 필수
- 프론트에서 "마지막 계산: {computed_at}" 표시 추가 (작은 텍스트)
- Supabase Migration은 `supabase/migrations/` 폴더에 SQL 파일 생성
- RLS 정책: 기존 테이블 패턴 따르기 (admin 읽기/쓰기, student 읽기만)
