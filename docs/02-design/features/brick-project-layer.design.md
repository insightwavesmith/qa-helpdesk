# Design: 프로젝트 레이어 (Project Layer)

> **피처**: brick-project-layer (프로젝트 레이어)
> **레벨**: L2-기능
> **작성**: PM | 2026-04-03
> **선행**: brick-engine-bridge.design.md (INV-EB-1~11, EngineBridge), brick-architecture.design.md (3축 구조)
> **Smith님 결정**: 프로젝트 컨텍스트 자동 주입으로 Design 불일치 원천 차단

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | 브릭 위에 "프로젝트" 개념을 추가하여, 인프라 제약·불변식·과거 교훈을 모든 브릭에 자동 주입 |
| **핵심 변경** | `brick_projects` 테이블 + `brick_invariants` 테이블 + `ProjectContextBuilder` + 엔진 `initial_context` 파라미터 |
| **현행 문제** | PM에게 TASK 넘길 때 "SQLite다", "포트 3202다" 같은 제약을 매번 수동 전달. 누락 시 PostgreSQL 문법 Design 작성 등 불일치 발생 |
| **수정 범위** | Express 레이어 (DB + API + Bridge), Python 엔진 (start 파라미터), 프로젝트 설정 파일 1개 |
| **TDD** | PL-001 ~ PL-034 (34건) |

| 관점 | 내용 |
|------|------|
| **Problem** | 프로젝트 인프라 제약(DB 종류, 포트, 불변식)이 각 브릭 Design에 수동 전달되어 누락·불일치 반복 |
| **Solution** | 프로젝트 레벨에서 컨텍스트를 정의하고, 브릭 시작 시 자동 주입. 불변식은 레지스트리로 중앙 관리 |
| **Core Value** | "한 번 정의, 모든 브릭에 자동 적용" — 수동 전달 제거, Design 불일치 원천 차단 |

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) — `dashboard/server/db/index.ts` |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **기존 불변식** | INV-EB-1~11 (engine-bridge Design 정의). 이 Design은 기존 INV를 변경하지 않음 |
| **하위호환** | 기존 preset-v2 스키마, `.bkit/` 디렉토리 구조, `brick_executions` 기존 행 |

---

## 1. 현행 문제 분석

### 1.1 수동 컨텍스트 전달의 한계

```
Smith님 → COO: "CEO 승인 Gate Design 작성해"
COO → PM: TASK 전달
PM: Design 작성 시작
PM: (DB가 뭐지? PostgreSQL이겠지...) ← 여기서 불일치 발생
PM: CREATE TABLE ... UUID DEFAULT gen_random_uuid() ... ← PostgreSQL 문법
검토: "우리 DB는 SQLite다" → 수정 → 재작성
```

**실제 사례** (2026-04-03): `brick-ceo-approval-gate.design.md`에서 JSONB, gen_random_uuid(), RLS 정책 사용 → SQLite 전환 수정 필요.

### 1.2 불변식 관리의 부재

현재 불변식(INV-EB-1~11)은 `brick-engine-bridge.design.md` 안에 마크다운 테이블로만 존재.

| 문제 | 영향 |
|------|------|
| **산재** | 각 Design이 자기 INV를 내부에만 정의. 전체 목록 파악 불가 |
| **갱신 무추적** | INV-EB-3이 7→9로 변경될 때 이력 없음 |
| **검증 불가** | 새 Design이 기존 INV를 깨는지 자동 확인 불가 |
| **수동 참조** | PM이 모든 선행 Design을 읽고 INV를 직접 찾아야 함 |

### 1.3 프로젝트 단위 관점 부재

```
brick_executions:
  id=1, feature="engine-bridge", status="completed"
  id=2, feature="ceo-approval-gate", status="pending"
  id=3, feature="review-block", status="pending"
  → 이 3개가 같은 프로젝트(bscamp)에 속한다는 정보 없음
  → 프로젝트 전체 진행률, 인프라 공유 관계 파악 불가
```

---

## 2. 프로젝트 모델 설계

### 2.1 개념 모델

```
┌─────────────────────────────────────────────┐
│  Project (bscamp)                           │
│  ├─ infrastructure: SQLite, 3200, 3202, ... │
│  ├─ invariants: INV-EB-1~11, INV-AG-1, ... │
│  │                                          │
│  ├─ Brick: engine-bridge      [completed]   │
│  ├─ Brick: ceo-approval-gate  [running]     │
│  ├─ Brick: review-block       [pending]     │
│  └─ Brick: project-layer      [planning]    │
└─────────────────────────────────────────────┘
```

- **Project**: 프로젝트 메타데이터 + 인프라 제약 + 불변식 레지스트리
- **Brick (= Execution)**: 기존 `brick_executions`. `project_id` FK 추가
- **Invariant**: 프로젝트에 속한 불변 규칙. 설계 문서에서 추출, 중앙 관리

### 2.2 프로젝트 설정 파일

프로젝트의 정적 인프라 제약은 `.bkit/project.yaml`에 선언한다. 이 파일은 git 관리되어 모든 팀원이 공유.

```yaml
# .bkit/project.yaml — 프로젝트 인프라 설정 (git 관리)
id: bscamp
name: "자사몰사관학교"
description: "메타 광고 전문 자사몰 교육 플랫폼"

infrastructure:
  db:
    type: sqlite
    orm: drizzle-orm
    driver: better-sqlite3
    path: .data/bkit.db
    # SQLite 전용 제약: JSONB 미지원 → TEXT, gen_random_uuid() 미지원 → 앱 레이어 uuid()
    # RLS 미지원 → Express 미들웨어 권한 검증
    constraints:
      - "UUID 컬럼은 TEXT 타입 + 앱에서 uuid() 생성"
      - "JSON 컬럼은 TEXT 타입 + JSON.parse() 사용"
      - "타임스탬프는 TEXT + datetime('now')"
      - "RLS 미지원 — Express 미들웨어에서 권한 검증"

  services:
    - name: dashboard
      port: 3200
      language: typescript
      framework: express
      description: "CRUD gateway + 프론트엔드 API"

    - name: engine
      port: 3202
      language: python
      framework: fastapi
      description: "브릭 실행 엔진 (상태 전이, Gate, Adapter)"

  runtime: cloud-run
  cloud:
    provider: gcp
    project_id: "modified-shape-477110-h8"
    services:
      - bscamp
      - bscamp-web
      - bscamp-cron
      - collect-daily

  languages:
    - typescript  # 프론트엔드 + Express
    - python      # 엔진 + 크론
```

### 2.3 설정 파일 → DB 동기화

```
세션 시작 / 서버 시작
  → .bkit/project.yaml 읽기
  → brick_projects 테이블에 upsert
  → 변경 감지 시 updated_at 갱신
```

동기화는 Express 서버 시작 시 1회 수행. `project.yaml` 변경 시 서버 재시작 또는 `POST /api/brick/projects/sync` 호출로 반영.

---

## 3. 자동 컨텍스트 주입

### 3.1 주입 흐름

```
Express: POST /api/brick/executions { presetName, feature, projectId? }
  │
  ├─ 1. projectId 결정 (명시 or 기본 프로젝트)
  │
  ├─ 2. ProjectContextBuilder.build(projectId)
  │     ├─ loadProject()          → 인프라 제약 (정적)
  │     ├─ loadInvariants()       → 활성 불변식 목록 (동적)
  │     ├─ loadRecentFailures()   → 최근 실패 10건 (동적)
  │     └─ loadRecentArtifacts()  → 최근 산출물 20건 (동적)
  │
  ├─ 3. bridge.startWorkflow(preset, feature, task, initialContext)
  │                                                    ↑ 신규 파라미터
  │
  └─ 4. Python engine: instance.context에 병합
         → 모든 블록에서 context.project.* 접근 가능
```

### 3.2 컨텍스트 구조

```typescript
// dashboard/server/brick/project/context-builder.ts

interface ProjectContext {
  project_id: string;
  project_name: string;

  /** 인프라 제약 — .bkit/project.yaml에서 로드 */
  infrastructure: {
    db: {
      type: string;           // "sqlite"
      orm: string;            // "drizzle-orm"
      driver: string;         // "better-sqlite3"
      constraints: string[];  // SQLite 제약 목록
    };
    services: Array<{
      name: string;           // "dashboard" | "engine"
      port: number;           // 3200 | 3202
      language: string;       // "typescript" | "python"
      framework: string;      // "express" | "fastapi"
    }>;
    runtime: string;          // "cloud-run"
    languages: string[];      // ["typescript", "python"]
  };

  /** 활성 불변식 — brick_invariants에서 로드 */
  invariants: Array<{
    id: string;               // "INV-EB-3"
    description: string;      // "blocksState status 9가지만 허용"
    design_source: string;    // "brick-engine-bridge.design.md"
    constraint_value: string; // 구체적 제약 내용
  }>;

  /** 최근 실패 — brick_gate_results(passed=0)에서 로드 */
  recent_failures: Array<{
    feature: string;          // "ceo-approval-gate"
    block_id: string;         // "design"
    reason: string;           // "PostgreSQL 문법 사용"
    date: string;             // "2026-04-03"
  }>;

  /** 최근 산출물 경로 — 완료된 execution의 artifact에서 로드 */
  recent_artifacts: Array<{
    feature: string;
    block_type: string;       // "Plan" | "Design"
    path: string;             // "docs/02-design/features/brick-engine-bridge.design.md"
  }>;
}
```

### 3.3 ProjectContextBuilder

```typescript
// dashboard/server/brick/project/context-builder.ts

import { db } from '../../db/index.js';
import { brickProjects, brickInvariants, brickExecutions, brickGateResults } from '../../db/schema/brick.js';
import { eq, and, desc } from 'drizzle-orm';

export class ProjectContextBuilder {

  async build(projectId: string): Promise<ProjectContext> {
    const [project, invariants, failures, artifacts] = await Promise.all([
      this.loadProject(projectId),
      this.loadInvariants(projectId),
      this.loadRecentFailures(projectId, 10),
      this.loadRecentArtifacts(projectId, 20),
    ]);

    return {
      project_id: project.id,
      project_name: project.name,
      infrastructure: JSON.parse(project.infrastructure),
      invariants,
      recent_failures: failures,
      recent_artifacts: artifacts,
    };
  }

  private async loadProject(projectId: string) {
    const row = db.select().from(brickProjects).where(eq(brickProjects.id, projectId)).get();
    if (!row) throw new Error(`Project not found: ${projectId}`);
    return row;
  }

  private async loadInvariants(projectId: string) {
    return db.select({
      id: brickInvariants.id,
      description: brickInvariants.description,
      design_source: brickInvariants.designSource,
      constraint_value: brickInvariants.constraintValue,
    })
    .from(brickInvariants)
    .where(and(
      eq(brickInvariants.projectId, projectId),
      eq(brickInvariants.status, 'active'),
    ))
    .all();
  }

  private async loadRecentFailures(projectId: string, limit: number) {
    // brick_executions JOIN brick_gate_results WHERE passed = 0
    // project_id로 필터링, 최신순 limit건
    const rows = db.select({
      feature: brickExecutions.feature,
      block_id: brickGateResults.blockId,
      reason: brickGateResults.detail,
      date: brickGateResults.executedAt,
    })
    .from(brickGateResults)
    .innerJoin(brickExecutions, eq(brickGateResults.executionId, brickExecutions.id))
    .where(and(
      eq(brickExecutions.projectId, projectId),
      eq(brickGateResults.passed, false),
    ))
    .orderBy(desc(brickGateResults.executedAt))
    .limit(limit)
    .all();

    return rows.map(r => ({
      feature: r.feature,
      block_id: r.block_id,
      reason: typeof r.reason === 'string' ? r.reason : JSON.stringify(r.reason),
      date: r.date?.split('T')[0] ?? '',
    }));
  }

  private async loadRecentArtifacts(projectId: string, limit: number) {
    // 완료된 execution의 blocksState에서 artifact 경로 추출
    const rows = db.select({
      feature: brickExecutions.feature,
      blocksState: brickExecutions.blocksState,
    })
    .from(brickExecutions)
    .where(and(
      eq(brickExecutions.projectId, projectId),
      eq(brickExecutions.status, 'completed'),
    ))
    .orderBy(desc(brickExecutions.createdAt))
    .limit(limit)
    .all();

    const artifacts: ProjectContext['recent_artifacts'] = [];
    for (const row of rows) {
      const state = typeof row.blocksState === 'string'
        ? JSON.parse(row.blocksState) : row.blocksState;
      if (!state) continue;
      for (const [blockId, block] of Object.entries(state as Record<string, any>)) {
        if (block.artifacts) {
          for (const path of block.artifacts) {
            artifacts.push({
              feature: row.feature,
              block_type: block.type ?? blockId,
              path,
            });
          }
        }
      }
    }
    return artifacts.slice(0, limit);
  }
}
```

### 3.4 에이전트가 컨텍스트를 보는 방식

`TeamAdapter.start_block(block, context)` 호출 시 `context.project`가 포함된다.
`claude_agent_teams` 어댑터는 이 컨텍스트를 에이전트 태스크 프롬프트에 다음 형식으로 주입:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 프로젝트 컨텍스트 (자동 주입)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▎인프라 제약
• DB: SQLite (better-sqlite3 + drizzle-orm)
  - UUID → TEXT + 앱 uuid(), JSONB → TEXT, RLS 미지원
• Express: localhost:3200 (TypeScript)
• Python 엔진: localhost:3202 (FastAPI)
• 런타임: Cloud Run (GCP: modified-shape-477110-h8)

▎활성 불변식 (11건)
• INV-EB-1: POST /executions는 Python 엔진 경유 필수
• INV-EB-3: blocksState status 9가지만 허용
• ...

▎최근 실패 교훈
• ceo-approval-gate / design: PostgreSQL 문법 사용 (2026-04-03)
• ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

PM 에이전트는 이 컨텍스트를 자동으로 참조하여:
- DB 스키마 작성 시 SQLite 문법 사용
- 포트 번호 정확히 기재
- 기존 불변식 위반 여부 자체 확인
- 과거 실패를 반복하지 않음

---

## 4. 불변식 레지스트리

### 4.1 불변식 모델

```typescript
interface Invariant {
  id: string;               // "INV-EB-3" — 네이밍: INV-{Design약어}-{번호}
  projectId: string;         // "bscamp"
  designSource: string;      // "brick-engine-bridge.design.md"
  description: string;       // "blocksState status 값은 BlockStatus enum의 9가지만 허용"
  constraintType: string;    // "enum_values" | "port" | "syntax" | "count" | "rule"
  constraintValue: string;   // JSON: 구체적 제약 데이터
  status: 'active' | 'deprecated' | 'superseded';
  supersededBy: string | null; // 대체된 경우 새 불변식 ID
  version: number;           // 현재 버전 (갱신 시 증가)
}
```

### 4.2 불변식 이력 모델

```typescript
interface InvariantHistory {
  id: number;                // 자동 증가
  invariantId: string;       // "INV-EB-3"
  version: number;           // 갱신 후 버전
  previousValue: string;     // 이전 constraintValue
  newValue: string;          // 새 constraintValue
  changeReason: string;      // "BlockStatus에 WAITING_APPROVAL, REJECTED 추가"
  changedBy: string;         // "brick-ceo-approval-gate.design.md"
}
```

### 4.3 불변식 등록·갱신 흐름

```
[신규 등록]
Design 작성 완료 → PM이 Design에 INV 섹션 포함
  → CTO 구현 시 또는 수동으로 POST /api/brick/invariants 호출
  → brick_invariants에 INSERT
  → 다음 브릭부터 context.invariants에 자동 포함

[갱신]
새 Design이 기존 INV 변경 필요 (예: INV-EB-3 7→9)
  → Design에 "INV-EB-3 갱신" 섹션 명시 (brick-ceo-approval-gate.design.md §11.1처럼)
  → PUT /api/brick/invariants/INV-EB-3 호출
  → brick_invariant_history에 이전 값 저장
  → brick_invariants.constraintValue + version 갱신

[폐기]
더 이상 유효하지 않은 INV
  → PATCH /api/brick/invariants/INV-XX-N/deprecate
  → status → 'deprecated'
  → context.invariants에서 제외
```

### 4.4 불변식 위반 자동 감지 (Gate 검증)

기존 `agent` 타입 Gate를 활용한다. 새 Gate 타입 추가 불필요.

프리셋의 Design 블록에 다음 Gate를 추가:

```yaml
- id: design
  type: Design
  what: "상세 설계 + TDD 케이스"
  done:
    artifacts: ["docs/02-design/features/{feature}.design.md"]
  gate:
    handlers:
      - type: agent
        agent_prompt: |
          다음 설계 문서가 프로젝트 불변식을 위반하는지 검토하라.
          
          [설계 문서]
          {artifact:docs/02-design/features/{feature}.design.md}
          
          [활성 불변식]
          {context.project.invariants}
          
          검토 기준:
          1. 각 활성 불변식에 대해 위반 여부 판단
          2. 위반 시: 설계 문서에서 명시적 갱신 선언이 있는지 확인
          3. 갱신 선언 없는 위반 = fail
          4. 갱신 선언 있는 위반 = pass (의도적 변경)
          
          verdict: pass/fail + 위반 항목 목록
        timeout: 60
        on_fail: fail
        description: "불변식 위반 검증"
```

Gate 템플릿 변수 확장: `{context.*}` 경로를 지원하도록 `ConcreteGateExecutor._resolve_template()` 메서드에 context 참조 로직 추가. 기존 `{feature}`, `{artifact:...}` 변수와 동일 패턴.

### 4.5 초기 시드 — INV-EB-1~11 등록

Express 서버 시작 시 `seedInvariants(projectId)` 실행. 이미 존재하면 스킵 (INSERT OR IGNORE).

```typescript
// dashboard/server/db/seed-invariants.ts

const INITIAL_INVARIANTS = [
  {
    id: 'INV-EB-1',
    designSource: 'brick-engine-bridge.design.md',
    description: 'POST /executions는 반드시 Python 엔진을 거쳐야 한다. DB 직접 상태 전이 금지',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'engine_proxy_required', endpoints: ['POST /executions'] }),
  },
  {
    id: 'INV-EB-2',
    designSource: 'brick-engine-bridge.design.md',
    description: 'complete-block 시 Gate 결과가 brickGateResults에 반드시 저장되어야 한다',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'gate_result_persistence' }),
  },
  {
    id: 'INV-EB-3',
    designSource: 'brick-engine-bridge.design.md',
    description: 'blocksState의 status 값은 Python BlockStatus enum의 7가지만 허용',
    constraintType: 'enum_values',
    constraintValue: JSON.stringify({
      allowed: ['pending', 'queued', 'running', 'gate_checking', 'completed', 'failed', 'suspended'],
      note: 'brick-ceo-approval-gate.design.md에서 9가지로 갱신 예정 (waiting_approval, rejected 추가)',
    }),
  },
  // INV-EB-4 ~ INV-EB-11 동일 패턴
  {
    id: 'INV-EB-4',
    designSource: 'brick-engine-bridge.design.md',
    description: '엔진 다운 시 GET(읽기)는 정상, POST(쓰기)는 502 반환',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'graceful_degradation' }),
  },
  {
    id: 'INV-EB-5',
    designSource: 'brick-engine-bridge.design.md',
    description: 'seed() 호출 시 Brick 테이블에 블록 타입 10종, 팀 3개, 프리셋 4개 존재',
    constraintType: 'count',
    constraintValue: JSON.stringify({ block_types: 10, teams: 3, presets: 4 }),
  },
  {
    id: 'INV-EB-6',
    designSource: 'brick-engine-bridge.design.md',
    description: 'Hook의 API 호출 경로와 Express 라우트 경로가 1:1 매칭',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'hook_route_matching' }),
  },
  {
    id: 'INV-EB-7',
    designSource: 'brick-engine-bridge.design.md',
    description: 'Express execution.id ↔ Python workflow_id 매핑이 engineWorkflowId 컬럼으로 항상 존재',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'id_mapping_required', column: 'engineWorkflowId' }),
  },
  {
    id: 'INV-EB-8',
    designSource: 'brick-engine-bridge.design.md',
    description: 'context는 블록 간 전파되어야 한다. 블록 A의 metrics가 블록 B의 Gate 조건에서 참조 가능',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'context_propagation' }),
  },
  {
    id: 'INV-EB-9',
    designSource: 'brick-engine-bridge.design.md',
    description: 'complete-block 후 다음 블록의 TeamAdapter.start_block() 호출 필수',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'adapter_start_required' }),
  },
  {
    id: 'INV-EB-10',
    designSource: 'brick-engine-bridge.design.md',
    description: '동시 실행 워크플로우 간 체크포인트 파일 충돌 없음 (workflow_id별 독립 디렉토리)',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'checkpoint_isolation', path_pattern: '.bkit/runtime/workflows/{workflow_id}/' }),
  },
  {
    id: 'INV-EB-11',
    designSource: 'brick-engine-bridge.design.md',
    description: '동일 블록에 대한 중복 complete-block 호출 시 상태 일관성 보장 (멱등 또는 거부)',
    constraintType: 'rule',
    constraintValue: JSON.stringify({ rule: 'idempotent_complete' }),
  },
];
```

---

## 5. DB 스키마

### 5.1 brick_projects 테이블

```sql
-- dashboard/server/db/create-schema.ts에 추가
CREATE TABLE IF NOT EXISTS brick_projects (
  id TEXT PRIMARY KEY,                                          -- "bscamp"
  name TEXT NOT NULL,                                           -- "자사몰사관학교"
  description TEXT,
  infrastructure TEXT NOT NULL DEFAULT '{}',                     -- JSON: 인프라 제약
  config TEXT NOT NULL DEFAULT '{}',                            -- JSON: 프로젝트별 추가 설정
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 5.2 brick_invariants 테이블

```sql
CREATE TABLE IF NOT EXISTS brick_invariants (
  id TEXT NOT NULL,                                             -- "INV-EB-3"
  project_id TEXT NOT NULL REFERENCES brick_projects(id),
  design_source TEXT NOT NULL,                                  -- "brick-engine-bridge.design.md"
  description TEXT NOT NULL,
  constraint_type TEXT NOT NULL
    CHECK(constraint_type IN ('enum_values','port','syntax','count','rule')),
  constraint_value TEXT NOT NULL DEFAULT '{}',                  -- JSON
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','deprecated','superseded')),
  superseded_by TEXT,                                           -- 대체된 경우 새 INV ID
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_brick_invariants_project_status
  ON brick_invariants(project_id, status);
```

### 5.3 brick_invariant_history 테이블

```sql
CREATE TABLE IF NOT EXISTS brick_invariant_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invariant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  previous_value TEXT,                                          -- JSON: 이전 constraintValue
  new_value TEXT NOT NULL,                                      -- JSON: 새 constraintValue
  change_reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,                                     -- Design 파일명
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invariant_id, project_id) REFERENCES brick_invariants(id, project_id)
);
```

### 5.4 brick_executions 확장

```sql
-- 기존 테이블에 컬럼 추가 (nullable — 기존 행 호환)
ALTER TABLE brick_executions ADD COLUMN project_id TEXT REFERENCES brick_projects(id);

CREATE INDEX IF NOT EXISTS idx_brick_executions_project
  ON brick_executions(project_id);
```

Drizzle 스키마:
```typescript
// dashboard/server/db/schema/brick.ts — brickExecutions에 추가
projectId: text('project_id').references(() => brickProjects.id),
```

---

## 6. Python 엔진 확장

### 6.1 EP-1 `/engine/start` 파라미터 추가

```python
# brick/brick/dashboard/routes/engine_bridge.py — start 엔드포인트 수정

@router.post("/engine/start")
async def start_workflow(request: StartRequest):
    """워크플로우 시작. initial_context가 있으면 instance.context에 병합."""
    workflow_id = await executor.start(
        preset_name=request.preset_name,
        feature=request.feature,
        task=request.task,
        initial_context=request.initial_context,  # 신규: Optional[dict] = None
    )
    # ...
```

### 6.2 WorkflowExecutor.start() 확장

```python
# brick/brick/engine/executor.py — start 메서드 수정

async def start(
    self,
    preset_name: str,
    feature: str,
    task: str,
    initial_context: dict | None = None,  # 신규 파라미터
) -> str:
    definition = self.preset_loader.load(preset_name)

    if self.validator:
        self.validator.validate_workflow(definition)

    instance = WorkflowInstance.from_definition(definition, feature, task)

    # ── 프로젝트 컨텍스트 주입 (신규) ──
    if initial_context:
        # 기존 context를 덮어쓰지 않고 병합 (project 키 아래 네임스페이스)
        instance.context["project"] = initial_context

    instance, commands = self.state_machine.transition(
        instance, Event("workflow.start")
    )
    self.checkpoint.save(instance.id, instance)

    for cmd in commands:
        instance = await self._execute_command(instance, cmd)

    return instance.id
```

**핵심 결정**: `initial_context`를 `instance.context["project"]`에 넣어 기존 context 키(`metrics`, `gate_result` 등)와 충돌 방지. 모든 블록에서 `context["project"]["infrastructure"]["db"]["type"]` 등으로 접근.

### 6.3 하위호환

- `initial_context`는 `Optional[dict] = None`. 기존 호출자(테스트, 다른 시스템)는 변경 없이 동작.
- `instance.context`에 `"project"` 키가 없어도 기존 로직(metrics 병합, Gate 조건 평가)은 정상 동작.
- INV-EB-8 (context 블록 간 전파) 유지: `instance.context`는 여전히 하나의 dict이고, checkpoint에 저장/복원됨.

---

## 7. Express Bridge 확장

### 7.1 EngineBridge.startWorkflow 파라미터 추가

```typescript
// dashboard/server/brick/engine/bridge.ts — startWorkflow 수정

async startWorkflow(
  presetName: string,
  feature: string,
  task: string,
  initialContext?: Record<string, unknown>,  // 신규 파라미터
): Promise<BridgeResponse<StartResult>> {
  return this.retry(() =>
    this.request<StartResult>('/api/v1/engine/start', {
      method: 'POST',
      body: JSON.stringify({
        preset_name: presetName,
        feature,
        task,
        initial_context: initialContext ?? null,  // 없으면 null → Python에서 None
      }),
    })
  );
}
```

### 7.2 실행 라우트 수정

```typescript
// dashboard/server/routes/brick/executions.ts — POST /api/brick/executions 수정

router.post('/api/brick/executions', async (req, res) => {
  const { presetName, feature, task, projectId } = req.body;

  // 1. 프로젝트 결정 (명시 or 기본)
  const resolvedProjectId = projectId ?? await getDefaultProjectId();

  // 2. 프로젝트 컨텍스트 빌드
  let initialContext: Record<string, unknown> | undefined;
  if (resolvedProjectId) {
    const builder = new ProjectContextBuilder();
    initialContext = await builder.build(resolvedProjectId);
  }

  // 3. 엔진 호출 (컨텍스트 포함)
  const result = await bridge.startWorkflow(presetName, feature, task ?? '', initialContext);

  if (!result.ok) {
    return res.status(502).json({ error: result.error, detail: result.detail });
  }

  // 4. DB에 execution 저장 (project_id FK 포함)
  const execution = db.insert(brickExecutions).values({
    presetId: presetId,
    feature,
    status: 'running',
    engineWorkflowId: result.data.workflow_id,
    blocksState: JSON.stringify(result.data.blocks_state),
    currentBlock: result.data.current_block_id,
    projectId: resolvedProjectId,  // 신규
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }).run();

  return res.json({ id: execution.lastInsertRowid, ...result.data });
});
```

---

## 8. Express API

### 8.1 프로젝트 CRUD

```
POST   /api/brick/projects                  — 프로젝트 생성
GET    /api/brick/projects                  — 프로젝트 목록
GET    /api/brick/projects/:id              — 프로젝트 상세 (+ 실행 목록 + 불변식)
PUT    /api/brick/projects/:id              — 프로젝트 수정
POST   /api/brick/projects/sync             — .bkit/project.yaml → DB 동기화
```

### 8.2 불변식 CRUD

```
POST   /api/brick/invariants                — 불변식 등록
GET    /api/brick/invariants?project_id=X    — 불변식 목록 (project별)
GET    /api/brick/invariants/:id             — 불변식 상세 (+ 이력)
PUT    /api/brick/invariants/:id             — 불변식 갱신 (이력 자동 생성)
PATCH  /api/brick/invariants/:id/deprecate   — 불변식 폐기
```

### 8.3 프로젝트 대시보드 집계

```
GET    /api/brick/projects/:id/dashboard
Response: {
  project: { id, name, description },
  executions: {
    total: number,
    by_status: { pending: N, running: N, completed: N, failed: N },
  },
  invariants: {
    total: number,
    active: number,
    deprecated: number,
  },
  recent_executions: [{ id, feature, status, current_block, updated_at }],
}
```

### 8.4 API 상세 — 불변식 갱신

```
PUT /api/brick/invariants/INV-EB-3
Body: {
  constraint_value: { allowed: [...9개] },
  change_reason: "BlockStatus에 WAITING_APPROVAL, REJECTED 추가",
  changed_by: "brick-ceo-approval-gate.design.md"
}

처리:
1. 기존 행의 constraintValue → brick_invariant_history에 INSERT (이전 값 보존)
2. brick_invariants.constraintValue 갱신
3. brick_invariants.version += 1
4. brick_invariants.updatedAt 갱신

Response: { id, version, previous_version, history_id }
```

---

## 9. Gate 템플릿 변수 확장

### 9.1 현행 템플릿 변수

Gate handler의 `agent_prompt`, `command` 등에서 사용 가능한 변수:

| 변수 | 설명 | 예시 |
|------|------|------|
| `{feature}` | 현재 피처명 | `ceo-approval-gate` |
| `{artifact:path}` | 산출물 파일 내용 | `{artifact:docs/02-design/...}` |

### 9.2 추가 템플릿 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `{context.project.infrastructure}` | 인프라 제약 JSON | DB, 포트, 런타임 |
| `{context.project.invariants}` | 활성 불변식 목록 | INV-EB-1~11 |
| `{context.project.recent_failures}` | 최근 실패 목록 | 최근 10건 |

### 9.3 구현

```python
# brick/brick/gates/concrete.py — _resolve_template 확장

def _resolve_template(self, template: str, context: dict) -> str:
    """템플릿 변수 치환. {context.*} 경로 지원 추가."""
    result = template

    # 기존: {feature} 치환
    result = result.replace("{feature}", context.get("feature", ""))

    # 신규: {context.*} 경로 치환
    import re
    for match in re.finditer(r'\{context\.([^}]+)\}', result):
        path = match.group(1)
        value = self._resolve_path(context, path)
        if value is not None:
            formatted = json.dumps(value, ensure_ascii=False, indent=2) if isinstance(value, (dict, list)) else str(value)
            result = result.replace(match.group(0), formatted)

    return result

def _resolve_path(self, obj: dict, path: str):
    """점 표기법으로 중첩 dict 접근. 'project.infrastructure.db.type' → obj['project']['infrastructure']['db']['type']"""
    keys = path.split('.')
    current = obj
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current
```

---

## 10. 프리셋 호환성

### 10.1 기존 프리셋 변경 없음

`brick/preset-v2` 스키마에 변경 없음. 프로젝트 컨텍스트는 런타임에 context dict로 주입되며, 프리셋 YAML에 반영할 내용 없음.

### 10.2 프리셋에서 프로젝트 컨텍스트 활용 (선택)

불변식 검증 Gate를 넣고 싶으면 기존 프리셋의 design 블록에 gate handler를 추가. 프리셋 스키마 자체는 변경 불필요 (기존 `agent` 타입 gate로 충분).

```yaml
# 예시: t-pdca-l2.yaml에 불변식 검증 Gate 추가 (선택)
- id: design
  type: Design
  what: "상세 설계 + TDD 케이스"
  done:
    artifacts: ["docs/02-design/features/{feature}.design.md"]
  gate:
    handlers:
      - type: agent
        agent_prompt: |
          다음 설계 문서가 프로젝트 불변식을 위반하는지 검토하라.
          [설계 문서] {artifact:docs/02-design/features/{feature}.design.md}
          [활성 불변식] {context.project.invariants}
          [인프라 제약] {context.project.infrastructure}
          위반 시 verdict: fail. 위반 없으면 verdict: pass.
        timeout: 60
        on_fail: fail
```

---

## 11. 수정 파일 목록

| 파일 | 변경 | 내용 |
|------|------|------|
| `.bkit/project.yaml` | **신규** | 프로젝트 인프라 설정 파일 |
| `dashboard/server/db/schema/brick.ts` | 수정 | `brickProjects`, `brickInvariants`, `brickInvariantHistory` 테이블 추가. `brickExecutions`에 `projectId` 컬럼 추가 |
| `dashboard/server/db/create-schema.ts` | 수정 | 3개 테이블 CREATE + ALTER TABLE 추가 |
| `dashboard/server/db/seed-invariants.ts` | **신규** | INV-EB-1~11 초기 시드 |
| `dashboard/server/brick/project/context-builder.ts` | **신규** | `ProjectContextBuilder` 클래스 |
| `dashboard/server/brick/project/sync.ts` | **신규** | `project.yaml` → DB 동기화 로직 |
| `dashboard/server/brick/engine/bridge.ts` | 수정 | `startWorkflow`에 `initialContext` 파라미터 추가 |
| `dashboard/server/routes/brick/executions.ts` | 수정 | POST 라우트에 프로젝트 컨텍스트 주입 로직 |
| `dashboard/server/routes/brick/projects.ts` | **신규** | 프로젝트 CRUD API |
| `dashboard/server/routes/brick/invariants.ts` | **신규** | 불변식 CRUD API |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | start 엔드포인트에 `initial_context` 파라미터 추가 |
| `brick/brick/engine/executor.py` | 수정 | `start()`에 `initial_context` 파라미터 + context 병합 |
| `brick/brick/gates/concrete.py` | 수정 | `_resolve_template`에 `{context.*}` 경로 지원 추가 |

---

## 12. TDD 케이스

### 12.1 프로젝트 CRUD

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-001 | 프로젝트 생성 | `POST /api/brick/projects {id:"bscamp", name:"자사몰사관학교", infrastructure:{...}}` | 201, brick_projects에 1행 INSERT |
| PL-002 | 프로젝트 목록 조회 | `GET /api/brick/projects` | 200, 프로젝트 배열 반환 |
| PL-003 | 프로젝트 상세 조회 | `GET /api/brick/projects/bscamp` | 200, 프로젝트 + 실행 목록 + 불변식 포함 |
| PL-004 | 프로젝트 수정 | `PUT /api/brick/projects/bscamp {name:"변경"}` | 200, updated_at 갱신 |
| PL-005 | 존재하지 않는 프로젝트 조회 | `GET /api/brick/projects/nonexist` | 404 |
| PL-006 | project.yaml 동기화 | `POST /api/brick/projects/sync` | `.bkit/project.yaml` 내용이 DB에 반영 |

### 12.2 불변식 레지스트리

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-007 | 불변식 등록 | `POST /api/brick/invariants {id:"INV-PL-1", projectId:"bscamp", ...}` | 201, brick_invariants에 INSERT |
| PL-008 | 불변식 목록 조회 (active만) | `GET /api/brick/invariants?project_id=bscamp` | 활성 불변식만 반환 |
| PL-009 | 불변식 갱신 | `PUT /api/brick/invariants/INV-EB-3 {constraintValue:{...}, changeReason:"..."}` | version +1, brick_invariant_history에 이전 값 저장 |
| PL-010 | 불변식 갱신 이력 조회 | `GET /api/brick/invariants/INV-EB-3` (상세) | 이력 배열 포함 |
| PL-011 | 불변식 폐기 | `PATCH /api/brick/invariants/INV-EB-3/deprecate` | status='deprecated', context에서 제외 |
| PL-012 | 중복 ID 등록 거부 | `POST /api/brick/invariants {id:"INV-EB-1"}` (이미 존재) | 409 Conflict |
| PL-013 | 초기 시드 | 서버 시작 시 `seedInvariants("bscamp")` | INV-EB-1~11 총 11건 등록 (이미 존재 시 스킵) |

### 12.3 컨텍스트 빌드

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-014 | 정상 컨텍스트 빌드 | `builder.build("bscamp")` | infrastructure + invariants + recent_failures + recent_artifacts 포함 |
| PL-015 | 불변식 포함 확인 | 활성 불변식 5건 존재 | `context.invariants.length === 5` |
| PL-016 | deprecated 불변식 제외 | INV-EB-3 deprecated | context.invariants에 INV-EB-3 미포함 |
| PL-017 | 최근 실패 10건 제한 | 실패 20건 존재 | `context.recent_failures.length === 10`, 최신순 |
| PL-018 | 최근 산출물 20건 제한 | 산출물 50건 존재 | `context.recent_artifacts.length === 20`, 최신순 |
| PL-019 | 프로젝트 미존재 시 에러 | `builder.build("nonexist")` | Error: "Project not found: nonexist" |
| PL-020 | 실패/산출물 0건 | 실행 이력 없음 | `context.recent_failures === []`, `context.recent_artifacts === []` |

### 12.4 컨텍스트 주입

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-021 | 워크플로우 시작 시 컨텍스트 주입 | `POST /api/brick/executions {presetName:"t-pdca-l2", feature:"test", projectId:"bscamp"}` | Python 엔진에 `initial_context` 전달됨 |
| PL-022 | Python 엔진 context 병합 | `executor.start(initial_context={...})` | `instance.context["project"]` 존재 |
| PL-023 | 블록 간 컨텍스트 전파 | Plan 블록 → Design 블록 | Design 블록에서 `context["project"]["infrastructure"]["db"]["type"] === "sqlite"` |
| PL-024 | projectId 없이 시작 (기본 프로젝트) | `POST /api/brick/executions {presetName:"t-pdca-l2", feature:"test"}` | 기본 프로젝트 컨텍스트 주입 |
| PL-025 | initial_context 없이 시작 (하위호환) | Python 엔진 직접 호출, `initial_context=None` | `instance.context`에 `"project"` 키 없음, 정상 동작 |

### 12.5 Gate 템플릿

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-026 | `{context.project.infrastructure}` 치환 | Gate prompt에 해당 변수 포함 | JSON 문자열로 치환됨 |
| PL-027 | `{context.project.invariants}` 치환 | Gate prompt에 해당 변수 포함 | 불변식 배열 JSON으로 치환됨 |
| PL-028 | context에 해당 경로 없음 | `{context.project.nonexist}` | 치환 안 됨 (원문 유지) |
| PL-029 | 깊은 경로 접근 | `{context.project.infrastructure.db.type}` | `"sqlite"` |

### 12.6 프로젝트 대시보드

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-030 | 대시보드 집계 | `GET /api/brick/projects/bscamp/dashboard` | total, by_status, invariants 집계 반환 |
| PL-031 | 실행 0건 프로젝트 | 신규 프로젝트, 실행 없음 | `executions.total === 0`, `by_status` 모두 0 |

### 12.7 project.yaml 동기화

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| PL-032 | 최초 동기화 (DB에 없음) | `.bkit/project.yaml` 존재, DB에 해당 프로젝트 없음 | INSERT |
| PL-033 | 재동기화 (변경) | `.bkit/project.yaml` 수정 후 sync | UPDATE, updated_at 갱신 |
| PL-034 | project.yaml 없음 | 파일 미존재 | 스킵 (에러 아님, 경고 로그) |

---

## 13. 불변 규칙 준수

| 규칙 | 적용 |
|------|------|
| **INV-EB-1** POST는 엔진 경유 | 프로젝트 컨텍스트는 Express에서 조립 후 엔진에 전달. Express가 상태 전이하지 않음 |
| **INV-EB-2** Gate 결과 저장 | 불변식 검증 Gate 결과도 기존 `brick_gate_results`에 저장 |
| **INV-EB-3** BlockStatus 제한 | 이 Design은 BlockStatus를 변경하지 않음 |
| **INV-EB-7** ID 매핑 | `brick_executions.projectId`는 별도 FK. 기존 `engineWorkflowId` 매핑에 영향 없음 |
| **INV-EB-8** 컨텍스트 전파 | `initial_context`는 `instance.context["project"]`에 병합. 기존 전파 메커니즘 그대로 사용 |
| **INV-EB-10** 체크포인트 격리 | 프로젝트 레이어는 체크포인트 구조를 변경하지 않음. context에 추가 데이터만 포함 |

### 이 Design이 추가하는 불변식

| ID | 규칙 | 검증 시점 |
|----|------|----------|
| **INV-PL-1** | 프로젝트 컨텍스트는 `instance.context["project"]` 아래에만 존재. 기존 context 키를 덮어쓰지 않음 | PL-022, PL-025 |
| **INV-PL-2** | deprecated 불변식은 컨텍스트에 포함하지 않음. 활성 불변식만 주입 | PL-016 |
| **INV-PL-3** | `brick_invariants` 갱신 시 이전 값이 반드시 `brick_invariant_history`에 보존됨 | PL-009 |

---

## 14. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| `.bkit/project.yaml` 없는 프로젝트 | DB에서 직접 생성 가능. yaml 없이도 API로 관리 가능 |
| `brick_executions`의 기존 행 (project_id=NULL) | 정상 동작. 컨텍스트 주입 없이 기존 방식으로 실행 |
| 불변식 100건 이상 | 컨텍스트 크기 증가. 성능 영향은 미미 (JSON 직렬화). 필요 시 요약만 주입하고 상세는 API 참조 |
| 동시 2개 워크플로우가 같은 불변식 갱신 | SQLite WAL 모드 + busy_timeout=5000ms로 직렬화. 이력 2건 각각 저장 |
| Python 엔진에 initial_context 전달 실패 (엔진 구버전) | 엔진이 unknown 파라미터를 무시하면 정상 (context 없이 실행). 파싱 에러 시 502 → Express 로그 |
| 프로젝트 삭제 시 실행 이력 | 프로젝트 삭제 API 미제공 (active=0으로 비활성화만). FK 무결성 유지 |
| context 크기가 checkpoint 직렬화에 영향 | project context는 약 5-10KB. checkpoint JSON에 포함되어도 문제 없음 (기존 checkpoint 평균 50KB 이하) |
