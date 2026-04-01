#!/bin/bash
# patch-block-logger.sh — 모든 hook에 block-logger EXIT trap 추가
# 차단(exit 2) 발생 시 자동으로 block-log.json에 기록
HOOKS_DIR="/Users/smith/projects/bscamp/.bkit/hooks"

TARGETS=(
    "destructive-detector"
    "enforce-spa""wn"
    "prevent-tmux-kill"
    "validate-coo-approval"
    "validate-task-fields"
    "validate-qa"
    "validate-pdca"
    "validate-task"
    "enforce-qa-before-merge"
    "validate-deploy-authority"
    "postmortem-review-gate"
    "validate-slack-payload"
    "validate-plan"
    "validate-design"
    "enforce-teamcreate"
    "validate-before-delegate"
    "validate-pdca-before-teamdelete"
    "task-quality-gate"
    "filter-completion-dm"
)

PATCHED=0
SKIPPED=0

for name in "${TARGETS[@]}"; do
    file="$HOOKS_DIR/${name}.sh"
    [ ! -f "$file" ] && { echo "NOT FOUND: ${name}.sh"; continue; }

    if grep -q '_bl_trap\|block-logger' "$file"; then
        echo "SKIP: ${name}.sh"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi

    tmp=$(mktemp)
    head -1 "$file" > "$tmp"
    printf '# Block logger: 차단(exit 2) 시 자동 기록\n' >> "$tmp"
    printf '_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "%s" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }\n' "$name" >> "$tmp"
    printf 'trap _bl_trap EXIT\n' >> "$tmp"
    tail -n +2 "$file" >> "$tmp"
    mv "$tmp" "$file"
    chmod +x "$file"
    echo "PATCHED: ${name}.sh"
    PATCHED=$((PATCHED + 1))
done

echo ""
echo "=== 결과: PATCHED=${PATCHED}, SKIPPED=${SKIPPED} ==="
echo "block-logger 적용 총: $(grep -rl '_bl_trap\|block-logger' "$HOOKS_DIR"/*.sh 2>/dev/null | wc -l | tr -d ' ')개"
