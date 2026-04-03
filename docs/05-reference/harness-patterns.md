# 하네스 패턴 레퍼런스

> 에이전트 하네스 설계에서 차용할 만한 개념 모음.
> 새로운 패턴 발견 시 지속 추가. Smith님 + COO 공용 참조 문서.
> 최종 갱신: 2026-04-03

---

## HP-001: ThinkTool — 사고 과정 로깅

| 항목 | 내용 |
|------|------|
| 출처 | Claude Code (오픈소스) |
| 핵심 | 아무것도 안 하는 도구. 입력 = 생각, 출력 = "기록됨". 끝. |
| 왜 중요한가 | AI의 추론 과정이 투명해짐. "왜 이렇게 했지?" 추적 가능. |
| 원문 설명 | "This is a no-op tool that logs a thought. Inspired by tau-bench think tool." |

**비유**: 개발자가 코드에 주석 다는 것처럼, AI가 결정에 주석을 다는 것.  
**기술**: 도구 호출 시 thought 파라미터만 받고, 로그에 기록만 하고 끝. 실행/변경 없음.

---

## HP-002: Agent 재귀 차단 + 도구 제한

| 항목 | 내용 |
|------|------|
| 출처 | Claude Code AgentTool |
| 핵심 | Agent가 Agent를 부를 수 없음. 쓰기 도구도 없음. |
| 왜 중요한가 | 깊이 무한 확장 방지. AI가 AI를 만들고 또 만드는 폭주 차단. |
| 원문 코드 | `getAgentTools()` → `filter(_ => _.name !== AgentTool.name)` |

**비유**: 부장이 대리한테 일 시킬 수 있지만, 대리가 다시 부장 역할을 만들 순 없음.  
**기술**: 서브태스크에 전달하는 도구 목록에서 자기 자신(Agent) 제거 + BashTool/FileWriteTool 제거.

---

## HP-003: ArchitectTool — 읽기 전용 설계자

| 항목 | 내용 |
|------|------|
| 출처 | Claude Code ArchitectTool |
| 핵심 | 파일을 읽을 수 있지만 절대 못 씀. "계획만, 코드 금지." |
| 왜 중요한가 | 설계자와 구현자의 권한을 도구 수준에서 분리. |
| 원문 프롬프트 | "Do not attempt to write the code. Just provide the plan." |

**비유**: 건축가가 설계도를 그리지만 벽돌을 쌓진 않는 것.  
**기술**: `FS_EXPLORATION_TOOLS`(Bash, LS, FileRead, Glob, Grep)만 허용. FileWrite/FileEdit 미포함.

---

## HP-004: 도구가 곧 권한이다

| 항목 | 내용 |
|------|------|
| 출처 | Claude Code 전체 아키텍처 |
| 핵심 | hook으로 "차단"하는 게 아니라, 애초에 도구 목록에서 빼버림. |
| 왜 중요한가 | 차단 = 시도 후 거부 (비용 발생). 도구 제거 = 시도 자체 불가 (비용 0). |

**비유**: 문에 자물쇠 거는 것(차단) vs 문 자체를 없애는 것(도구 제거).  
**기술**: 역할별 `getTools()` → 사용 가능 도구만 반환. 나머지는 AI가 존재조차 모름.

### 우리 현재 vs 이 패턴

```
우리: hook 기반 차단 (validate-delegate.sh)
  AI가 Write 시도 → hook이 검사 → exit 2 차단 → AI "에러" 받고 재시도
  = 차단은 되지만, 시도 자체는 발생 (토큰 낭비 + 에러 루프 위험)

Claude Code: 도구 목록 제어
  AI가 쓰기 도구를 아예 모름 → 시도 자체 불가
  = 더 근본적이지만, Claude Code 구조(단일 프로세스)에서만 가능

하이브리드 (우리 최적):
  1차: 도구 목록 제거 (가능한 범위에서)
  2차: hook 차단 (도구 제거가 불가능한 케이스의 안전망)
```

---

## HP-005: 안전 명령어 화이트리스트

| 항목 | 내용 |
|------|------|
| 출처 | Claude Code permissions.ts |
| 핵심 | `git status`, `pwd`, `tree` 등은 묻지도 않고 허용. |
| 왜 중요한가 | 매번 승인 받으면 워크플로우가 멈춤. 안전한 건 자동 통과. |
| 원문 코드 | `SAFE_COMMANDS = new Set(['git status', 'git diff', ...])` |

**비유**: 회사에서 화장실 갈 때마다 허락 안 받는 것.  
**기술**: 명령어 정확 매칭 → 화이트리스트에 있으면 permission check 스킵.

---

## HP-006: 비용 추적 내장

| 항목 | 내용 |
|------|------|
| 출처 | Claude Code cost-tracker.ts |
| 핵심 | 모든 API 호출의 비용을 실시간 누적. 세션 끝에 총 비용 표시. |
| 왜 중요한가 | 에이전트 운영 비용 가시성. "이 작업에 $2.50 썼다" 바로 앎. |
| 원문 코드 | `STATE = { totalCost, totalAPIDuration, startTime }` |

**비유**: 택시 미터기. 안 달면 목적지 도착 후 깜짝 요금.  
**기술**: `addToTotalCost(cost, duration)` → 매 API 응답마다 호출.

---

## 추가 예정
- 새로운 하네스 패턴 발견 시 HP-XXX로 추가
- 다른 에이전트 프레임워크(Codex, Devin, SWE-agent 등) 분석 시 추가

---

## 관련 문서
| 문서 | 용도 |
|------|------|
| memory/coo-learnings.md | COO 실수 교훈 (LRN-XXX) |
| docs/postmortem/*.md | 사고 회고 상세 (PM-XXX) |
| .bkit/hooks/ | 현재 하네스 hook 구현 |
