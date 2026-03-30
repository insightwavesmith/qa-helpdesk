#!/bin/bash
# chain-status-writer.sh — 체인 상태 JSON 생성/업데이트 헬퍼
# source하면 3개 함수 제공: create_chain_status, update_chain_status, advance_chain_stage
#
# 상태 파일: .bkit/runtime/chain-status-{slug}.json
#
# v1.0 (2026-03-31)

# --- create_chain_status: 체인 상태 JSON 초기 생성 ---
# $1: TASK (태스크명), $2: CHAIN_KEY (DEV-L2 등), $3: SLUG (파일명용), $4: PROJECT_DIR
create_chain_status() {
    local TASK="$1"
    local CHAIN_KEY="$2"
    local SLUG="$3"
    local PROJECT_DIR="${4:-/Users/smith/projects/bscamp}"
    local STATUS_FILE="$PROJECT_DIR/.bkit/runtime/chain-status-${SLUG}.json"
    local NOW
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%S+09:00")

    mkdir -p "$PROJECT_DIR/.bkit/runtime" 2>/dev/null

    local GATES=""
    local FIRST_GATE=""

    case "$CHAIN_KEY" in
        DEV-L0)
            FIRST_GATE="commit"
            GATES=$(cat <<'JSONEOF'
{
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        DEV-L1)
            FIRST_GATE="report"
            GATES=$(cat <<'JSONEOF'
{
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        DEV-L2)
            FIRST_GATE="plan"
            GATES=$(cat <<JSONEOF
{
    "plan": { "file": "docs/01-plan/features/${SLUG}.plan.md", "done": false },
    "design": { "file": "docs/02-design/features/${SLUG}.design.md", "done": false },
    "dev": { "matchRate": 0, "threshold": 95, "done": false },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        DEV-L3)
            FIRST_GATE="plan"
            GATES=$(cat <<JSONEOF
{
    "plan": { "file": "docs/01-plan/features/${SLUG}.plan.md", "done": false },
    "design": { "file": "docs/02-design/features/${SLUG}.design.md", "done": false },
    "dev": { "matchRate": 0, "threshold": 95, "done": false },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "manual_review": { "reviewer": "Smith", "verdict": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        OPS-L0)
            FIRST_GATE="deploy"
            GATES=$(cat <<'JSONEOF'
{
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        OPS-L1)
            FIRST_GATE="commit"
            GATES=$(cat <<'JSONEOF'
{
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        OPS-L2)
            FIRST_GATE="plan"
            GATES=$(cat <<JSONEOF
{
    "plan": { "file": "docs/01-plan/features/${SLUG}.plan.md", "done": false },
    "design": { "file": "docs/02-design/features/${SLUG}.design.md", "done": false },
    "dev": { "matchRate": 0, "threshold": 95, "done": false },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        MKT-L1)
            FIRST_GATE="review"
            GATES=$(cat <<'JSONEOF'
{
    "review": { "reviewer": "MOZZI", "verdict": null, "done": false },
    "publish": { "url": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        MKT-L2)
            FIRST_GATE="plan"
            GATES=$(cat <<JSONEOF
{
    "plan": { "file": "docs/01-plan/features/${SLUG}.plan.md", "done": false },
    "review": { "reviewer": "MOZZI", "verdict": null, "done": false },
    "publish": { "url": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        BIZ-L1)
            FIRST_GATE="manual_review"
            GATES=$(cat <<'JSONEOF'
{
    "manual_review": { "reviewer": "Smith", "verdict": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        BIZ-L2)
            FIRST_GATE="plan"
            GATES=$(cat <<JSONEOF
{
    "plan": { "file": "docs/01-plan/features/${SLUG}.plan.md", "done": false },
    "manual_review": { "reviewer": "Smith", "verdict": null, "done": false },
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
        *)
            FIRST_GATE="report"
            GATES=$(cat <<'JSONEOF'
{
    "report": { "webhook_status": null, "done": false }
}
JSONEOF
)
            ;;
    esac

    # JSON 조립
    local TMP_FILE="${STATUS_FILE}.tmp"
    jq -n \
        --arg task "$TASK" \
        --arg type "$CHAIN_KEY" \
        --argjson gates "$GATES" \
        --arg current "$FIRST_GATE" \
        --arg updated_at "$NOW" \
        '{
            task: $task,
            type: $type,
            gates: $gates,
            current: $current,
            updated_at: $updated_at
        }' > "$TMP_FILE" 2>/dev/null

    if [ $? -ne 0 ]; then
        rm -f "$TMP_FILE"
        return 1
    fi

    mv "$TMP_FILE" "$STATUS_FILE"
    return 0
}

# --- update_chain_status: 특정 게이트 필드 업데이트 ---
# $1: STATUS_FILE, $2: GATE, $3: FIELD, $4: VALUE
update_chain_status() {
    local STATUS_FILE="$1"
    local GATE="$2"
    local FIELD="$3"
    local VALUE="$4"

    if [ ! -f "$STATUS_FILE" ]; then
        return 1
    fi

    local TMP_FILE="${STATUS_FILE}.tmp"

    # VALUE가 true/false/null/숫자면 raw, 아니면 문자열
    if echo "$VALUE" | grep -qE '^(true|false|null|[0-9]+)$'; then
        jq --arg gate "$GATE" --arg field "$FIELD" --argjson val "$VALUE" \
            '.gates[$gate][$field] = $val | .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%S+09:00"))' \
            "$STATUS_FILE" > "$TMP_FILE" 2>/dev/null
    else
        jq --arg gate "$GATE" --arg field "$FIELD" --arg val "$VALUE" \
            '.gates[$gate][$field] = $val | .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%S+09:00"))' \
            "$STATUS_FILE" > "$TMP_FILE" 2>/dev/null
    fi

    if [ $? -ne 0 ]; then
        rm -f "$TMP_FILE"
        return 1
    fi

    mv "$TMP_FILE" "$STATUS_FILE"
    return 0
}

# --- advance_chain_stage: 현재 단계를 다음 게이트로 진행 ---
# $1: STATUS_FILE, $2: NEXT_GATE
advance_chain_stage() {
    local STATUS_FILE="$1"
    local NEXT_GATE="$2"

    if [ ! -f "$STATUS_FILE" ]; then
        return 1
    fi

    local TMP_FILE="${STATUS_FILE}.tmp"

    jq --arg next "$NEXT_GATE" \
        '.current = $next | .updated_at = (now | strftime("%Y-%m-%dT%H:%M:%S+09:00"))' \
        "$STATUS_FILE" > "$TMP_FILE" 2>/dev/null

    if [ $? -ne 0 ]; then
        rm -f "$TMP_FILE"
        return 1
    fi

    mv "$TMP_FILE" "$STATUS_FILE"
    return 0
}
