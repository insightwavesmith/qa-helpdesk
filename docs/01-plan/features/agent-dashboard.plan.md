# 에이전트 대시보드 계획서

> **작성일**: 2026-03-24
> **작성자**: Leader (PM팀 기획)
> **상태**: Plan 완료
> **목업 참조**: mozzi-reports.vercel.app/dashboard (정적 HTML)

---

## 1. 개요

### 기능 설명
CEO/COO가 3개 에이전트팀(PM팀, 마케팅팀, CTO팀)의 작업 현황을 실시간으로 모니터링하는 통합 대시보드.
현재 정적 HTML 목업(`mozzi-reports.vercel.app/dashboard`)을 실시간 서비스로 전환한다.

### 해결하려는 문제
- **가시성 부재**: 3팀이 각자 bkit PDCA로 운영 중이나, 팀 간 진행 상태를 한눈에 볼 수 없음
- **소통 단절**: 팀 간 메시지/피드백이 각 세션에 흩어져 있어 CEO/COO가 흐름 파악 불가
- **백그라운드 블라인드**: backfill, embedding, saliency 등 장시간 작업의 진행률을 확인하려면 각 터미널에 접속해야 함
- **PDCA 상태 파편화**: 각 프로젝트의 `.pdca-status.json`이 개별 파일로 존재, 통합 뷰 없음
- **조직 구조 비가시화**: 누가 어떤 팀에서 어떤 모델로 돌아가는지 한눈에 안 보임
- **알림 부재**: 작업 시작/완료, 팀 간 체인 전달, 에러 발생 등 중요 이벤트를 CEO가 실시간으로 감지할 수 없음. Smith님이 슬랙으로 일하므로 슬랙 채널로 푸시 필요

### 배경/맥락
- 회사 구조: CEO(Smith) → COO(모찌) → PM팀 / 마케팅팀 / CTO팀
- 3팀 모두 bkit PDCA 워크플로우로 운영
- 현재 목업은 state.json 파일을 10초 폴링하는 정적 HTML
- 이를 실시간 데이터 연동 서비스로 격상 필요
- **CEO(Smith님)가 슬랙으로 업무** — 슬랙 봇 토큰(SLACK_BOT_TOKEN) 보유, 주요 이벤트를 슬랙으로 받아야 함

---

## 2. 핵심 요구사항

### 기능적 요구사항

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-01 | **조직도 표시**: CEO → COO → 3팀 계층 구조를 시각적으로 표현 | P0 |
| FR-02 | **팀별 작업 현황**: 각 팀의 현재 TASK 목록과 상태(완료/진행/대기) 실시간 표시 | P0 |
| FR-03 | **팀원 정보**: 각 팀의 에이전트 멤버, 사용 모델(Opus/Sonnet/Haiku), 역할 표시 | P0 |
| FR-04 | **팀 간 소통 로그**: 팀 간 메시지를 시간순으로 실시간 표시 | P0 |
| FR-05 | **백그라운드 작업 진행률**: 팀별 장기 작업(backfill, embedding 등)의 진행 바 표시 | P0 |
| FR-06 | **PDCA 상태 연동**: `.pdca-status.json`의 feature별 phase/matchRate 실시간 반영 | P0 |
| FR-07 | **팀 활성 상태**: 각 팀의 운영 상태(active/planned/idle) 표시 | P1 |
| FR-08 | **LIVE 인디케이터**: 데이터 업데이트 시각 및 연결 상태 표시 | P1 |
| FR-09 | **PDCA 히스토리 요약**: 완료된 feature 수, 평균 matchRate 등 집계 통계 | P2 |
| FR-10 | **대시보드 알림/이벤트**: 중요 상태 변경 시 대시보드 내 하이라이트 | P2 |
| FR-11 | **슬랙 — 작업 시작/완료 알림**: 각 팀이 TASK 시작/완료할 때 해당 팀 채널에 슬랙 알림 | P0 |
| FR-12 | **슬랙 — 팀 간 체인 전달 알림**: PM기획완료→CTO구현시작, CTO구현완료→마케팅검증시작 등 팀 간 작업 체인 전달 시 양쪽 채널 + CEO DM에 알림 | P0 |
| FR-13 | **슬랙 — 중요 이벤트 알림**: 배포 완료, 에러/장애 발생, 승인 필요(PR 리뷰 등) 시 CEO DM + 해당 팀 채널에 알림 | P0 |
| FR-14 | **슬랙 — 채널/DM 구분**: 팀별 전용 채널(#agent-pm, #agent-marketing, #agent-cto) + CEO DM으로 알림 라우팅 | P1 |

### 비기능적 요구사항

| ID | 요구사항 | 기준값 |
|----|---------|-------|
| NFR-01 | 실시간 갱신 지연 | < 5초 (상태 변경 → 대시보드 반영) |
| NFR-02 | 대시보드 초기 로딩 | < 2초 |
| NFR-03 | 동시 접속 | CEO + COO + 팀 리더 3명 = 최소 5명 |
| NFR-04 | 데이터 보존 | 소통 로그 최근 7일, PDCA 상태 영구 |
| NFR-05 | 반응형 | 데스크탑(1920px) + 태블릿(768px) |
| NFR-06 | 보안 | 사내 인증 필수 (외부 접근 차단) |

---

## 3. 용어 정의

| 용어 | 설명 |
|------|------|
| 에이전트팀 | Claude Code 에이전트로 구성된 작업 단위. PM팀/마케팅팀/CTO팀 3개 |
| 팀 리더 | 각 에이전트팀의 리더 에이전트 (pm-lead, marketing-lead, cto-lead) |
| 팀원 | 팀 내 개별 에이전트 (frontend-dev, backend-dev 등) |
| state.json | 각 팀의 현재 상태를 담는 JSON 파일 (목업 기준 형식) |
| .pdca-status.json | bkit PDCA 워크플로우의 feature별 진행 상태 파일 |
| 소통 로그 | 팀 간 주고받은 메시지/피드백 기록 |
| 백그라운드 작업 | backfill, embedding, saliency 등 장시간 비동기 작업 |
| matchRate | PDCA Check 단계에서 설계 vs 구현 일치율 (%) |
| LIVE 상태 | 대시보드가 데이터 소스와 실시간 연결된 상태 |
| 슬랙 알림 | Slack Bot API를 통해 팀 채널/CEO DM으로 전송되는 이벤트 알림 |
| 체인 전달 | 팀 A의 작업 완료가 팀 B의 작업 시작을 트리거하는 워크플로우 (PM→CTO→마케팅 등) |
| SLACK_BOT_TOKEN | 슬랙 봇 인증 토큰 (환경변수). chat:write, im:write 스코프 필요 |

---

## 4. 범위

### 포함 (In Scope)

#### Phase 1 — MVP (이번 기획 대상)
- 조직도 (정적 렌더링, 3팀 계층)
- 팀별 카드: 팀명, 상태, 멤버 목록, 모델 정보
- 팀별 TASK 목록 (상태 아이콘: ✓ 완료, → 진행, ○ 대기)
- 팀 간 소통 로그 (시간순, 발신자 표시)
- 백그라운드 작업 진행 바 (팀별 분리)
- PDCA 상태 패널 (.pdca-status.json 연동)
- LIVE 인디케이터 + 마지막 업데이트 시각
- 5초 간격 폴링 → SSE 전환 가능 구조
- **슬랙 알림 시스템** (SLACK_BOT_TOKEN 연동)
  - 팀별 채널 알림 (#agent-pm, #agent-marketing, #agent-cto)
  - CEO DM 알림 (중요 이벤트)
  - 작업 시작/완료 알림
  - 팀 간 체인 전달 알림 (PM→CTO→마케팅)
  - 중요 이벤트 알림 (배포, 에러, 승인 필요)

#### Phase 2 — 확장 (추후)
- Supabase Realtime WebSocket 연동
- 대시보드 내 토스트 알림 (중요 이벤트)
- PDCA 타임라인 시각화
- 팀별 성과 통계 (완료 feature 수, 평균 matchRate)
- 모바일 반응형 최적화
- 슬랙 인터랙티브 메시지 (버튼으로 승인/거절)

### 제외 (Out of Scope)
- 대시보드에서 직접 TASK 생성/수정 (읽기 전용)
- 에이전트 세션 원격 제어
- 디스코드 연동
- 다크모드 (라이트모드만, CLAUDE.md 규칙)
- 슬랙 스레드 자동 생성 (Phase 2 고려)

---

## 5. 데이터 소스 분석

### 현재 목업 데이터 구조 (state.json)

```jsonc
{
  "updatedAt": "2026-03-24T23:12:32+09:00",
  "teams": {
    "pm": {
      "name": "PM팀",
      "emoji": "📋",
      "status": "active" | "planned",
      "color": "#8b5cf6",
      "members": [{ "name": "pm-lead", "model": "opus" }],
      "tasks": [{ "title": "...", "status": "done" | "active" | "pending" }]
    }
    // cto, marketing 동일 구조
  },
  "logs": [
    { "time": "14:30", "from": "pm-lead", "msg": "..." }
  ],
  "background": {
    "backfill": { "current": 2847, "total": 3096, "label": "📦 backfill", "color": "#6366f1" }
  }
}
```

### .pdca-status.json 구조

```jsonc
{
  "version": "3.0",
  "lastUpdated": "2026-03-24T11:40:00.000Z",
  "features": {
    "feature-name": {
      "phase": "completed" | "planning" | "designing" | "implementing" | "checking",
      "matchRate": 100,
      "documents": { "plan": "...", "design": "...", "analysis": "..." },
      "startedAt": "2026-03-18",
      "completedAt": "2026-03-18",
      "notes": "..."
    }
  }
}
```

### 데이터 흐름 (목표 아키텍처)

```
[CTO팀 세션] ─┐                                                    ┌→ 대시보드 UI
[PM팀 세션]  ──┼─→ /tmp/cross-team/{team}/state.json ─→ API Route ─┤
[마케팅팀 세션]─┘         │                                ↑        └→ 슬랙 알림
                         │                         .pdca-status.json     │
                         │                         (각 프로젝트)          ↓
                         └─→ 이벤트 감지 ──────────────────────→ Slack Bot API
                             (작업 시작/완료,                    ├ #agent-pm
                              체인 전달,                         ├ #agent-marketing
                              에러/배포)                         ├ #agent-cto
                                                                └ CEO DM (Smith)
```

### 슬랙 채널 구조

| 채널/DM | 용도 | 수신 이벤트 |
|---------|------|-----------|
| `#agent-pm` | PM팀 전용 채널 | PM팀 작업 시작/완료, PM팀 관련 체인 전달 |
| `#agent-marketing` | 마케팅팀 전용 채널 | 마케팅팀 작업 시작/완료, 마케팅 관련 체인 전달 |
| `#agent-cto` | CTO팀 전용 채널 | CTO팀 작업 시작/완료, 배포/에러, CTO 관련 체인 전달 |
| CEO DM (Smith) | CEO 직접 알림 | **모든** 체인 전달, 중요 이벤트(에러, 배포 완료, 승인 필요) |

### 슬랙 알림 이벤트 정의

| 이벤트 | 트리거 조건 | 수신처 | 우선순위 |
|--------|-----------|--------|---------|
| `task.started` | 팀이 TASK 작업 시작 | 해당 팀 채널 | 일반 |
| `task.completed` | 팀이 TASK 작업 완료 | 해당 팀 채널 | 일반 |
| `chain.handoff` | 팀 A 완료 → 팀 B 시작 필요 | 양쪽 팀 채널 + CEO DM | 중요 |
| `deploy.completed` | 배포(Vercel/Railway) 완료 | #agent-cto + CEO DM | 중요 |
| `error.critical` | 빌드 실패, 런타임 에러 | 해당 팀 채널 + CEO DM | 긴급 |
| `approval.needed` | PR 리뷰, Plan 승인 필요 | CEO DM | 중요 |
| `pdca.phase_change` | PDCA 단계 전환 (planning→designing 등) | 해당 팀 채널 | 일반 |
| `background.completed` | 백그라운드 장기 작업 완료 | 해당 팀 채널 | 일반 |

### 슬랙 메시지 형식 (Block Kit)

```
┌─────────────────────────────────────────┐
│ 🔗 체인 전달: PM팀 → CTO팀              │
│ ───────────────────────────────────────  │
│ PM팀이 [agent-dashboard] 기획을 완료했습니다. │
│ CTO팀 구현 착수가 필요합니다.              │
│                                          │
│ 📋 Plan: agent-dashboard.plan.md         │
│ 📐 Design: agent-dashboard.design.md     │
│ ⏱ 완료 시각: 2026-03-24 23:30           │
│                                          │
│ [대시보드에서 보기]                        │
└─────────────────────────────────────────┘
```

---

## 6. 조직 구조

```
CEO (Smith)
 └── COO (모찌)
      ├── PM팀 — 제품 기획, PRD, PDCA Plan
      │   ├── pm-lead (opus) — 기획 총괄
      │   ├── pm-discovery (sonnet) — 시장 조사
      │   └── pm-prd (sonnet) — PRD 작성
      │
      ├── 마케팅팀 — 광고 분석, 벤치마크, 크리에이티브
      │   ├── marketing-strategist (opus) — 전략 총괄
      │   ├── creative-analyst (sonnet) — 소재 분석
      │   ├── benchmark-analyst (sonnet) — 벤치마크
      │   └── lp-analyst (haiku) — LP 분석
      │
      └── CTO팀 — 개발, 인프라, QA
          ├── cto-lead (opus) — 기술 총괄
          ├── frontend-dev (sonnet) — 프론트엔드
          ├── backend-dev (sonnet) — 백엔드
          └── qa-engineer (haiku) — QA/검증
```

---

## 7. 성공 기준

- [ ] 3팀의 현재 TASK 목록과 상태가 대시보드에 실시간 표시된다
- [ ] 팀별 에이전트 멤버와 모델 정보가 정확히 표시된다
- [ ] 조직도가 CEO → COO → 3팀 계층으로 렌더링된다
- [ ] 팀 간 소통 로그가 시간순으로 표시되며 5초 이내 갱신된다
- [ ] 백그라운드 작업 진행률이 팀별로 분리되어 진행 바로 표시된다
- [ ] .pdca-status.json의 feature별 phase/matchRate가 PDCA 패널에 반영된다
- [ ] LIVE 인디케이터가 연결 상태와 마지막 갱신 시각을 표시한다
- [ ] 정적 목업 대비 데이터가 실시간으로 변경된다 (하드코딩 → 동적 데이터)
- [ ] `npm run build` 성공 (기존 기능 미영향)
- [ ] 데스크탑(1920px) + 태블릿(768px) 레이아웃 정상
- [ ] 팀 TASK 시작/완료 시 해당 팀 슬랙 채널에 알림이 전송된다
- [ ] 팀 간 체인 전달(PM→CTO 등) 시 양쪽 채널 + CEO DM에 알림이 전송된다
- [ ] 배포 완료, 에러 발생, 승인 필요 시 CEO DM에 알림이 전송된다
- [ ] 슬랙 알림에 대시보드 링크가 포함된다

---

## 8. 기술적 제약/고려사항

| 항목 | 내용 |
|------|------|
| **프레임워크** | Next.js 15 App Router (bscamp 기존 스택) |
| **스타일** | Primary #F75D5D, Pretendard, 라이트모드만 (목업 다크 → 라이트 전환) |
| **인증** | 기존 Supabase Auth 활용 (admin 역할만 접근) |
| **데이터 교환** | Phase 1: 파일 기반 (/tmp/cross-team/), Phase 2: Supabase Realtime |
| **팀 간 프로토콜** | 각 팀 세션이 state.json을 직접 쓰는 구조 (bkit hook 활용) |
| **슬랙** | SLACK_BOT_TOKEN 환경변수 (chat:write, im:write 스코프). @slack/web-api 패키지 |
| **슬랙 채널** | #agent-pm, #agent-marketing, #agent-cto 사전 생성 필요. CEO Slack User ID 필요 |
| **기존 목업** | 다크 테마 → 라이트 테마 + #F75D5D 포인트 컬러로 재디자인 |

---

## 9. 리스크

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| 팀 세션이 state.json 갱신을 빠뜨림 | 대시보드 정보 누락 | bkit hook으로 자동 갱신 강제 |
| /tmp 파일 서버 재시작 시 소실 | 소통 로그 유실 | Phase 2에서 Supabase 영구 저장 전환 |
| 3팀 동시 파일 쓰기 충돌 | 데이터 손상 | 팀별 별도 디렉토리 분리 |
| 목업 다크→라이트 전환 공수 | 디자인 재작업 | 목업 구조 재활용, 색상만 교체 |
| 슬랙 Rate Limit (1msg/sec/channel) | 동시 다발 이벤트 시 알림 지연 | 이벤트 큐잉 + 배치 전송 (5초 버퍼) |
| 슬랙 봇 토큰 만료/무효 | 알림 전체 중단 | 토큰 검증 API + fallback(대시보드 내 알림 표시) |
| 알림 폭주 (노이즈) | CEO가 알림 무시하게 됨 | 중요도 기반 필터링, CEO DM은 중요/긴급만 |

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 에이전트 대시보드 (3팀 실시간 모니터링) |
| **작성일** | 2026-03-24 |
| **예상 규모** | Phase 1 MVP: API 5개 + 페이지 1개 + 컴포넌트 8개 + 슬랙 모듈 1개 |

| 관점 | 내용 |
|------|------|
| **문제** | 3개 에이전트팀의 작업 상태가 파편화, CEO가 대시보드를 항상 볼 수 없음 |
| **해결** | 실시간 대시보드 + 슬랙 푸시 알림으로 팀 현황을 능동적으로 전달 |
| **기능 UX 효과** | 목업→실시간 서비스 + 슬랙으로 체인 전달/에러/배포 즉시 인지 |
| **핵심 가치** | CEO가 슬랙만 봐도 3팀 운영 흐름 파악 → 대시보드는 상세 확인용 |
