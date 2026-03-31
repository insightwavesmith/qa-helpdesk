# Agent Harness v2 (에이전트 하네스 v2) Plan

> 작성일: 2026-03-31
> 프로세스 레벨: L2 (src/ 미수정, .bkit/hooks/ + dashboard/ 수정)
> 작성자: PM팀
> 기획서 원본: `/Users/smith/.openclaw/workspace/docs/agent-team-structure-v2.md`

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 에이전트팀 운영 하네스 v2 — Living Context + COO 게이트 + 단일 상태 파일 + 대시보드 |
| **작성일** | 2026-03-31 |
| **기간** | Phase 1: 즉시 ~ Phase 3: 다음 스프린트 |
| **핵심** | CTO 컨텍스트 유실 근절 + COO 하네스 편입 + 게이트 기반 자동 프로세스 |
| **선행** | pdca-chain-automation(완료), agent-ops-hardening(완료) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | CTO가 새 세션마다 옛 컨텍스트(Supabase)로 작업 + COO 보고 누락 + 빈 체인 신호 + 에러 분류 전부 unknown |
| **Solution** | Living Context 자동 로딩 + COO 게이트(ACK 5분/보고 15분) + task-state 단일 JSON + 대시보드 시각화 |
| **Function UX Effect** | 세션 시작 시 자동으로 필요 문서 로드 → 컨텍스트 유실 0건. COO 타임아웃 감시 → 보고 누락 0건 |
| **Core Value** | 규칙이 아니라 시스템 프로세스로 강제. LLM 판단 0, 파일/숫자/URL만으로 게이트 판정 |

---

## 구현 Feature 분리 (3개)

### Feature 1: living-context (Living Context 시스템)

**범위**: 세션 시작 시 PDCA 단계별 상류 문서 자동 로딩

| # | 산출물 | 파일 경로 |
|---|--------|----------|
| 1-1 | living-context-loader.sh | `.bkit/hooks/helpers/living-context-loader.sh` |
| 1-2 | session-resume-check.sh 수정 (Living Context 호출 추가) | `.bkit/hooks/session-resume-check.sh` |
| 1-3 | PDCA 오염 데이터 10건 정리 | `.bkit/state/pdca-status.json` |

**게이트**: 세션 시작 시 context 파일 ≥ 4개 로드 확인

### Feature 2: coo-harness (COO 하네스 편입)

**범위**: COO 게이트 정의 + 타임아웃 감시 + 상태 추적

| # | 산출물 | 파일 경로 |
|---|--------|----------|
| 2-1 | coo-watchdog.sh | `.bkit/hooks/helpers/coo-watchdog.sh` |
| 2-2 | coo-state.json 초기 구조 | `.bkit/runtime/coo-state.json` |
| 2-3 | coo-ack/ 디렉토리 구조 | `.bkit/runtime/coo-ack/` |
| 2-4 | smith-report/ 디렉토리 구조 | `.bkit/runtime/smith-report/` |
| 2-5 | coo-answers/ 디렉토리 구조 | `.bkit/runtime/coo-answers/` |
| 2-6 | notify-completion.sh (Slack 알림) | `.bkit/hooks/notify-completion.sh` |

**게이트**: COO ACK 타임아웃 알림 정상 발화 + notify-completion.sh 실행 성공

### Feature 3: agent-dashboard-v2 (대시보드 v2)

**범위**: 기존 대시보드에 COO 상태/Living Context/Peers 페이지 추가

| # | 산출물 | 파일 경로 |
|---|--------|----------|
| 3-1 | 목업 v2 (완료) | `docs/mockups/dashboard.html` |
| 3-2 | task-state-{feature}.json 통합 스키마 | `.bkit/runtime/task-state-*.json` |
| 3-3 | detect-work-type.sh | `.bkit/hooks/helpers/detect-work-type.sh` |
| 3-4 | gate-init.sh | `.bkit/hooks/helpers/gate-init.sh` |
| 3-5 | gate-checker.sh 유형별 분기 추가 | `.bkit/hooks/helpers/gate-checker.sh` |
| 3-6 | error-classifier.sh 수정 | `.bkit/hooks/helpers/error-classifier.sh` |
| 3-7 | 대시보드 서버 API 추가 (COO/Context/Peers) | `tools/agent-dashboard/routes/` |
| 3-8 | 대시보드 UI 페이지 3개 | `tools/agent-dashboard/` |

**게이트**: 대시보드 서버 기동 + 3개 신규 페이지 렌더링 확인

---

## 구현 순서

```
Feature 1 (living-context) ──→ Feature 2 (coo-harness)
                                         │
                              ┌──────────┘
                              ▼
                    Feature 3 (agent-dashboard-v2)
```

- Feature 1, 2는 병렬 가능 (독립 스크립트)
- Feature 3은 1, 2 완료 후 (데이터 소스 의존)

---

## 의존성

| Feature | 의존 | 이유 |
|---------|------|------|
| living-context | 없음 | 독립 bash 스크립트 |
| coo-harness | 없음 | 독립 bash 스크립트 |
| agent-dashboard-v2 | living-context + coo-harness | task-state, coo-state JSON을 읽어서 표시 |

---

## 완료 조건

- [ ] living-context-loader.sh: 세션 시작 시 context 파일 ≥ 4개 로드
- [ ] coo-watchdog.sh: ACK 미응답 5분 초과 시 Slack 알림 발화
- [ ] notify-completion.sh: TaskCompleted 시 에러 없이 실행
- [ ] PDCA 오염 데이터 0건 (helpers, .claude 등 제거)
- [ ] 대시보드 목업 v2: COO 상태/Living Context/Peers 3개 페이지 존재
- [ ] task-state JSON: 기존 chain-status + pdca-status 데이터 통합
- [ ] error-classifier.sh: unknown 비율 < 10%

---

## 기술 스택

- Shell script (bash) — hooks, helpers
- Node.js (Bun) — agent-dashboard 서버
- React — 대시보드 UI
- JSON — 상태 파일

---

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| session-resume-check.sh 수정 시 기존 세션 복구 기능 깨짐 | 높음 | 기존 로직 보존, Living Context를 마지막에 추가만 |
| coo-watchdog 크론이 과도한 Slack 알림 발생 | 중간 | debounce 로직 + 동일 TASK 재알림 쿨다운 30분 |
| task-state JSON 마이그레이션 시 기존 chain-status 유실 | 높음 | 마이그레이션 스크립트에서 기존 JSON 백업 후 변환 |
