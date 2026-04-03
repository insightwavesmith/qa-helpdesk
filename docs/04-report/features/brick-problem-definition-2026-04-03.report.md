# Brick 문제점 정의서

> 작성: COO (모찌) | 2026-04-03 15:15
> 입력: PM `brick-system-map.md` + CTO `brick-integration-status.md` + COO 직접 코드 분석
> 목적: 브릭을 실사용 가능 상태로 만들기 위해 해결해야 할 문제 전수 정의

---

## 1. 본질적 문제: 브릭을 안 쓰고 있다

브릭은 "TASK를 열면 context가 저장되고, 모든 팀이 참조할 수 있는 시스템"으로 설계됐다.
하지만 현재 COO는 tmux + 슬랙 + 눈으로 수동 운영 중이다.

**왜 못 쓰는가?** → 아래 문제들이 해결되지 않았기 때문.

---

## 2. 구조적 문제 (근본)

### P-STRUCT-1: 이중 런타임 — Python 엔진 사실상 미사용

```
Python 엔진 (106파일, 11,950줄)
  StateMachine, Executor, Gates 10종, Links 7종, Adapters 8종
  → 완성도 높음. 테스트 374건.

Express 백엔드 (13파일, 1,600줄)
  executions.ts가 직접 DB에 blocksState 쓰고 직접 상태 전이
  executor.ts(139줄)가 자체 블록 시작/완료 로직 보유
  → Python StateMachine, GateExecutor를 안 씀.
```

**영향**: Python 엔진의 Gate 10종, Link 7종, Adapter 8종이 전부 죽은 코드.
Express의 executions.ts는 "블록 시작 → 블록 완료" 단순 전이만 하고, Gate 검증/Link 분기/Adapter 호출이 없다.

**판단**: 두 런타임 중 하나를 선택해야 한다.
- 옵션 A: Express를 Python 엔진의 HTTP 프록시로 만든다 (Express → Python Engine 호출)
- 옵션 B: Python 엔진의 핵심 로직을 Express(TypeScript)로 이식한다
- 옵션 C: Express는 CRUD/UI용, Python은 실행 엔진용으로 역할 분리 후 브릿지 연결

### P-STRUCT-2: 공통 Context Layer 부재

브릭 설계에 `WorkflowInstance.context`가 있지만, 이건 Python 엔진 안에서만 존재한다.
Express 측에는 `blocksState`(JSON 문자열)만 있고, 블록 간 산출물/메트릭 공유 메커니즘이 없다.

**영향**: "CTO가 뭘 만들었는지 COO가 모르는" 문제가 브릭을 써도 해결 안 됨.

---

## 3. 연결 문제 (차단)

### P-CONN-1: seed 미연결 → DB 비어있음 (P0)

`seed-brick.ts`에 `seedAll(db)` 함수가 있지만, `seed.ts`에서 import하지 않는다.
→ 블록 타입 0개, 팀 0개, 프리셋 0개 → 프론트에서 아무것도 안 보임 → **사용 불가**.

```
필요 조치: seed.ts에 1줄 추가
import { seedAll as seedBrick } from './seed-brick.js';
// seed() 함수 끝에: seedBrick(db);
```

### P-CONN-2: Hook ↔ API 불일치 5건

**Hook 있는데 API 없음 (3건):**
| Hook | 호출 경로 | 문제 |
|------|----------|------|
| `useAddMember` | POST /teams/:id/members | 라우트 미구현 |
| `useRemoveMember` | DELETE /teams/:id/members/:memberId | 라우트 미구현 |
| `useConfigureMcp` | PUT /teams/:id/mcp | GET만 있고 PUT 없음 |

**파라미터 불일치 (2건):**
| Hook | Hook 파라미터 | API 파라미터 |
|------|-------------|-------------|
| `useUpdateBlockType` | `:id` | `:name` |
| `useDeleteBlockType` | `:id` | `:name` |

### P-CONN-3: executions GET 목록 없음 (P1)

`GET /api/brick/executions` (전체 목록)이 없다.
- `GET /api/brick/executions/:id` (개별 조회)만 있음
- 실행 이력 페이지(RunHistoryPage)가 데이터를 가져올 수 없음

### P-CONN-4: WebSocket broadcast 미연결

`websocket.ts`에 `broadcast()` 함수가 있지만, 실행/게이트/팀 변경 시 호출하는 코드가 없다.
`useBrickLiveUpdates` hook도 어떤 페이지에도 마운트되지 않음.
→ 실시간 업데이트 불가. 3~5초 폴링에만 의존.

### P-CONN-5: 캔버스 ↔ 실행 상태 미연결

`BrickCanvasPage.tsx`에서:
- `executionData.blocksState`를 폴링하지만, 노드 상태에 반영하는 로직 일부만 구현
- `ExecutionTimeline`이 존재하지만 로그 데이터 미연결
- `presetId`가 `'default'` 하드코딩 — URL params 미사용

---

## 4. 미완성 (기능)

### P-FEAT-1: approve/gate CLI 스텁
- `brick approve`: 메시지 출력만, state.json 미수정
- `brick gate`: 메시지 출력만, 실제 Gate 미실행

### P-FEAT-2: 알려진 엔진 버그 2건
1. **spec wrapper 미처리 (P0)**: `executor.py._parse_preset()`이 `spec` wrapper 안 벗김 → 블록 누락
2. **loop Link 무한루프 (P1)**: Gate 분기(pass→next, fail→loop) 로직 없음

### P-FEAT-3: 프론트 미연결 페이지 4개
| 페이지 | 상태 |
|--------|------|
| `PresetEditorPage` | 저장 핸들러 없음 (셸) |
| `RunHistoryPage` | 데이터 미연결 (placeholder) |
| `BrickOverviewPage` | prop 주입 셸 |
| `LearningHarnessPage` | prop 주입 셸 |

### P-FEAT-4: Hook 미사용 4개
| Hook | 문제 |
|------|------|
| `useLinks` | 캔버스가 로컬 state로만 관리, DB 미연결 |
| `useLearning` | 페이지가 셸 |
| `useGates` | 페이지 미연결 |
| `useSystem` | 페이지 미연결 |

### P-FEAT-5: 이중 구현 동기화 위험 5건
| 로직 | Python | TypeScript |
|------|--------|-----------|
| spec wrapper 해제 | `executor.py._parse_preset()` | `executions.ts POST` |
| YAML 파싱 | `yaml.safe_load` | `yaml` + `js-yaml` 혼용 |
| DAG 순환 검증 | `validator.py` | `links.ts POST` |
| 블록 상태 매핑 | `BlockStatus` enum | `BlockStatus` type (이름 다름) |
| 프리셋 변환 | `converters.py` | `serializer.ts` |

---

## 5. 문제 우선순위

### Tier 0 — 이것 없으면 시작도 못 함
| # | 문제 | 조치 |
|---|------|------|
| P-CONN-1 | seed 미연결 | seed.ts에 seedBrick(db) 추가 |
| P-STRUCT-1 | 이중 런타임 방향 미결정 | Smith님 결정 필요: A/B/C 옵션 |

### Tier 1 — 기본 사용성
| # | 문제 | 조치 |
|---|------|------|
| P-CONN-2 | Hook↔API 불일치 5건 | API 3개 추가 + 파라미터 2개 수정 |
| P-CONN-3 | executions GET 목록 없음 | GET /api/brick/executions 추가 |
| P-FEAT-2 | 엔진 버그 2건 | spec wrapper + loop 수정 |
| P-CONN-5 | 캔버스↔실행 미연결 | blocksState→노드 반영 + presetId 동적화 |

### Tier 2 — 운영 가능
| # | 문제 | 조치 |
|---|------|------|
| P-CONN-4 | WebSocket 미연결 | broadcast 호출 + hook 마운트 |
| P-STRUCT-2 | 공통 Context Layer | 블록 간 산출물 공유 메커니즘 구현 |
| P-FEAT-1 | approve/gate 스텁 | 실제 동작 구현 |
| P-FEAT-3 | 프론트 미연결 4페이지 | hooks 연결 + 데이터 바인딩 |

### Tier 3 — 최적화
| # | 문제 | 조치 |
|---|------|------|
| P-FEAT-5 | 이중 구현 동기화 | 단일 소스 오브 트루스 결정 |
| P-FEAT-4 | Hook 미사용 4개 | 페이지 연결 |

---

## 6. Smith님 결정 필요 사항

1. **이중 런타임 방향 (P-STRUCT-1)**:
   - A: Express → Python Engine 호출 (Python이 실행 엔진)
   - B: Python 로직을 TypeScript로 이식 (Express 단일 런타임)
   - C: 역할 분리 + 브릿지 (Express=CRUD/UI, Python=실행)

2. **공통 Context Layer 범위 (P-STRUCT-2)**:
   - 블록 간 산출물만 공유? vs 팀 현황 + 시스템 상태까지?

---

## 7. 수치 요약

| 항목 | 수치 |
|------|------|
| 전체 문제 수 | 14건 (구조 2 + 연결 5 + 기능 5 + 동기화 위험 5) |
| Tier 0 (차단) | 2건 |
| Tier 1 (기본 사용) | 4건 |
| Tier 2 (운영) | 4건 |
| Tier 3 (최적화) | 4건 |
| Python 미사용 코드 | 106파일, 11,950줄 |
| Hook↔API 불일치 | 5건 (API 누락 3 + 파라미터 2) |
| 프론트 미연결 페이지 | 4개 |
| Hook 미사용 | 4개 |
| 이중 구현 | 5건 |
