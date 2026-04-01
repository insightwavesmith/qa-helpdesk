# Hook Hardening V2 (훅 보강 2차) Design

> 작성일: 2026-04-01
> 프로세스 레벨: L2-기능
> 작성자: PM 리더
> Plan: `docs/01-plan/features/hook-hardening-v2.plan.md`
> 이슈 근거: `docs/issues/operational-issues.md` OI-001, 007~017

---

## 1. 시스템 아키텍처

### 현재 hook 레이어

```
PreToolUse:Bash (13개)
  ├── destructive-detector.sh
  ├── pane-access-guard.sh
  ├── enforce-spawn.sh
  ├── prevent-tmux-kill.sh
  ├── validate-coo-approval.sh
  ├── validate-task-fields.sh
  ├── validate-slack-payload.sh
  ├── validate-qa.sh
  ├── validate-pdca.sh
  ├── validate-task.sh
  ├── enforce-qa-before-merge.sh
  ├── validate-deploy-authority.sh
  └── postmortem-review-gate.sh

PreToolUse:Edit|Write (3개)
  ├── validate-delegate.sh
  ├── validate-plan.sh
  └── validate-design.sh

PreToolUse:Agent (1개)
  └── enforce-teamcreate.sh

PreToolUse:Task (1개)
  └── validate-before-delegate.sh

PreToolUse:TeamDelete (1개)
  └── validate-pdca-before-teamdelete.sh

TaskCompleted (9개)
  ├── task-completed.sh
  ├── task-quality-gate.sh      ← OI-010: 순서 변경 필요
  ├── gap-analysis.sh            ← OI-010: 순서 변경 필요
  ├── pdca-update.sh
  ├── filter-completion-dm.sh
  ├── notify-completion.sh       ← OI-008: retry 추가
  ├── deploy-trigger.sh
  ├── deploy-verify.sh
  └── pdca-chain-handoff.sh      ← OI-017: 게이트 추가
```

### V2 변경 후 hook 레이어

```
PreToolUse:Bash (15개 — +2 신규)
  ├── destructive-detector.sh
  ├── pane-access-guard.sh
  ├── enforce-spawn.sh
  ├── prevent-tmux-kill.sh
  ├── validate-coo-approval.sh
  ├── validate-task-fields.sh
  ├── validate-slack-payload.sh
  ├── bash-file-write-guard.sh   ★ F-1 신규 (OI-007)
  ├── validate-task-before-message.sh  ★ F-7 신규 (OI-015)
  ├── validate-qa.sh
  ├── validate-pdca.sh            ← F-6 수정 (OI-012)
  ├── validate-task.sh
  ├── enforce-qa-before-merge.sh
  ├── validate-deploy-authority.sh
  └── postmortem-review-gate.sh

TaskCompleted (9개 — 순서 변경)
  ├── task-completed.sh
  ├── gap-analysis.sh            ← #2로 이동 (OI-010)
  ├── task-quality-gate.sh       ← #3으로 이동 (OI-010)
  ├── pdca-update.sh
  ├── filter-completion-dm.sh
  ├── notify-completion.sh       ← F-2 수정: retry-queue 연동
  ├── deploy-trigger.sh
  ├── deploy-verify.sh
  └── pdca-chain-handoff.sh      ← F-7 수정: Plan/Design 게이트
```

---

## 2. Feature 상세 설계

### F-1: bash-file-write-guard.sh (OI-007)

**목적**: Bash 명령으로 파일 수정 시 역할 경계 강제

**동작 흐름**:
```
stdin JSON 파싱 → command 추출
  │
  ├── 팀원? → exit 0 (팀원은 Bash 파일 수정 허용)
  │
  ├── 파일 쓰기 패턴 감지 (11개):
  │   sed -i, awk >file, perl -i, python3 write, node writeFile,
  │   cat >file, echo >file, tee file, cp to_file, mv to_file, dd of=file
  │
  ├── 대상 경로 추출
  │   └── 허용 목록:
  │       docs/*, .bkit/state/*, .bkit/runtime/*, .bkit/hooks/helpers/*,
  │       /tmp/*, TASK*.md, CLAUDE*.md, *.log, package.json, tsconfig.json
  │
  ├── 허용 경로 → exit 0
  └── 비허용 경로 → log_block + exit 2
```

**정규식 패턴**:
```bash
# 파일 쓰기 감지 패턴
WRITE_PATTERNS=(
    'sed\s+-i'
    'awk\s.*>\s*\S+'
    'perl\s+-i'
    "python3?\s+-c\s.*open\(.*['\"]w['\"]"
    "node\s+-e\s.*writeFile"
    'cat\s.*>\s*\S+'
    'echo\s.*>\s*\S+'
    'printf\s.*>\s*\S+'
    'tee\s+\S+'
    'cp\s+\S+\s+\S+'
    'mv\s+\S+\s+\S+'
    'dd\s.*of='
)
```

**허용 경로 정규식**:
```bash
ALLOWED_PATHS='(docs/|\.bkit/(state|runtime|hooks/helpers)/|/tmp/|TASK|CLAUDE|\.log$|package\.json|tsconfig\.json|\.md$)'
```

---

### F-2: slack-defense (OI-008)

**2-1: notify-completion.sh 수정**

현재 send_slack 함수에서 실패 시 exit 0. 변경:
```bash
# 실패 시 retry-queue에 적재
if [ "$HTTP" != "200" ]; then
    source "$(dirname "$0")/helpers/slack-retry-queue.sh" 2>/dev/null
    enqueue_slack "$CHANNEL" "$SAFE_MSG" "$TARGET"
fi
```

**2-2: slack-retry-queue.sh (신규 helper)**

```bash
# 큐 파일: .bkit/runtime/slack-retry-queue.json
# 스키마:
# { "queue": [
#     { "ts": "...", "channel": "...", "message": "...", "target": "...", "retries": 0 }
# ]}

enqueue_slack() {
    local channel="$1" message="$2" target="$3"
    local queue_file="$PROJECT_DIR/.bkit/runtime/slack-retry-queue.json"
    # jq로 queue 배열에 append
}
```

**2-3: slack-watchdog.sh (크론 — 5분)**

```bash
# 1. git log --since="5 minutes ago" 에서 커밋 목록 추출
# 2. .bkit/runtime/slack-sent-log.json에서 전송 기록 대조
# 3. 커밋은 있는데 알림 없으면 → Smith님 DM으로 경고
# 4. slack-retry-queue.json에서 미전송 건 재시도 (최대 3회)
```

---

### F-3: deadlock-recovery (OI-014)

**3-1: validate-pdca-before-teamdelete.sh 수정**

```bash
# 기존 코드 앞에 추가:
if [ "${FORCE_DELETE:-}" = "true" ]; then
    echo "⚠ [PDCA 게이트] 강제 삭제 모드 — PDCA 검증 스킵"
    # Slack 경고
    source "$(dirname "$0")/helpers/slack-retry-queue.sh" 2>/dev/null
    enqueue_slack "$SLACK_CHANNEL" "⚠ FORCE_DELETE로 팀 삭제됨" "force-delete"
    exit 0
fi
```

**3-2: session-resume-check.sh 수정**

```bash
# 좀비 팀 감지 로직 추가:
for team_dir in "$HOME/.claude/teams"/*/; do
    config="$team_dir/config.json"
    if [ -d "$team_dir" ] && [ ! -f "$config" ]; then
        echo "⚠ 좀비 팀 감지: $(basename "$team_dir") — config.json 없음"
        echo "  자동 정리: rm -rf $team_dir"
        rm -rf "$team_dir"
    fi
done
```

**3-3: validate-delegate.sh 허용 목록 추가**

기존 허용 패턴에 추가:
```
.claude/teams/*/config.json
```

---

### F-4: mock-env-guard (OI-009)

**대상 파일**: pane-access-guard.sh, filter-completion-dm.sh

```bash
# 기존:
if [ -n "${MOCK_CALLER_PANE:-}" ]; then
    CALLER_PANE="$MOCK_CALLER_PANE"

# 수정:
if [ -n "${MOCK_CALLER_PANE:-}" ]; then
    if [ "${BKIT_TEST:-}" != "true" ]; then
        echo "⚠ MOCK_ 변수 무시 (프로덕션 환경)" >&2
        # MOCK_ 값 사용 안 함 — 실제 pane 조회
    else
        CALLER_PANE="$MOCK_CALLER_PANE"
    fi
```

---

### F-5: hook-order-fix (OI-010)

**settings.local.json TaskCompleted 배열 변경**:

```
현재 순서:                    수정 순서:
1. task-completed.sh          1. task-completed.sh
2. task-quality-gate.sh  ←    2. gap-analysis.sh        ★ 위로
3. gap-analysis.sh       ←    3. task-quality-gate.sh   ★ 아래로
4. pdca-update.sh             4. pdca-update.sh
5. filter-completion-dm.sh    5. filter-completion-dm.sh
6. notify-completion.sh       6. notify-completion.sh
7. deploy-trigger.sh          7. deploy-trigger.sh
8. deploy-verify.sh           8. deploy-verify.sh
9. pdca-chain-handoff.sh      9. pdca-chain-handoff.sh
```

---

### F-6: pdca-stale-fix (OI-012)

**validate-pdca.sh 수정 — Track B 경로 스킵**:

```bash
# git commit 감지 후, staged 파일이 Track B만인지 확인
STAGED=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

# Track B 판별: src/ 파일이 하나도 없으면 스킵
HAS_SRC=$(echo "$STAGED" | grep -c "^src/" || true)
if [ "$HAS_SRC" -eq 0 ]; then
    echo "✅ [PDCA] Track B 작업 (src/ 미수정) — PDCA 검증 스킵"
    exit 0
fi
```

**삽입 위치**: validate-pdca.sh의 `IS_COMMIT=true` 확인 직후, PDCA 파일 체크 전

---

### F-7: t-stage-enforcement (OI-015, 016, 017) ★핵심

**7-1: validate-task-before-message.sh (OI-015)**

```
트리거: PreToolUse:Bash
감지: command에 'claude-peers.*send_message' 또는 'send_message' 포함
조건: 
  1. 현재 세션이 COO인지 확인 (peer-map.json의 role)
  2. COO가 아니면 → exit 0 (이 hook은 COO 전용)
  3. COO이면:
     a. TASK 파일 존재 체크
     b. coo_approved: true 체크
     c. 둘 다 없으면 → exit 2 "TASK 먼저 작성하세요"
```

**7-2: route-to-coo.sh (OI-016)**

이것은 기존 hook 구조로 구현 어려움. claude-peers 메시지 인입은 hook이 아닌 **세션 내 프롬프트**로 들어옴.

**대안 설계**:
- CLAUDE.md에 규칙 추가: "Smith님 직접 메시지 수신 시, COO에 자동 전달 후 대기"
- 또는 SessionStart hook에서 "Smith님 메시지 감지 → COO 포워딩" 로직
- **현실적 구현**: 팀 세션의 CLAUDE.md에 행동 규칙으로 강제 (hook 불가, 프롬프트 레벨 강제)

```markdown
# 팀 세션 CLAUDE.md 추가 규칙:
Smith님(Owner)으로부터 직접 메시지를 받으면:
1. 즉시 실행하지 않는다
2. COO(모찌)에게 claude-peers send_message로 전달한다
3. "Smith님 지시를 COO에 전달했습니다. COO가 TASK를 만들면 진행합니다" 응답
```

**7-3: pdca-chain-handoff.sh 게이트 (OI-017)**

```bash
# CTO 전달 전 Plan/Design 체크 (기존 코드에 추가)
# 위치: "CTO 팀에 전달" 로직 직전

LEVEL=$(jq -r '.level // "L2"' "$TASK_FILE" 2>/dev/null)

if [ "$LEVEL" = "L2" ] || [ "$LEVEL" = "L3" ]; then
    PLAN_COUNT=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.plan.md" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
    DESIGN_COUNT=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "${PLAN_COUNT:-0}" -eq 0 ]; then
        echo "❌ [체인 차단] CTO 전달 불가 — Plan 문서 없음 ($LEVEL)" >&2
        exit 2  # → 체인 중단, COO에 보고
    fi
    if [ "${DESIGN_COUNT:-0}" -eq 0 ]; then
        echo "❌ [체인 차단] CTO 전달 불가 — Design 문서 없음 ($LEVEL)" >&2
        exit 2
    fi
fi

if [ "$LEVEL" = "L1" ]; then
    DESIGN_COUNT=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -mmin -120 -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "${DESIGN_COUNT:-0}" -eq 0 ]; then
        echo "❌ [체인 차단] CTO 전달 불가 — Design 문서 없음 (L1)" >&2
        exit 2
    fi
fi
```

---

### F-8: runtime-integrity (OI-011, 013) — 2차 스프린트

**8-1: json-checksum.sh**

```bash
write_with_checksum() {
    local file="$1" content="$2"
    echo "$content" > "$file"
    sha256sum "$file" > "${file}.sha256"
}

verify_checksum() {
    local file="$1"
    [ ! -f "${file}.sha256" ] && return 1
    sha256sum -c "${file}.sha256" --status 2>/dev/null
}
```

**8-2: runtime-integrity-check.sh (일일 크론)**

```bash
for json_file in "$PROJECT_DIR/.bkit/runtime"/*.json; do
    if ! verify_checksum "$json_file"; then
        echo "⚠ 무결성 위반: $json_file"
        # Slack 알림 + block-log 기록
    fi
done
```

---

## 3. settings.local.json 최종 hook 배열

### PreToolUse:Bash (15개)

```json
[
  "destructive-detector.sh",
  "pane-access-guard.sh",
  "enforce-spawn.sh",
  "prevent-tmux-kill.sh",
  "validate-coo-approval.sh",
  "validate-task-fields.sh",
  "validate-slack-payload.sh",
  "bash-file-write-guard.sh",
  "validate-task-before-message.sh",
  "validate-qa.sh",
  "validate-pdca.sh",
  "validate-task.sh",
  "enforce-qa-before-merge.sh",
  "validate-deploy-authority.sh",
  "postmortem-review-gate.sh"
]
```

### TaskCompleted (9개 — 순서 수정)

```json
[
  "task-completed.sh",
  "gap-analysis.sh",
  "task-quality-gate.sh",
  "pdca-update.sh",
  "filter-completion-dm.sh",
  "notify-completion.sh",
  "deploy-trigger.sh",
  "deploy-verify.sh",
  "pdca-chain-handoff.sh"
]
```

---

## 4. 수정 파일 목록

| # | 파일 | 변경 유형 | Feature |
|---|------|----------|---------|
| 1 | `.bkit/hooks/bash-file-write-guard.sh` | **신규** | F-1 |
| 2 | `.bkit/hooks/validate-task-before-message.sh` | **신규** | F-7 |
| 3 | `.bkit/hooks/helpers/slack-retry-queue.sh` | **신규** | F-2 |
| 4 | `.bkit/cron/slack-watchdog.sh` | **신규** | F-2 |
| 5 | `.bkit/cron/runtime-integrity-check.sh` | **신규** | F-8 |
| 6 | `.bkit/hooks/helpers/json-checksum.sh` | **신규** | F-8 |
| 7 | `.bkit/hooks/notify-completion.sh` | 수정 | F-2 |
| 8 | `.bkit/hooks/validate-pdca-before-teamdelete.sh` | 수정 | F-3 |
| 9 | `.bkit/hooks/session-resume-check.sh` | 수정 | F-3 |
| 10 | `.bkit/hooks/validate-delegate.sh` | 수정 | F-3 |
| 11 | `.bkit/hooks/pane-access-guard.sh` | 수정 | F-4 |
| 12 | `.bkit/hooks/filter-completion-dm.sh` | 수정 | F-4 |
| 13 | `.bkit/hooks/validate-pdca.sh` | 수정 | F-6 |
| 14 | `.bkit/hooks/pdca-chain-handoff.sh` | 수정 | F-7 |
| 15 | `.claude/settings.local.json` | 수정 | F-1, F-5, F-7 |
| 16 | `CLAUDE.md` | 수정 | F-7 (route-to-coo 규칙) |

---

## 5. TDD 테스트 설계 — 100% Gap 검증용

> **규칙**: TDD 케이스는 Design의 모든 동작을 1:1로 검증한다. 
> Gap 분석 시 "Design에 있는데 테스트에 없음" = 0건이어야 함.

### F-1: bash-file-write-guard 테스트

| ID | 테스트 | 입력 | 기대 결과 |
|----|--------|------|----------|
| T-F1-01 | sed -i로 src/ 수정 → 차단 | `sed -i 's/a/b/' src/app/page.tsx` | exit 2 |
| T-F1-02 | python3으로 src/ 쓰기 → 차단 | `python3 -c "open('src/x.ts','w').write('x')"` | exit 2 |
| T-F1-03 | cat heredoc으로 src/ 쓰기 → 차단 | `cat > src/x.ts <<EOF ... EOF` | exit 2 |
| T-F1-04 | cp로 src/ 덮어쓰기 → 차단 | `cp /tmp/x.ts src/app/page.tsx` | exit 2 |
| T-F1-05 | echo >로 src/ 쓰기 → 차단 | `echo "x" > src/app/page.tsx` | exit 2 |
| T-F1-06 | mv로 src/ 교체 → 차단 | `mv /tmp/x.ts src/app/page.tsx` | exit 2 |
| T-F1-07 | tee로 src/ 쓰기 → 차단 | `echo "x" \| tee src/app/page.tsx` | exit 2 |
| T-F1-08 | node -e로 src/ 쓰기 → 차단 | `node -e "require('fs').writeFileSync('src/x.ts','x')"` | exit 2 |
| T-F1-09 | awk >로 src/ 쓰기 → 차단 | `awk '{print}' > src/x.ts` | exit 2 |
| T-F1-10 | perl -i로 src/ 수정 → 차단 | `perl -i -pe 's/a/b/' src/x.ts` | exit 2 |
| T-F1-11 | dd of=로 src/ 쓰기 → 차단 | `dd if=/tmp/x of=src/x.ts` | exit 2 |
| T-F1-12 | sed -i로 docs/ 수정 → 허용 | `sed -i 's/a/b/' docs/README.md` | exit 0 |
| T-F1-13 | cp로 .bkit/state/ → 허용 | `cp x.json .bkit/state/x.json` | exit 0 |
| T-F1-14 | echo >로 /tmp/ → 허용 | `echo "x" > /tmp/test.txt` | exit 0 |
| T-F1-15 | 팀원이 sed -i src/ → 허용 | IS_TEAMMATE=true + sed src/ | exit 0 |
| T-F1-16 | 비-tmux → 허용 | TMUX="" + sed src/ | exit 0 |
| T-F1-17 | printf >로 src/ 쓰기 → 차단 | `printf "x" > src/x.ts` | exit 2 |

### F-2: slack-defense 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F2-01 | send_slack 실패 → retry-queue에 적재 | queue JSON에 1건 추가 |
| T-F2-02 | send_slack 성공 → retry-queue 미적재 | queue 변화 없음 |
| T-F2-03 | SLACK_BOT_TOKEN unset 감지 | 경고 로그 + retry-queue에 적재 |
| T-F2-04 | watchdog: 커밋 있는데 알림 없음 → 재전송 | Slack DM 발송 |
| T-F2-05 | watchdog: 커밋+알림 매칭 → 무동작 | 정상 통과 |
| T-F2-06 | retry-queue 3회 초과 → 포기 + 마커 | /tmp/slack-failed.marker 생성 |

### F-3: deadlock-recovery 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F3-01 | FORCE_DELETE=true → PDCA 스킵 | exit 0 |
| T-F3-02 | FORCE_DELETE 미설정 → 기존 동작 | PDCA 파일 체크 |
| T-F3-03 | 좀비 팀 (config.json 없음) → 자동 정리 | 디렉토리 삭제 |
| T-F3-04 | 정상 팀 (config.json 있음) → 유지 | 디렉토리 보존 |
| T-F3-05 | .claude/teams/*/config.json Edit → 허용 | exit 0 (validate-delegate) |

### F-4: mock-env-guard 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F4-01 | MOCK_CALLER_PANE=0 + BKIT_TEST="" → 무시 | 실제 pane 조회 |
| T-F4-02 | MOCK_CALLER_PANE=0 + BKIT_TEST=true → 적용 | pane 0으로 인식 |
| T-F4-03 | MOCK_ 없음 → 기존 동작 | 실제 pane 조회 |

### F-5: hook-order-fix 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F5-01 | settings.local.json에서 gap-analysis가 quality-gate보다 앞 | 배열 인덱스 확인 |

### F-6: pdca-stale-fix 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F6-01 | staged=docs/만 + pdca 오래됨 → 스킵 | exit 0 |
| T-F6-02 | staged=src/ + pdca 오래됨 → 차단 | exit 2 |
| T-F6-03 | staged=.bkit/만 + pdca 오래됨 → 스킵 | exit 0 |
| T-F6-04 | staged=src/+docs/ + pdca 최신 → 통과 | exit 0 |

### F-7: t-stage-enforcement 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F7-01 | COO send_message + TASK 없음 → 차단 | exit 2 |
| T-F7-02 | COO send_message + TASK + coo_approved → 허용 | exit 0 |
| T-F7-03 | 비-COO send_message → 패스 | exit 0 |
| T-F7-04 | chain-handoff L2 + Plan 없음 → 차단 | exit 2 |
| T-F7-05 | chain-handoff L2 + Plan+Design 있음 → 허용 | exit 0 |
| T-F7-06 | chain-handoff L1 + Design 없음 → 차단 | exit 2 |
| T-F7-07 | chain-handoff L1 + Design 있음 → 허용 | exit 0 |
| T-F7-08 | chain-handoff L0 → Plan/Design 스킵 | exit 0 |

### F-8: runtime-integrity 테스트

| ID | 테스트 | 기대 결과 |
|----|--------|----------|
| T-F8-01 | write_with_checksum → 체크섬 파일 생성 | .sha256 존재 |
| T-F8-02 | 파일 변조 후 verify → 실패 | return 1 |
| T-F8-03 | 정상 파일 verify → 성공 | return 0 |

---

## 6. 완료 게이트

- [ ] F-1~F-7 전체 구현 완료
- [ ] TDD 테스트: T-F1-01 ~ T-F8-03 (총 47건) 전량 PASS
- [ ] shell 테스트 기존 63건 regression 없음
- [ ] block-logger EXIT trap 신규 hook 포함
- [ ] settings.local.json hook 순서 Plan 일치
- [ ] operational-issues.md OI-007~017 → Resolved 상태 변경
- [ ] Gap 분석 Match Rate 100% (TDD = Design 1:1 대응)
