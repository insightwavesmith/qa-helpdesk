# 통합 시스템 점검 보고서 (COO + PM)

> 작성일: 2026-04-03
> COO: 모찌 (점검 + PM 대조 + 판정)
> PM: 기획팀 (선행 문서 기반 6단계 분석)
> 점검 프레임워크: 6단계 사고 (의도→역할→선행문서→과거결정충돌→영향범위→옵션+판단)
> 점검 축: **제어(시스템) + 자율성**

---

## Executive Summary

| 항목 | 결과 |
|------|------|
| Brick Dashboard | 프론트 145/145 TDD 완료, **백엔드 API 0% (37개 엔드포인트 미구현)** |
| 크론 파이프라인 | 체인 구조 정상, **Scheduler 미등록 2건(P0)**, 로깅 32% |
| 제어 이슈 | 4건 (백엔드 0%, API 경로 불일치, Scheduler 미등록 2건) |
| 자율성 이슈 | 2건 (로깅 커버리지, 체인 fire-and-forget) |

---

## PM vs COO 대조 결과

| 항목 | PM 보고서 (3/30 데이터 기반) | COO 실시간 점검 (4/3) | 판정 |
|------|---------------------------|---------------------|------|
| Cloud Run Jobs 5개 | code:7 장애 중 | **4/2 전부 정상 실행** | ⚠️ PM 데이터 구버전 |
| video-scene-analysis | Scheduler 미등록 | **등록돼 있음** (video-scene-analysis-daily) | ⚠️ PM 오류 |
| run-prescription | 언급 없음 | **Scheduler 미등록** | COO 신규 발견 |
| Service vs Job 환경변수 | 언급 없음 | **불일치 사고 (오늘 해결)** | COO 신규 발견 |
| Brick 백엔드 0% | 37개 API 전수 조사 | 동일 확인 | ✅ 일치 |
| API 경로 불일치 | `/api/v1` vs `/api/brick` 충돌 | 동일 확인 | ✅ 일치 |
| 로깅 커버리지 | 32% → 전수 적용 추천 | 32% → 핵심 8개 먼저 추천 | 의견 차이 (아래 옵션) |

---

## 1. Brick Dashboard

### 6단계 사고 증거

| 단계 | 내용 |
|------|------|
| ① 의도 | Smith님 비전 "제어+자율성" GUI 구현체. 비개발자 5분 첫 워크플로우 |
| ② 역할 | PM=Design 완료(145 TDD), CTO=백엔드+프론트 구현 미착수 |
| ③ 선행문서 | brick-dashboard.design.md(308 TDD), brick-dashboard-frontend.design.md(145 TDD), brick-architecture.design.md |
| ④ 충돌 | 백엔드 Design `/api/v1/*` vs 프론트 hooks `/api/brick/*` — 경로 불일치 |
| ⑤ 영향 | 프론트 UI 전체 404. "만들기" 버튼 포함 모든 Brick 기능 동작 불가 |
| ⑥ 옵션 | 아래 |

### 이슈 #1: 백엔드 API 0% (Critical, 제어)

프론트에서 호출하는 `/api/brick/*` 37개+ 엔드포인트가 서버에 없음.

```
프론트: /api/brick/presets, /executions, /gates, /learning, /teams, /ws ...
서버:   등록된 brick 라우트 = 0개
```

**옵션:**
- A: 백엔드 먼저 → 프론트 (직렬 7주)
- B: MSW mock 병렬 (6주)
- **C (추천): 백엔드 스텁 3일 → 프론트 동시 착수 (5주)** — Design 308 TDD가 스텁 스펙 역할

### 이슈 #2: API 경로 불일치 (High, 제어)

**결정: `/api/brick/*`으로 통일.** 프론트 hooks 기준. 백엔드 Design의 `/api/v1/`을 수정 (구현 전이라 비용 0).

### 테스트 현황

```
vitest: 235 passed / 1 failed (TC-$04 costs — 기존 dashboard, Brick 무관)
프론트 145건 TDD: mock 기반 통과. 실 API 연결 시 재검증 필요.
```

---

## 2. 크론 파이프라인

### 6단계 사고 증거

| 단계 | 내용 |
|------|------|
| ① 의도 | 수집→저장→분석→처방 자동 파이프라인. 수동 단계 0개가 목표 |
| ② 역할 | CTO=크론 구현+인프라, PM=헬스체크 보고 |
| ③ 선행문서 | cron-health-check.md(3/30), prescription-pipeline-as-is.report.md, prescription-pipeline-v3.design.md |
| ④ 충돌 | PM 문서 2건 오류 (Jobs code:7 해결됨, scene-analysis 이미 등록됨). COO 신규 2건 (run-prescription 미등록, 환경변수 불일치) |
| ⑤ 영향 | run-prescription 미등록 = 처방 자동화 불가. 로깅 32% = 장애 추적 불가 |
| ⑥ 옵션 | 아래 |

### 체인 구조 현황

```
collect-daily (01:00) → process-media → embed-creatives    ✅ 체인 연결
                                      → creative-saliency  ✅ 체인 연결  
                                      → video-saliency     ✅ 체인 연결

saliency ─✖→ video-scene-analysis (Scheduler 독립 05:00으로 커버)
video-scene-analysis ─✖→ run-prescription (아예 연결 없음, Scheduler도 없음)
```

### 이슈 #3: run-prescription Scheduler 미등록 (P0, 제어)

처방 엔진이 자동으로 안 돌아감. V3 Design 완료됐지만 등록 자체가 안 돼있음.

**옵션:**
- A: Scheduler 등록 + scene-analysis에서 triggerNext 체인 연결
- **B (추천): Scheduler 등록(독립 06:00) + 체인도 추가** — 이중 안전장치

### 이슈 #4: discover-accounts Scheduler 미등록 (P0, 제어)

신규 광고 계정 자동 탐지 안 됨.

**결정: 주간 월요일 08:00 KST 등록.**

### 이슈 #5: 로깅 커버리지 32% (P2, 자율성)

| COO 의견 | PM 의견 |
|----------|---------|
| 핵심 체인 8개 먼저 | 28개 전수 적용 |

**판단: PM 의견 채택. 전수 적용.** 로깅은 한 번 적용하면 영구. 부분 적용은 또 사각지대 남김.

### 이슈 #6: fire-and-forget 체인 (P2, 자율성)

triggerNext가 응답 안 기다림 → 다음 단계 실패해도 모름.

**결정: 결과 콜백 + cron_runs 기록 + 실패 시 Slack 알림 (단기). 이벤트 큐는 중장기.**

### 해결 확인된 것 (PM 문서와 차이)

```
✅ Cloud Run Jobs 5개 code:7 → 해결됨 (4/2 정상 실행)
✅ embed-creatives code:13 → 해결됨 (Job 환경변수 수정)
✅ video-scene-analysis → 이미 Scheduler 등록돼 있음
```

---

## 3. 확정 액션 (우선순위)

### 즉시 (오늘~내일)

| # | 액션 | 담당 | 축 | 비고 |
|---|------|------|-----|------|
| 1 | API 경로 `/api/brick/*` 통일 | CTO | 제어 | 백엔드 Design 수정 |
| 2 | run-prescription Scheduler 등록 (06:00 KST) | CTO-1 | 제어 | P0 |
| 3 | discover-accounts Scheduler 등록 (월 08:00 KST) | CTO-1 | 제어 | P0 |
| 4 | saliency→scene-analysis triggerNext 추가 | CTO-1 | 자율성 | 체인 연결 |

### 이번 주

| # | 액션 | 담당 | 축 |
|---|------|------|-----|
| 5 | Brick 백엔드 스텁 → 37개 API 구현 | CTO-1 | 제어 |
| 6 | cron_runs 로깅 28개 전수 적용 | CTO-1 | 자율성 |
| 7 | 체인 콜백 + 실패 Slack 알림 | CTO-1 | 자율성 |
| 8 | vitest 실패 1건 수정 (TC-$04) | CTO-2 | 제어 |

---

## 4. 교훈

### COO 프로세스 실패 2건

1. **첫 점검 시 6단계 3번(선행 문서) 건너뜀** — PM 기존 헬스체크 안 읽고 처음부터 조사
2. **PM 보고서 왔는데 통합 문서 안 만듦** — 슬랙 요약만 던짐

### 구조적 해결

현재: PM 완료 → COO가 알아서 대조+통합 (강제 안 됨)
필요: PM 완료 → **COO 대조 Gate** → 통합 문서 작성 Gate → Smith님 보고
→ Brick Review 블록 + Gate로 구현 가능 (Brick 완성 후)

---

## 5. 문서 참조

| 문서 | 경로 |
|------|------|
| PM 보고서 (원본) | docs/04-report/features/system-review-2026-04-03.report.md |
| PM 크론 헬스체크 (3/30) | docs/reports/ops/cron-health-check.md |
| Brick 백엔드 Design | docs/02-design/features/brick-dashboard.design.md |
| Brick 프론트 Design | docs/02-design/features/brick-dashboard-frontend.design.md |
| V3 처방 Design | docs/02-design/features/prescription-pipeline-v3.design.md |
| 처방 As-Is 보고서 | docs/04-report/features/prescription-pipeline-as-is.report.md |
| 본 통합 보고서 | docs/04-report/features/system-review-integrated-2026-04-03.report.md |
