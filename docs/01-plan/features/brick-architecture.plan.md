# Brick Architecture (브릭 아키텍처) Plan

> 작성일: 2026-04-02
> 프로세스 레벨: L3 (아키텍처 설계)
> 작성자: PM팀
> TASK: `/Users/smith/.openclaw/workspace/tasks/TASK-BRICK-ARCHITECTURE.md`
> 비전 기록: `memory/2026-04-02.md` — Brick 아키텍처 섹션

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | Brick — 에이전트팀 워크플로우 모듈화 아키텍처 |
| **작성일** | 2026-04-02 |
| **핵심 철학** | "완전히 강제된 시스템 속에서 완벽한 자율화" — What은 강제, How는 자유 |
| **3축** | Block (what+done+gate) × Team (who+tool) × Link (how) |
| **선행** | agent-process-v3(완료), agent-harness-v2(설계완료), pdca-chain(완료), TDD 83건(완료) |
| **산출물** | Plan → Design → 모찌리포트 HTML |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | T-PDCA가 유일한 프로세스. 새 워크플로우(Research, Hotfix, 경쟁가설) 만들려면 hook 하드코딩 필요. 프로세스 확장 = 코드 수정 |
| **Solution** | Block/Team/Link 선언형 조합 시스템. 프로세스를 코드가 아닌 설정으로 정의. YAML/JSON 하나로 워크플로우 생성 |
| **Core Value** | 어떤 업무든 블록 조합으로 자동화. T-PDCA는 프리셋 중 하나로 격하. 새 프로세스 = 새 프리셋 파일 추가 |

---

## 1. 요구사항 정의

### 1.1 비즈니스 요구

| # | 요구사항 | 근거 |
|---|----------|------|
| BR-1 | 업무 프로세스를 블록 단위로 모듈화 | Smith님 비전: "Zapier처럼 블록 조합" |
| BR-2 | T-PDCA 외 새 프로세스를 코드 수정 없이 추가 | 현재 hook 하드코딩으로 새 프로세스 추가 불가 |
| BR-3 | 블록 간 양방향 연결 (성공→다음, 실패→이전) | Smith님 확정: "양방향 화살표" |
| BR-4 | 동일 블록에 병렬/경쟁 팀 배정 | 경쟁가설: 2팀 병렬 → 우수 산출물 선택 |
| BR-5 | 통과 게이트 on/off 가능 | Smith님: "빠르게 가면 끄고, 중요하면 켜고" |
| BR-6 | 크론 = 블록의 반복 (별도 개념 아님) | Smith님 확정: "TASK도 크론도 같은 것" |
| BR-7 | 블록 안 팀 내부 프로세스는 자율 | "What은 강제, How는 자유" |

### 1.2 기술 요구

| # | 요구사항 | 근거 |
|---|----------|------|
| TR-1 | 기존 hook/chain 인프라 위에 구축 (신규 런타임 없음) | bash hook + JSON 기반 현행 구조 유지 |
| TR-2 | 워크플로우를 YAML/JSON으로 선언적 정의 | Temporal.io, BPMN 참고 |
| TR-3 | Block/Team/Link 각각 독립 스키마로 분리 | 현재 gate-checker.sh에 혼합된 개념 분리 |
| TR-4 | 프리셋 = 워크플로우 템플릿 (T-PDCA, Hotfix, Research 등) | 프리셋 파일 추가만으로 새 프로세스 정의 |
| TR-5 | 이벤트 훅: on_start, on_complete, on_fail, on_timeout | pdca-chain-handoff.sh 확장 |
| TR-6 | 상태 추적: 블록별 started_at, completed_at, status | task-state JSON 확장 |
| TR-7 | 시각화: CLI + 대시보드에서 블록 흐름도 표시 | 현행 대시보드 확장 |

### 1.3 제약 조건

| # | 제약 | 이유 |
|---|------|------|
| C-1 | Claude Code Agent Teams 위에서 동작 | 런타임 변경 불가 |
| C-2 | bash hook + JSON/YAML 기반 | 별도 서버/DB 없음 |
| C-3 | 기존 TDD 83건 깨지면 안 됨 | 하위 호환 필수 |
| C-4 | 3축 구조 변경 불가 (Smith님 확정) | Block × Team × Link |
| C-5 | 브랜딩: Brick, "Build it. Block by Block." | Smith님 확정 |

---

## 2. 설계 범위 확정

### 2.1 Design에서 다룰 것 (In Scope)

| # | 항목 | 설명 |
|---|------|------|
| S-1 | **Block 인터페이스 스펙** | 타입, what, done, gate, input — JSON Schema |
| S-2 | **Block 타입 레지스트리** | Plan, Design, Do, Check, Act, Research, Review, Report, Cron + 확장 방법 |
| S-3 | **Gate 메커니즘** | auto(산출물/match-rate/TDD) + review(COO/Owner) + on_fail(retry/rollback/escalate) |
| S-4 | **Team 인터페이스 스펙** | 팀 정의 포맷, 도구 바인딩, 리더-팀원, 자율 범위 |
| S-5 | **Link 인터페이스 스펙** | 7개 연결 타입별 동작 명세 + 조건 평가 + 이벤트 훅 |
| S-6 | **워크플로우 엔진** | Block[] × Team[] × Link[] 조합 → 실행 흐름 생성 |
| S-7 | **프리셋 시스템** | T-PDCA, Hotfix, Research, Cron, Custom 프리셋 정의 방법 |
| S-8 | **기존 인프라 매핑** | 현재 hook/chain → Brick 구조 매핑 (마이그레이션 경로) |
| S-9 | **3층 아키텍처 상세** | System/Process/Autonomy 각 층 경계 + 불변 규칙 |
| S-10 | **비교 분석** | Brick vs CrewAI vs LangGraph vs MetaGPT vs AutoGen vs Temporal |
| S-11 | **시각화 설계** | CLI 출력 + 대시보드 블록 흐름도 |
| S-12 | **TDD 케이스** | Gap 100% 기준 — 모든 Design 항목 1:1 테스트 매핑 |

### 2.2 Design에서 다루지 않을 것 (Out of Scope)

| # | 항목 | 이유 |
|---|------|------|
| O-1 | 구현 코드 | PM 역할: Design까지. 구현은 CTO 담당 |
| O-2 | 대시보드 UI 컴포넌트 코드 | 별도 TASK로 분리 |
| O-3 | Brick SDK/CLI 도구 | Phase 2 이후 |
| O-4 | 외부 서비스 연동 (Temporal 등) | 자체 bash/JSON 기반으로 구현 |

---

## 3. 현행 인프라 분석 (Brick 매핑)

### 3.1 이미 있는 것 → Brick 개념 매핑

| 현행 | Brick 개념 | 매핑 상태 |
|------|-----------|----------|
| gate-checker.sh `CHAIN_KEY → gate[]` | Block.gate | 개념 일치, 하드코딩 → 선언형 전환 필요 |
| pdca-chain-handoff.sh | Link (sequential) | 역할 혼합 (Block 판정 + 라우팅 + 전송) → 분리 필요 |
| team-context.json | Team 런타임 상태 | 상태만 있고 정의(who+tool) 없음 → 정의 레이어 추가 |
| task-state-{feature}.json | Block 실행 상태 | 확장하여 Block별 상태 추적 |
| detect-work-type.sh | 프리셋 자동 선택 | CHAIN_KEY → 프리셋 ID로 전환 |
| TDD 83건 | System Layer 불변 규칙 검증 | 유지 + Brick 전용 테스트 추가 |

### 3.2 빠진 것 (Design에서 정의)

| 빈 칸 | 필요한 것 |
|--------|----------|
| Block 선언 객체 | `{ id, type, what, done, gate, input }` JSON Schema |
| Team 정의 포맷 | `{ name, leader, workers[], toolkit[] }` 선언 |
| Link 선언 객체 | `{ from, to, type, condition, on_fail }` |
| Workflow 조합기 | Block[] × Team[] × Link[] → 실행 그래프 생성 |
| 프리셋 레지스트리 | `.bkit/presets/*.yaml` 또는 JSON |
| 블록 간 컨텍스트 자동 주입 | 이전 Block 산출물 → 다음 Block input |

---

## 4. 리스크

| # | 리스크 | 영향 | 완화 |
|---|--------|------|------|
| R-1 | 기존 hook 하위 호환 깨짐 | TDD 83건 실패 | 현행 hook 래핑, 기존 테스트 유지 |
| R-2 | 선언형 전환 시 성능 저하 | hook 실행 시간 증가 | JSON 파싱 최소화, 캐시 |
| R-3 | 복잡도 증가로 디버깅 어려움 | 운영 이슈 증가 | 블록별 상태 로깅 강화 |
| R-4 | 3축 추상화 과도 → 실용성 저하 | 팀원 이해 불가 | 프리셋으로 복잡도 은닉 |

---

## 5. 마일스톤

| Phase | 산출물 | 내용 |
|-------|--------|------|
| **Phase 1** (이번 TASK) | Plan + Design + 모찌리포트 | 아키텍처 설계 완료 |
| Phase 2 | System Layer 구현 | Block/Team/Link 인터페이스 + 프리셋 엔진 |
| Phase 3 | Process Layer 구현 | T-PDCA 프리셋 마이그레이션 + 기존 hook 래핑 |
| Phase 4 | Autonomy Layer + 시각화 | 대시보드 블록 흐름도 + CLI 출력 |

---

_Plan 끝. Design으로 넘어간다._
