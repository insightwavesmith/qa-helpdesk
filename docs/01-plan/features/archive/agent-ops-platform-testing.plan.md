# Agent Ops Platform 통합 테스트 (Comprehensive Testing) Plan

> 작성일: 2026-03-29
> 프로세스 레벨: L2
> Match Rate 기준: **95%**

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | Agent Ops Platform 전체 기능 빠짐없는 TDD — 한 번 돌리면 변수 0 |
| **작성일** | 2026-03-29 |
| **범위** | 에이전트팀 운영 + PDCA 체인 + 대시보드 = 1개 서비스로 통합 검증 |
| **현재** | 기존 TDD 61건 / 설계상 55건 = 116건 (중복 제거 필요 + 누락 다수) |
| **목표** | 10개 영역 × 모든 케이스 = **~150건** TDD → `npx vitest run __tests__/hooks/` 1회 실행으로 전체 검증 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 개별 유닛은 있으나 통합 흐름 테스트 0건. 끊기는 지점 모름. 배포 후 장애 가능 |
| **Solution** | 10개 영역 모든 케이스 빠짐없이 TDD. 한 번 Green이면 출시 가능 |
| **Core Value** | 변수 0. Red 1건 = 장애 원인 사전 발견 |

---

## 1. 배경

에이전트팀 운영(Wave 0~4), 대시보드, PDCA 체인 자동화는 분리된 기능이 아니라 **하나의 서비스**:
- TASK 던지기 → CTO 개발 → 자체 QA → PM 검수 → COO 보고 → Smith님 판단

이 전체 흐름에서 **어느 한 지점이라도 테스트 안 된 채 배포하면 그게 장애 원인**. 기존 61건 TDD는 개별 유닛 위주라 통합 흐름, 경계 조건, 에러 복구가 부족하다.

---

## 2. 테스트 영역 (10개)

| # | 영역 | 현재 | 목표 | 핵심 검증 |
|---|------|:----:|:----:|----------|
| 1 | TASK 소유권 (frontmatter) | 5건 | 12건 | 파싱 정확성 + 크로스팀 차단 |
| 2 | 팀 생성/역할 경계 | 0건 | 8건 | spawn 권한 + team-context |
| 3 | 팀원 관리 (registry) | 4건 | 14건 | 상태 전이 + 좀비 감지 |
| 4 | auto-shutdown | 7건 | 12건 | 3단계 + 리더 보호 + 레지스트리 |
| 5 | force-team-kill | 3건 | 8건 | 리더 BLOCK + tmux 없는 환경 |
| 6 | MCP 통신 | 12건 | 18건 | 전송/수신/ACK/broker 장애 |
| 7 | webhook wake | 5건 | 7건 | 정상/토큰/watcher 체인 |
| 8 | PDCA 체인 | 0건 | 25건 | CTO→PM→COO 전체 + 반려 루프 |
| 9 | 대시보드 | 0건 | 30건 | API/WS/watcher/broker/tunnel |
| 10 | 품질 게이트 | 0건 | 10건 | tsc/build/gap/pdca/Match Rate |
| | **합계** | **36건** | **~144건** | |

> "현재"는 실제 구현된 테스트. "설계상 정의됨(Red 미작성)"은 제외.

---

## 3. 성공 기준

### P0 (필수)
- [ ] `npx vitest run __tests__/hooks/` → **전부 Green** (Red 0건)
- [ ] 10개 영역 모든 케이스 커버 (누락 0)
- [ ] CTO→PM→COO 전체 체인 E2E 통과
- [ ] 대시보드 API + WS + 파일 감지 통합 통과
- [ ] broker alive/dead/not_installed 3가지 상태 전부 통과

### P1 (권장)
- [ ] 에러 복구 테스트 전부 통과 (partial JSON, watcher 죽음, 포트 충돌)
- [ ] Match Rate 경계값 (94%, 95%, 96%) 전부 통과
- [ ] 역방향 피드백 체인 (Smith반려→COO→PM→CTO) 통과

---

## 4. 파일 구조

```
__tests__/hooks/
├── frontmatter-parser.test.ts     (기존 5건 → 12건)
├── team-context.test.ts           (신규 8건)
├── teammate-registry.test.ts      (기존 4건 → 14건)
├── auto-shutdown.test.ts          (기존 7건 → 12건)
├── force-team-kill.test.ts        (기존 3건 → 8건)
├── peers-mcp.test.ts              (기존 8건 → 18건)
├── peers-wake-watcher.test.ts     (기존 5건 → 7건)
├── peers-lifecycle.test.ts        (기존 4건 → 유지)
├── pdca-chain-handoff.test.ts     (신규 25건)
├── dashboard-api.test.ts          (신규 10건)
├── dashboard-ws.test.ts           (신규 12건)
├── dashboard-broker.test.ts       (신규 8건)
├── quality-gate.test.ts           (신규 10건)
├── auto-team-cleanup.test.ts      (기존 2건 → 유지)
├── regression.test.ts             (기존 17건 → 유지)
├── teammate-idle.test.ts          (기존 6건 → 유지)
├── helpers.ts                     (공통 헬퍼 확장)
└── fixtures/
    ├── (기존 17개)
    ├── analysis_pass.md           (신규)
    ├── analysis_fail.md           (신규)
    ├── analysis_malformed.md      (신규)
    ├── team_context_pm.json       (신규)
    ├── pdca_status_sample.json    (신규)
    └── broker_messages_sample.db  (신규)
```

---

## 5. 구현 순서

### Wave 1: 기존 테스트 보강 (영역 1~5)
- frontmatter-parser +7건
- team-context 신규 8건
- teammate-registry +10건
- auto-shutdown +5건
- force-team-kill +5건

### Wave 2: 신규 영역 (6~8)
- peers-mcp +6건 (MCP 통신 보강)
- peers-wake-watcher +2건
- pdca-chain-handoff 신규 25건

### Wave 3: 대시보드 + 품질 게이트 (9~10)
- dashboard-api 신규 10건
- dashboard-ws 신규 12건
- dashboard-broker 신규 8건
- quality-gate 신규 10건

### Wave 4: 전체 실행 + Gap 분석
- `npx vitest run __tests__/hooks/` 전체 실행
- Red 0건 확인
- Gap 분석 → `docs/03-analysis/agent-ops-platform-testing.analysis.md`

---

## 하지 말 것
- src/ 코드 수정 (테스트만)
- 기존 통과하는 테스트 삭제/수정
- 대시보드 서버 구현 (테스트 작성만 — 구현은 별도 TASK)
- Mock 과다 사용 (실제 hook 스크립트 실행 우선)
