# Agent Ops Phase 2 (에이전트 운영 2기) 설계서

## Wave 1: B1 requireApproval — 팀원 권한 제어 (P0)

### 1. 현재 문제

`validate-delegate.sh` line 38-43:
```bash
if [ "${IS_TEAMMATE:-}" = "true" ]; then
    if echo "$REL_FILE" | grep -q '\.claude/'; then
        echo "BLOCKED: ..." >&2
        exit 2  # 무조건 차단 → 팀원 pane 에러 상태로 멈춤
    fi
fi
```

**문제**: exit 2 = 팀원 작업 즉시 중단. 정당한 수정도 차단. 복구하려면 리더가 직접 수정 → delegate 위반.

### 2. 해결: 승인 파일 게이트

CC PreToolUse hook은 exit 0/2만 반환 가능 (대기 불가). 따라서 **"차단 + 승인 요청 → 재시도 시 승인 확인"** 패턴 적용.

```
1차 시도: 팀원 .claude/ 수정 → 승인 파일 확인 → 없음 → 요청 생성 + Slack 알림 → exit 2
(Smith님/COO가 Slack에서 승인 → 승인 파일 생성)
2차 시도: 팀원 .claude/ 수정 → 승인 파일 확인 → 있음 (5분 이내) → exit 0
```

### 3. 파일 구조

```
.claude/runtime/approvals/
├── pending/       ← 대기 중 요청
│   └── {key}.json   { file, tool, ts, teammate }
└── granted/       ← 승인 완료
    └── {key}        epoch timestamp (5분 TTL)
```

**key**: 파일 경로를 `sed 's/[^a-zA-Z0-9]/_/g'` 로 변환.

### 4. approval-handler.sh (신규 헬퍼)

```bash
_APPROVAL_DIR="${PROJECT_DIR}/.claude/runtime/approvals"

check_approval(rel_file) → return 0 (승인됨) / return 1 (미승인)
  - granted/{key} 파일 존재 확인
  - TTL 300초 (5분) 초과 시 만료 → return 1

request_approval(rel_file, tool_name) → 요청 파일 생성 + Slack 알림
  - pending/{key}.json 작성
  - agent-slack-notify.sh 또는 direct curl로 #agent-ops 알림
  - 알림 실패해도 exit 0 (요청 파일은 생성됨)
```

### 5. validate-delegate.sh 변경

```
AS-IS                                  TO-BE
────────────────────────────────────    ────────────────────────────────────
팀원 + .claude/ → exit 2 (차단)        팀원 + 승인대상 → check_approval
                                         ├─ 승인됨 → exit 0
                                         └─ 미승인 → request_approval → exit 2

팀원 + src/ → exit 0 (허용)           변경 없음

리더 + src/ → exit 2 (차단)           변경 없음 (승인 옵션 없음)
리더 + .claude/ → exit 0 (허용)       변경 없음
```

**승인 대상 확장** (Plan 요구):
| 패턴 | 현재 | 변경 후 |
|------|------|--------|
| `.claude/` | exit 2 차단 | 승인 게이트 |
| `migration` | 패스 (위험!) | 승인 게이트 |
| `.env` | 패스 | 승인 게이트 |
| `src/` (팀원) | exit 0 | 변경 없음 |
| `src/` (리더) | exit 2 | 변경 없음 |

### 6. TDD 설계

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|-----------|
| APR-1 | 팀원 + .claude/ + 승인 없음 | IS_TEAMMATE=true, file=.claude/hooks/x.sh | exit 2 + "BLOCKED" + pending 파일 생성 |
| APR-2 | 팀원 + migration + 승인 없음 | IS_TEAMMATE=true, file=supabase/migrations/001.sql | exit 2 + pending 파일 생성 |
| APR-3 | 팀원 + .claude/ + 승인 있음 | granted/{key} 파일 존재 (현재 시각) | exit 0 |
| APR-4 | 팀원 + .claude/ + 거부 파일 | granted/{key} 내용 "rejected" | exit 2 |
| APR-5 | 팀원 + .claude/ + 만료 승인 | granted/{key} = 10분 전 timestamp | exit 2 |
| APR-6 | approval-handler.sh 로드 실패 | helpers/ 디렉토리 없음 | exit 2 (기존 차단 fallback) |
| APR-7 | 리더 + src/ | IS_TEAMMATE=false, pane_index=0 | exit 2 (승인 없음, 무조건 차단) |
| APR-8 | 팀원 + src/ 일반 코드 | IS_TEAMMATE=true, file=src/app/page.tsx | exit 0 (승인 불필요) |
| APR-9 | 팀원 + .env 수정 | IS_TEAMMATE=true, file=.env.local | exit 2 + pending 파일 생성 |

### 7. 수정 파일

| 파일 | 변경 |
|------|------|
| `.claude/hooks/validate-delegate.sh` | 승인 게이트 로직 추가 (~15줄) |
| `.claude/hooks/helpers/approval-handler.sh` | **신규** — check/request 함수 (~45줄) |
| `__tests__/hooks/approval-gate.test.ts` | **신규** — APR-1~9 테스트 |

### 8. OFR-10~12 호환성

- OFR-10 (teammate + .claude/ → exit 2): **호환** — 승인 파일 없으면 여전히 exit 2 + "BLOCKED" 포함
- OFR-11 (teammate + src/ → exit 0): **호환** — 변경 없음
- OFR-12 (leader + .claude/ → exit 0): **호환** — 리더 로직 변경 없음
