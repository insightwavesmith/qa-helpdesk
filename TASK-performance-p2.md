# TASK: 성능 개선 P2 — 중기 (캐시 아키텍처 + 번들 최적화)

---

## 빌드/테스트
- `npm run build` 성공 필수
- 기존 기능 깨지지 않아야 함
- 폴백 패턴: 캐시 히트 → 빠르게 / 캐시 미스 → 기존 그대로 동작

## 참고
- `docs/performance-analysis.md` 보고서 기반
- P0+P1 커밋 `51cb1c5` 위에서 작업

---

## T1. Overlap cron 백그라운드 갱신

### 이게 뭔지
현재 사용자 요청 시 Meta API 동기 호출 → 4.5초 대기. 이걸 cron에서 미리 계산해놓고, 사용자 요청 시 캐시만 반환.

### 왜 필요한지
overlap이 전체 병목의 54%. cron으로 옮기면 사용자 대기 시간 100ms 이내.

### 구현 방향
- `/api/cron/compute-overlap` 새 라우트 생성
- collect-daily 크론 완료 후 호출 (기존 사전계산 패턴 동일)
- 모든 활성 계정 × [1,7,14,30,90] 기간 조합 사전계산
- `daily_overlap_insights` 테이블에 upsert (이미 존재하는 테이블)
- 사용자 API: DB 캐시 조회 → 24시간 이내면 즉시 반환 → 없으면 기존 실시간 계산

### 검증
- cron 호출 시 overlap 데이터가 DB에 저장됨
- 사용자 API 호출 시 캐시 히트 → 500ms 이내

---

## T2. insights 사전계산 캐시

### 이게 뭔지
daily_ad_insights를 매번 5,000행 가져와서 클라이언트에서 집계. 이걸 서버에서 사전집계.

### 왜 필요한지
insights API 1.2초 → 사전집계 시 200ms 이내.

### 구현 방향
- `insights_aggregated_daily` 테이블 신규 생성 (마이그레이션 SQL 작성)
- 계정별 + 기간별 집계 데이터 저장 (spend, revenue, impressions, clicks 등)
- collect-daily 크론 후 집계 실행
- insights API: 집계 테이블 우선 조회 → 미스 시 기존 raw 쿼리 폴백

### 검증
- 사전집계 데이터 존재 시 insights API 500ms 이내
- 미존재 시 기존대로 동작

---

## T3. Recharts 제거 → 경량 대체

### 이게 뭔지
Recharts (~600KB)가 admin/knowledge 1곳에서만 사용됨. 번들 비효율.

### 왜 필요한지
전체 번들에서 600KB 차지. 수강생 페이지에서도 이 번들이 로드될 수 있음.

### 구현 방향
- admin/knowledge의 차트를 경량 라이브러리로 대체 (Chart.js lite 또는 직접 SVG)
- 또는 Recharts를 dynamic import로 해당 페이지에서만 로드
- package.json에서 recharts 제거 (대체 시)

### 검증
- admin/knowledge 차트가 정상 렌더링
- `npm run build` 성공
- 번들 크기 감소 확인

---

## DB 마이그레이션
- T1: 기존 `daily_overlap_insights` 활용 (신규 테이블 불필요)
- T2: `insights_aggregated_daily` 신규 테이블 필요 → `supabase/migrations/` 에 SQL 작성 (내가 실행할 거임)

## 하지 말 것
- 수강생 페이지 UI 변경 금지
- 기존 API 응답 형태 변경 금지 (호환성 유지)
- Meta API 호출 로직 변경 금지 (cron에서 기존 로직 그대로 호출)
