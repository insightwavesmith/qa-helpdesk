#!/bin/bash
# validate-before-delegate.sh — 팀원 위임 전 구조분석/설계 체크
# PreToolUse hook: 팀원 생성(Task tool) 시 TASK별 분석 문서가 있는지 확인
# exit 2 = 차단 (게이트)
#
# 체크 대상: 리더가 팀원에게 위임하려면 다음 중 하나가 존재해야 함
# - docs/01-plan/features/*.plan.md (최근 30분 이내 수정)
# - ANALYSIS-*.md (프로젝트 루트, 최근 30분 이내)
# - DEV-STATUS.md에 "구조 분석" 또는 "설계" 관련 기록 (최근 30분)

# V3: PID 역추적 자동 등록 (실패해도 계속)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

INPUT=$(cat)

# Task tool (팀원 위임)인지 확인
TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_name', ''))
except:
    print('')
" 2>/dev/null)

# Task tool이 아니면 패스 (팀원 위임이 아님)
if [ "$TOOL_NAME" != "Task" ]; then
    exit 0
fi

# 위임 내용 추출
TASK_DESC=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('description', '') or ti.get('task', '') or ti.get('prompt', '') or '')
except:
    print('')
" 2>/dev/null)

PROJECT_DIR="/Users/smith/projects/bscamp"

# ── 1. TASK 파일 존재 확인 ──
TASK_FILES=$(find "$PROJECT_DIR" -maxdepth 1 -name "TASK*.md" -not -name "TASK.template.md" -type f 2>/dev/null)
if [ -z "$TASK_FILES" ]; then
    MSG="🚫 [위임 차단] TASK 파일 없이 팀원 위임 시도. TASK.md 먼저 작성해라."
    /opt/homebrew/bin/openclaw message send --channel slack --account mozzi --target U06BP49UEJD --message "$MSG" 2>/dev/null &
    echo "❌ TASK 파일이 없습니다. TASK.md를 먼저 작성하세요." >&2
    exit 2
fi

# ── 2. 구조분석/설계 문서 확인 (최근 60분 이내 수정) ──
RECENT_PLAN=$(find "$PROJECT_DIR/docs/01-plan/features" -name "*.plan.md" -mmin -60 -type f 2>/dev/null | head -1)
RECENT_ANALYSIS=$(find "$PROJECT_DIR" -maxdepth 1 -name "ANALYSIS-*.md" -mmin -60 -type f 2>/dev/null | head -1)
RECENT_DESIGN=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -mmin -60 -type f 2>/dev/null | head -1)

# DEV-STATUS.md에 구조분석 기록 확인 (최근 60분)
DEV_STATUS_RECENT=""
if [ -f "$PROJECT_DIR/DEV-STATUS.md" ]; then
    DEV_STATUS_MOD=$(stat -f %m "$PROJECT_DIR/DEV-STATUS.md" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    DIFF=$(( (NOW - DEV_STATUS_MOD) / 60 ))
    if [ "$DIFF" -lt 60 ]; then
        # 구조분석/설계 관련 키워드가 있는지
        if grep -qiE '구조.*(분석|파악|확인)|설계|아키텍처|structure|architecture|analysis|plan' "$PROJECT_DIR/DEV-STATUS.md" 2>/dev/null; then
            DEV_STATUS_RECENT="yes"
        fi
    fi
fi

# ── 3. SERVICE-VISION.md 읽었는지 확인 ──
# 리더가 SERVICE-VISION.md를 최근 60분 내에 읽었는지 체크
# Read 도구로 읽으면 파일 atime이 갱신됨
SV_PATH="$HOME/.openclaw/workspace/SERVICE-VISION.md"
SV_READ=""
if [ -f "$SV_PATH" ]; then
    SV_ATIME=$(stat -f %a "$SV_PATH" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    SV_DIFF=$(( (NOW - SV_ATIME) / 60 ))
    if [ "$SV_DIFF" -lt 60 ]; then
        SV_READ="yes"
    fi
fi

if [ -z "$SV_READ" ]; then
    DELEGATE_TARGET=$(echo "$TASK_DESC" | head -c 100)
    MSG="🚫 [위임 차단] SERVICE-VISION.md 안 읽고 위임 시도: ${DELEGATE_TARGET}..."
    
    /opt/homebrew/bin/openclaw agent --message "[HOOK-BLOCK] 에이전트팀 리더가 SERVICE-VISION.md를 안 읽고 팀원 위임 시도함. 서비스 맥락 파악 없이 개발하면 안 된다. 리더한테 SERVICE-VISION.md + 기획서 먼저 읽으라고 지시해라." 2>/dev/null &
    
    echo "❌ SERVICE-VISION.md를 먼저 읽으세요." >&2
    echo "" >&2
    echo "서비스 맥락을 모르고 개발하면 스타일만 복사하게 됩니다." >&2
    echo "1. cat ~/.openclaw/workspace/SERVICE-VISION.md 읽기" >&2
    echo "2. 서비스가 뭘 하는 건지, 사용자 흐름이 뭔지 파악" >&2
    echo "3. 그 다음에 팀원에게 위임" >&2
    exit 2
fi

# ── 4. ADR 참조 확인 ──
# docs/adr/ 폴더에 ADR이 있으면, 리더가 읽었는지 확인
ADR_DIR="$PROJECT_DIR/docs/adr"
ADR_READ=""
if [ -d "$ADR_DIR" ]; then
    ADR_COUNT=$(find "$ADR_DIR" -name "ADR-*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [ "$ADR_COUNT" -gt 0 ]; then
        # 최근 60분 내에 ADR 파일 중 하나라도 atime 갱신됐는지
        ADR_RECENT=$(find "$ADR_DIR" -name "ADR-*.md" -type f -amin -60 2>/dev/null | head -1)
        if [ -n "$ADR_RECENT" ]; then
            ADR_READ="yes"
        fi
    fi
fi

if [ -n "$ADR_DIR" ] && [ -d "$ADR_DIR" ] && [ "$ADR_COUNT" -gt 0 ] && [ -z "$ADR_READ" ]; then
    DELEGATE_TARGET=$(echo "$TASK_DESC" | head -c 100)
    MSG="⚠️ [위임 경고] ADR(설계 결정) 안 읽고 위임 시도: ${DELEGATE_TARGET}..."
    echo "⚠️ ADR(Architecture Decision Records)을 먼저 읽으세요." >&2
    echo "  docs/adr/ 폴더에 ${ADR_COUNT}개 ADR이 있습니다." >&2
    echo "  설계 원칙(계정 종속 구조 등)을 모르고 개발하면 일관성이 깨집니다." >&2
    # 경고만 (차단 안 함 — exit 0으로 계속)
fi

if [ -z "$RECENT_PLAN" ] && [ -z "$RECENT_ANALYSIS" ] && [ -z "$RECENT_DESIGN" ] && [ -z "$DEV_STATUS_RECENT" ]; then
    # 차단 + 모찌 wake
    DELEGATE_TARGET=$(echo "$TASK_DESC" | head -c 100)
    MSG="🚫 [위임 차단] 구조분석/설계 없이 팀원 위임 시도: ${DELEGATE_TARGET}..."
    
    # 모찌 wake (모찌가 상황 판단 후 tmux에 가이드 보냄)
    /opt/homebrew/bin/openclaw agent --message "[HOOK-BLOCK] 에이전트팀 리더가 구조분석/설계 없이 팀원 위임 시도함. 위임 내용: ${DELEGATE_TARGET}. tmux send-keys로 리더한테 구조분석 먼저 하라고 지시해라." 2>/dev/null &
    
    echo "❌ 구조분석/설계 없이 위임할 수 없습니다." >&2
    echo "" >&2
    echo "팀원에게 위임하기 전에 다음 순서를 따르세요:" >&2
    echo "1. 현재 코드 구조를 파악하고 DEV-STATUS.md에 기록" >&2
    echo "2. TASK에 대한 구현 계획을 docs/01-plan/features/에 작성" >&2
    echo "3. 설계서를 docs/02-design/features/에 작성" >&2
    echo "4. 그 다음에 팀원에게 위임" >&2
    echo "" >&2
    echo "최소: DEV-STATUS.md에 구조 분석 결과를 기록하세요." >&2
    exit 2
fi

echo "✅ 구조분석/설계 확인됨 — 위임 진행 가능"
exit 0
