# Design: CEO 승인 Gate 프리셋 (Approval Gate)

> **피처**: brick-ceo-approval-gate (CEO 승인 Gate)
> **레벨**: L2-기능
> **작성**: PM | 2026-04-03
> **선행**: brick-pdca-preset.design.md, brick-team-adapter.design.md (§4 수명관리), concrete.py (review gate)
> **Smith님 결정**: COO 검토 완료 후 CEO(Smith님) 승인 Gate를 거쳐야 CTO 구현으로 넘어감

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | T-PDCA L2 프리셋에 CEO 승인 Gate를 삽입하여, COO 검토 후 Smith님 승인 없이 구현으로 넘어가지 못하게 강제 |
| **핵심 변경** | 신규 `approval` Gate 타입 + `t-pdca-l2-approval` 프리셋 + 알림 채널 연동 |
| **현행 문제** | COO 검토 → 바로 CTO 구현. Smith님이 방향 검토할 기회 없음 |
| **수정 범위** | GateHandler 모델 확장, ConcreteGateExecutor approval 구현, 프리셋 YAML 1개 |
| **TDD** | AG-001 ~ AG-018 (18건) |

| 관점 | 내용 |
|------|------|
| **Problem** | COO 검토 완료 시 자동으로 CTO 구현 단계로 넘어감. Smith님이 방향성을 확인·수정할 타이밍 없음 |
| **Solution** | Design 블록과 Do 블록 사이에 `ceo_approval` Gate 삽입. Slack/대시보드로 승인 요청 → Smith님 승인/반려 |
| **Core Value** | "자율 실행 + 핵심 의사결정 Gate" — 자동화하되, 사업 방향은 CEO가 제어 |

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) — `dashboard/server/db/index.ts` |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **기존 불변식** | INV-EB-1~11 (engine-bridge Design 정의). 이 Design은 INV-EB-3을 9가지로 갱신 (§11.1) |
| **Slack 채널** | #brick-approvals: `C0AN7ATS4DD`, Smith님 DM: `D09V1NX98SK` |

---

## 1. 현행 흐름 vs 목표 흐름

### 1.1 현행 (t-pdca-l2)

```
[Plan] → [Design] → [Do] → [Check] → [Act]
  PM        PM       CTO     CTO      CTO
```

Design 완료 → 바로 Do. CEO 검토 없음.

### 1.2 목표 (t-pdca-l2-approval)

```
[Plan] → [Design] → [COO 검토] → ◆ CEO 승인 ◆ → [Do] → [Check] → [Act]
  PM        PM         COO       Smith님 Gate     CTO     CTO      CTO
```

- COO 검토: Design 산출물의 완성도·일관성 확인 (에이전트 자동)
- CEO 승인 Gate: Smith님이 방향성·우선순위 확인 후 승인/반려 (사람)

---

## 2. Approval Gate 스펙

### 2.1 GateHandler 확장

기존 `GateHandler`에 `approval` 타입 추가.

```python
# brick/brick/models/block.py — GateHandler 확장 필드

@dataclass
class ApprovalConfig:
    """승인 Gate 전용 설정."""
    approver: str = ""                  # 승인자 식별자: "smith", "ceo", 이메일 등
    channel: str = "slack"              # 알림 채널: "slack" | "dashboard" | "both"
    slack_channel: str = "C0AN7ATS4DD"        # Slack 채널 ID (#brick-approvals)
    dashboard_url: str = ""             # 대시보드 승인 URL 템플릿
    timeout_seconds: int = 86400        # 승인 대기 타임아웃 (기본 24시간)
    on_timeout: str = "escalate"        # 타임아웃 시: "escalate" | "auto_approve" | "reject"
    reminder_interval: int = 3600       # 리마인더 간격 (초, 기본 1시간)
    max_reminders: int = 3              # 최대 리마인더 횟수
    context_artifacts: list[str] = field(default_factory=list)  # 승인 요청 시 첨부할 산출물 경로
```

### 2.2 GateHandler type 추가

```python
# brick/brick/models/block.py — GateHandler.type에 "approval" 추가
# 기존: "command" | "http" | "prompt" | "agent" | "review"
# 추가: "approval" — 사람의 명시적 승인을 기다림

@dataclass
class GateHandler:
    type: str  # command | http | prompt | agent | review | approval
    # ... 기존 필드 ...
    approval: ApprovalConfig | None = None  # approval 타입일 때 사용
```

### 2.3 review vs approval 차이

| 항목 | review (기존) | approval (신규) |
|------|-------------|----------------|
| **목적** | 코드/산출물 품질 검토 | 사업 방향 승인/반려 |
| **주체** | 에이전트 또는 사람 | **사람 전용** (Smith님) |
| **알림** | 없음 (context에서 수동) | **자동 알림** (Slack/대시보드) |
| **리마인더** | 없음 | **자동 리마인더** (1시간 간격, 최대 3회) |
| **타임아웃** | auto_approve 기본 | **escalate 기본** (자동 승인 안 함) |
| **반려 시** | reject → 실패 | reject → **Design 블록으로 회귀** (사유 포함) |
| **context** | 없음 | **산출물 요약 자동 첨부** |

---

## 3. Approval Gate 실행 흐름

### 3.1 승인 요청 (Request)

```
Design 블록 완료
  → COO 검토 Gate 통과
  → Approval Gate 진입
    1. context_artifacts에서 산출물 수집
       - Plan 문서: docs/01-plan/features/{feature}.plan.md
       - Design 문서: docs/02-design/features/{feature}.design.md
    2. 산출물 요약 생성 (LLM prompt)
    3. 알림 전송:
       - Slack: #brick-approvals 채널에 승인 요청 메시지
       - Dashboard: /approvals/{execution_id} 페이지에 승인 UI 표시
    4. 블록 상태: GATE_CHECKING → WAITING_APPROVAL
    5. 타이머 시작: timeout_seconds (24시간)
```

### 3.2 승인 요청 메시지 포맷

```
📋 [CEO 승인 요청] {feature} — {preset_name}

▎요약
{LLM이 Plan+Design에서 추출한 3줄 요약}

▎산출물
• Plan: docs/01-plan/features/{feature}.plan.md
• Design: docs/02-design/features/{feature}.design.md

▎승인
  ✅ 승인: POST /api/brick/approve/{execution_id}
  ❌ 반려: POST /api/brick/reject/{execution_id}?reason={사유}
  🔗 대시보드: {dashboard_url}/approvals/{execution_id}

▎타임아웃: 24시간 후 escalate
```

### 3.3 승인 (Approve)

```
Smith님이 승인
  → POST /api/brick/approve/{execution_id}
  → GateResult(passed=True, detail="CEO 승인", metadata={approver: "smith", approved_at: ...})
  → 블록 상태: WAITING_APPROVAL → COMPLETED
  → 다음 블록(Do) QUEUED
```

### 3.4 반려 (Reject)

```
Smith님이 반려 (사유 포함)
  → POST /api/brick/reject/{execution_id}?reason="캘린더 기능보다 보고서 우선"
  → GateResult(passed=False, detail="CEO 반려: {reason}", metadata={...})
  → 블록 상태: WAITING_APPROVAL → REJECTED
  → Link 분기: coo_review → design (loop, condition: "approval_status == 'rejected'")
  → Design 블록에 반려 사유 context 전달
  → PM이 Design 수정 후 재제출
```

### 3.5 타임아웃

```
24시간 초과
  → on_timeout 정책 실행:
    - "escalate" (기본): Smith님 DM (D09V1NX98SK)으로 긴급 리마인더 전송
    - "auto_approve": 자동 승인 (비권장, L0/L1 핫픽스 전용)
    - "reject": 자동 반려
```

### 3.6 리마인더

```
매 reminder_interval (1시간)마다:
  → 리마인더 카운터 < max_reminders (3회) 인지 확인
  → Slack 리마인더 메시지 전송:
    "⏰ [리마인더] {feature} 승인 대기 중 ({n}/{max_reminders})"
  → max_reminders 초과 시 리마인더 중단, 타임아웃 대기
```

---

## 4. ConcreteGateExecutor 확장

### 4.1 _run_approval 메서드

```python
# brick/brick/gates/concrete.py — 추가

async def _run_approval(self, handler: GateHandler, context: dict) -> GateResult:
    """승인 Gate — 사람의 명시적 승인을 기다림."""
    approval_config = handler.approval
    if not approval_config:
        return GateResult(
            passed=False,
            detail="ApprovalConfig not provided",
            type="approval",
        )

    action = context.get("approval_action", "pending")
    execution_id = context.get("execution_id", "")
    feature = context.get("feature", "")

    # ── 승인 ──
    if action == "approve":
        return GateResult(
            passed=True,
            detail=f"CEO 승인: {approval_config.approver}",
            type="approval",
            metadata={
                "status": "approved",
                "approver": approval_config.approver,
                "approved_at": context.get("timestamp", ""),
            },
        )

    # ── 반려 ──
    if action == "reject":
        return GateResult(
            passed=False,
            detail=f"CEO 반려: {context.get('reject_reason', '')}",
            type="approval",
            metadata={
                "status": "rejected",
                "approver": approval_config.approver,
                "reject_reason": context.get("reject_reason", ""),
            },
        )

    # ── 타임아웃 ──
    if action == "timeout":
        on_timeout = approval_config.on_timeout
        if on_timeout == "auto_approve":
            return GateResult(
                passed=True,
                detail="타임아웃 자동 승인",
                type="approval",
                metadata={"status": "auto_approved"},
            )
        if on_timeout == "reject":
            return GateResult(
                passed=False,
                detail="타임아웃 자동 반려",
                type="approval",
                metadata={"status": "timeout_rejected"},
            )
        # escalate (기본) — Smith님 DM으로 긴급 알림
        await self._notify_slack_dm(context, f"⚠️ [긴급] {context.get('feature','')} 승인 요청 타임아웃. 확인 바랍니다.")
        return GateResult(
            passed=False,
            detail="타임아웃 — 긴급 에스컬레이션 (DM D09V1NX98SK)",
            type="approval",
            metadata={"status": "escalated"},
        )

    # ── 대기 중: 알림 전송 + 대기 상태 반환 ──
    await self._send_approval_notification(approval_config, context)
    return GateResult(
        passed=False,
        detail="CEO 승인 대기 중",
        type="approval",
        metadata={
            "status": "waiting",
            "approver": approval_config.approver,
            "channel": approval_config.channel,
            "timeout_seconds": approval_config.timeout_seconds,
        },
    )

async def _send_approval_notification(
    self, config: ApprovalConfig, context: dict
) -> None:
    """승인 요청 알림 전송."""
    # Slack 알림
    if config.channel in ("slack", "both"):
        await self._notify_slack(config, context)
    # Dashboard 알림
    if config.channel in ("dashboard", "both"):
        await self._notify_dashboard(config, context)

async def _notify_slack(self, config: ApprovalConfig, context: dict) -> None:
    """Slack 채널에 승인 요청 메시지 전송."""
    # Slack 채널 ID:
    #   승인 요청 채널: C0AN7ATS4DD (#brick-approvals)
    #   Smith님 DM (escalate/긴급 리마인더): D09V1NX98SK
    import httpx
    execution_id = context.get("execution_id", "")
    feature = context.get("feature", "")
    summary = context.get("summary", "")

    target_channel = config.slack_channel  # 기본: C0AN7ATS4DD
    payload = {
        "channel": target_channel,
        "text": f"📋 [CEO 승인 요청] {feature}",
        "blocks": [
            {"type": "header", "text": {"type": "plain_text", "text": f"📋 CEO 승인 요청: {feature}"}},
            {"type": "section", "text": {"type": "mrkdwn", "text": f"*요약*\n{summary}"}},
            {"type": "actions", "elements": [
                {"type": "button", "text": {"type": "plain_text", "text": "✅ 승인"},
                 "action_id": "approve", "value": execution_id, "style": "primary"},
                {"type": "button", "text": {"type": "plain_text", "text": "❌ 반려"},
                 "action_id": "reject", "value": execution_id, "style": "danger"},
            ]},
        ],
    }
    slack_token = os.environ.get("SLACK_BOT_TOKEN", "")
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://slack.com/api/chat.postMessage",
            json=payload,
            headers={"Authorization": f"Bearer {slack_token}"},
        )

async def _notify_slack_dm(self, context: dict, message: str) -> None:
    """Smith님 DM으로 긴급/에스컬레이션 메시지 전송."""
    import httpx
    payload = {"channel": "D09V1NX98SK", "text": message}
    slack_token = os.environ.get("SLACK_BOT_TOKEN", "")
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://slack.com/api/chat.postMessage",
            json=payload,
            headers={"Authorization": f"Bearer {slack_token}"},
        )

async def _notify_dashboard(self, config: ApprovalConfig, context: dict) -> None:
    """대시보드에 승인 대기 상태 기록."""
    # Dashboard API 호출 — POST /api/brick/approvals
    # Express 서버 (localhost:3200)에 승인 레코드 생성
    import httpx
    payload = {
        "execution_id": context.get("execution_id", ""),
        "feature": context.get("feature", ""),
        "approver": config.approver,
        "artifacts": config.context_artifacts,
        "summary": context.get("summary", ""),
        "timeout_at": context.get("timeout_at", ""),
    }
    async with httpx.AsyncClient() as client:
        await client.post("http://localhost:3200/api/brick/approvals", json=payload)
```

### 4.2 GateExecutor.execute 확장

```python
# brick/brick/gates/base.py — execute 메서드에 case 추가

async def execute(self, handler: GateHandler, context: dict) -> GateResult:
    match handler.type:
        # ... 기존 case ...
        case "approval":
            return await self._run_approval(handler, context)
```

---

## 5. BlockStatus 확장

```python
# brick/brick/models/events.py — BlockStatus에 추가

class BlockStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    GATE_CHECKING = "gate_checking"
    WAITING_APPROVAL = "waiting_approval"   # 신규: 사람 승인 대기
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"                   # 신규: 승인 반려
    SUSPENDED = "suspended"
```

---

## 6. 프리셋 YAML

### 6.1 t-pdca-l2-approval.yaml

```yaml
$schema: brick/preset-v2
name: "T-PDCA L2 + CEO 승인"
description: "일반 기능 개발 — Plan + Design + COO 검토 + CEO 승인 + Do + Check + Act"
level: 2

blocks:
  - id: plan
    type: Plan
    what: "요구사항 분석 + Plan 문서 작성"
    done:
      artifacts: ["docs/01-plan/features/{feature}.plan.md"]

  - id: design
    type: Design
    what: "상세 설계 + TDD 케이스"
    done:
      artifacts: ["docs/02-design/features/{feature}.design.md"]

  - id: coo_review
    type: Review
    what: "COO 산출물 검토 (완성도 + 일관성)"
    done:
      artifacts: []
    gate:
      handlers:
        - type: agent
          agent_prompt: |
            Design 문서 {design_artifact}를 검토하라.
            확인 항목: (1) TDD 섹션 존재 여부 (2) Plan과의 일관성 (3) 누락 기능 없는지.
            verdict: pass/fail + 사유.
          timeout: 300
          on_fail: fail

  - id: ceo_approval
    type: Approval
    what: "CEO(Smith님) 방향성 승인"
    done:
      artifacts: []
    gate:
      handlers:
        - type: approval
          approval:
            approver: smith
            channel: both
            slack_channel: "C0AN7ATS4DD"       # #brick-approvals
            dashboard_url: "/approvals"
            timeout_seconds: 86400
            on_timeout: escalate
            reminder_interval: 3600
            max_reminders: 3
            context_artifacts:
              - "docs/01-plan/features/{feature}.plan.md"
              - "docs/02-design/features/{feature}.design.md"
      evaluation: sequential

  - id: do
    type: Do
    what: "구현"
    done:
      artifacts: []
      metrics: {tsc_errors: 0, build_pass: true}

  - id: check
    type: Check
    what: "Gap 분석"
    done:
      metrics: {match_rate: 90}

  - id: act
    type: Act
    what: "배포 + 보고"
    done:
      artifacts: []

links:
  - {from: plan, to: design, type: sequential}
  - {from: design, to: coo_review, type: sequential}
  - {from: coo_review, to: ceo_approval, type: sequential}
  - {from: ceo_approval, to: do, type: sequential}                                    # 승인 시
  - {from: ceo_approval, to: design, type: loop, condition: {approval_status: rejected}, max_retries: 3}  # 반려 시 Design 회귀
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop, condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential}

teams:
  plan: {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  design: {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  coo_review: {adapter: claude_agent_teams, config: {session: sdk-coo, role: COO}}
  ceo_approval: {adapter: human, config: {approver: smith}}                            # 사람 전용
  do: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  check: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  act: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
```

### 6.2 L3에도 동일 패턴 적용 시

L3는 CEO 승인 + 보안 감사 2개 Gate:

```yaml
# 추가 블록만 표시 (L3 전용)
- id: ceo_approval
  type: Approval
  what: "CEO 승인"
  gate:
    handlers:
      - type: approval
        approval:
          approver: smith
          timeout_seconds: 86400
          on_timeout: escalate        # L3는 절대 auto_approve 금지

# ceo_approval 이후: do → check → security → act
```

---

## 7. Dashboard API

### 7.1 승인 요청 생성

```
POST /api/brick/approvals
Body: {
  execution_id: string,
  feature: string,
  approver: string,
  artifacts: string[],
  summary: string,          // LLM 생성 요약
  timeout_at: ISO8601,
}
Response: { approval_id: string, status: "waiting" }
```

### 7.2 승인/반려

```
POST /api/brick/approve/{execution_id}
Body: { approver: string, comment?: string }
Response: { status: "approved" }

POST /api/brick/reject/{execution_id}
Body: { approver: string, reason: string }
Response: { status: "rejected", reason: string }
```

### 7.3 승인 목록 조회

```
GET /api/brick/approvals?status=waiting
Response: { approvals: [{ execution_id, feature, created_at, timeout_at, summary }] }
```

### 7.4 대시보드 UI

```
/approvals/{execution_id} 페이지:
┌─────────────────────────────────────────────┐
│  📋 CEO 승인 요청: {feature}                  │
│                                             │
│  ▎요약                                      │
│  {3줄 요약}                                  │
│                                             │
│  ▎산출물                                    │
│  • Plan 문서  [보기]                          │
│  • Design 문서 [보기]                         │
│                                             │
│  ▎COO 검토 결과                              │
│  ✅ 통과 — "TDD 커버리지 충분, 일관성 확인"     │
│                                             │
│  [승인] [반려 (사유 입력)]                     │
│                                             │
│  ⏰ 타임아웃: 23시간 42분 남음                  │
└─────────────────────────────────────────────┘
```

---

## 8. DB 스키마

### 8.1 brick_approvals 테이블

> **DB**: SQLite (better-sqlite3 + drizzle-orm). UUID는 `uuid` npm 패키지로 앱 레이어 생성. JSONB → TEXT (JSON 문자열). RLS 없음 (SQLite 미지원, 앱 레이어에서 권한 검증).

```sql
-- dashboard/server/db/create-schema.ts에 추가
CREATE TABLE IF NOT EXISTS brick_approvals (
  id TEXT PRIMARY KEY,                                          -- uuid() 앱 레이어 생성
  execution_id INTEGER NOT NULL REFERENCES brick_executions(id),
  block_id TEXT NOT NULL,
  approver TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK(status IN ('waiting','approved','rejected','escalated','timeout')),
  summary TEXT,
  artifacts TEXT DEFAULT '[]',                                  -- JSON 문자열
  reject_reason TEXT,
  comment TEXT,
  reminder_count INTEGER DEFAULT 0,
  timeout_at TEXT NOT NULL,                                     -- ISO8601 문자열
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_brick_approvals_status ON brick_approvals(status);
CREATE INDEX IF NOT EXISTS idx_brick_approvals_execution ON brick_approvals(execution_id);
```

**PostgreSQL과의 차이 (참조용)**:
| PostgreSQL | SQLite (이 프로젝트) |
|------------|---------------------|
| `UUID DEFAULT gen_random_uuid()` | `TEXT` + 앱에서 `uuid()` |
| `JSONB` | `TEXT` (JSON 문자열, `JSON.parse()` 사용) |
| `TIMESTAMPTZ DEFAULT NOW()` | `TEXT DEFAULT (datetime('now'))` |
| RLS 정책 | 미지원 — Express 미들웨어에서 `approver` 검증 |

---

## 9. 수정 파일 목록

| 파일 | 변경 | 내용 |
|------|------|------|
| `brick/brick/models/block.py` | 수정 | `ApprovalConfig` dataclass 추가, `GateHandler.approval` 필드 추가 |
| `brick/brick/models/events.py` | 수정 | `BlockStatus`에 `WAITING_APPROVAL`, `REJECTED` 추가 |
| `brick/brick/gates/base.py` | 수정 | `execute()`에 `case "approval"` 추가 |
| `brick/brick/gates/concrete.py` | 수정 | `_run_approval()`, `_send_approval_notification()` 구현 |
| `brick/brick/presets/t-pdca-l2-approval.yaml` | 신규 | CEO 승인 프리셋 |
| `dashboard/server/api/brick/approvals.ts` | 신규 | 승인 API 엔드포인트 |
| `dashboard/src/pages/brick/ApprovalsPage.tsx` | 신규 | 승인 대시보드 UI |

---

## 10. TDD 케이스

### 10.1 Gate 실행

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| AG-001 | approval Gate 승인 | `action=approve, approver=smith` | `GateResult(passed=True, type="approval", metadata.status="approved")` |
| AG-002 | approval Gate 반려 | `action=reject, reason="우선순위 변경"` | `GateResult(passed=False, metadata.status="rejected", metadata.reject_reason=...)` |
| AG-003 | approval Gate 타임아웃 → escalate | `action=timeout, on_timeout=escalate` | `GateResult(passed=False, metadata.status="escalated")` |
| AG-004 | approval Gate 타임아웃 → auto_approve | `action=timeout, on_timeout=auto_approve` | `GateResult(passed=True, metadata.status="auto_approved")` |
| AG-005 | approval Gate 타임아웃 → reject | `action=timeout, on_timeout=reject` | `GateResult(passed=False, metadata.status="timeout_rejected")` |
| AG-006 | approval Gate 대기 중 | `action=pending` | `GateResult(passed=False, metadata.status="waiting")` |
| AG-007 | ApprovalConfig 없이 호출 | `handler.approval=None` | `GateResult(passed=False, detail="ApprovalConfig not provided")` |

### 10.2 프리셋 흐름

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| AG-008 | Design 완료 → COO 검토 통과 → CEO 승인 → Do 시작 | Do 블록 QUEUED |
| AG-009 | CEO 반려 → Design 회귀 | Design 블록 QUEUED, 반려 사유 context에 포함 |
| AG-010 | CEO 반려 3회 → max_retries 초과 | 워크플로우 FAILED |
| AG-011 | COO 검토 실패 → CEO 승인에 도달하지 않음 | coo_review FAILED, ceo_approval PENDING 유지 |

### 10.3 알림

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| AG-012 | 승인 요청 시 Slack 알림 | Slack webhook 호출 1회 |
| AG-013 | 승인 요청 시 Dashboard 알림 | brick_approvals INSERT 1건 |
| AG-014 | 리마인더 1시간 후 전송 | Slack 리마인더 메시지 1회, reminder_count=1 |
| AG-015 | 리마인더 3회 초과 시 중단 | reminder_count=3 이후 추가 전송 없음 |

### 10.4 API

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| AG-016 | POST /api/brick/approve/{id} | status=approved, resolved_at 기록 |
| AG-017 | POST /api/brick/reject/{id} | status=rejected, reject_reason 기록 |
| AG-018 | GET /api/brick/approvals?status=waiting | 대기 중 승인 목록 반환 |

---

## 11. 불변 규칙 준수

| 규칙 | 적용 |
|------|------|
| **INV-1** 블록은 완료 조건 충족 시에만 완료 | approval Gate 통과 = CEO 승인 완료 |
| **INV-2** Gate 통과 없이 다음 블록 불가 | approval Gate failed → Do 진행 불가 |
| **INV-3** 팀 경계 불침범 | ceo_approval은 `adapter: human` — 에이전트 우회 불가 |
| **HP-004** 도구=권한 | approval 블록에 에이전트 도구 없음 — 사람만 결정 |

### 11.1 INV-EB-3 갱신 (BlockStatus 확장)

이 Design은 `BlockStatus`에 `WAITING_APPROVAL`, `REJECTED` 2개를 추가한다 (§5).
engine-bridge Design의 **INV-EB-3**은 현재 "BlockStatus 7가지만 허용"으로 정의되어 있으므로, 이 Design 구현 시 반드시 INV-EB-3을 아래와 같이 갱신해야 한다.

| 변경 전 (INV-EB-3) | 변경 후 (INV-EB-3) |
|----|----|
| blocksState의 status 값은 Python BlockStatus enum의 **7가지**만 허용 | blocksState의 status 값은 Python BlockStatus enum의 **9가지**만 허용 |

**갱신 후 9가지 허용값:**
`pending`, `queued`, `running`, `gate_checking`, `completed`, `failed`, `suspended`, **`waiting_approval`**, **`rejected`**

**갱신 대상 파일:**
- `docs/02-design/features/brick-engine-bridge.design.md` — INV-EB-3 행 수정
- `brick/brick/models/events.py` — BlockStatus enum에 2개 추가
- engine-bridge TDD EB-043 — 검증 대상 status 목록에 2개 추가

**구현 순서:** 이 피처 구현 시 BlockStatus 확장을 **첫 번째 커밋**으로 수행한 뒤, approval Gate 로직을 구현한다. 역순 시 EB-043 테스트가 실패한다.

---

## 12. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| Smith님 부재 24시간+ | on_timeout: escalate → Slack DM 긴급 알림. auto_approve 안 함 |
| 동시 다중 승인 요청 | 각 execution_id별 독립 승인. 대시보드에서 목록으로 관리 |
| 반려 후 Design 수정 → 재제출 | ceo_approval 블록 재실행. 이전 반려 사유 context에 포함 |
| L0/L1 핫픽스 | t-pdca-l0, l1 프리셋은 approval Gate 없음. 기존 흐름 유지 |
| 네트워크 장애로 Slack 알림 실패 | Dashboard 알림으로 폴백. 둘 다 실패 시 재시도 3회 후 로그 |
