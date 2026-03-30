#!/bin/bash
# auto-shutdown.sh — 3단계 Graceful Shutdown
# 리더가 직접 실행: bash .bkit/hooks/auto-shutdown.sh [team-name]
set -euo pipefail

# 팀원은 실행 불가
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
REGISTRY="$PROJECT_DIR/.bkit/runtime/teammate-registry.json"

# --- 헬퍼 함수 ---

build_registry_from_config() {
    local config=$(ls -t ~/.claude/teams/*/config.json 2>/dev/null | head -1)
    [ -z "$config" ] && return 1

    local team=$(jq -r '.name' "$config")
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")

    mkdir -p "$(dirname "$REGISTRY")"

    jq -n --arg t "$team" --arg now "$now" \
       --argjson members "$(jq --arg now "$now" '[.members[] | select(.name != "team-lead") | {
           key: .name,
           value: {
               state: (if .isActive then "active" else "terminated" end),
               paneId: (.tmuxPaneId // ""),
               spawnedAt: (.joinedAt // $now),
               lastActiveAt: null,
               terminatedAt: null,
               terminatedBy: null,
               tasksCompleted: 0,
               model: (.model // "opus")
           }
       }] | from_entries' "$config")" \
       '{team: $t, createdAt: $now, updatedAt: $now, shutdownState: "running", members: $members}' \
       > "$REGISTRY"
}

set_member_state() {
    local member="$1" state="$2"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$member" --arg s "$state" --arg t "$now" \
       '.members[$m].state = $s | .updatedAt = $t' "$REGISTRY" > "${REGISTRY}.tmp" \
       && mv "${REGISTRY}.tmp" "$REGISTRY"
}

set_member_terminated_by() {
    local member="$1" by="$2"
    local now=$(date -u +"%Y-%m-%dT%H:%M:%S")
    jq --arg m "$member" --arg b "$by" --arg t "$now" \
       '.members[$m].terminatedBy = $b | .members[$m].terminatedAt = $t | .updatedAt = $t' \
       "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
}

cleanup_and_exit() {
    jq '.shutdownState = "done"' "$REGISTRY" > "${REGISTRY}.tmp" \
        && mv "${REGISTRY}.tmp" "$REGISTRY"
    echo "[auto-shutdown] 완료. TeamDelete 실행 가능."
    osascript -e 'display notification "전원 종료 완료. TeamDelete 가능." with title "auto-shutdown"' 2>/dev/null || true
    exit 0
}

# --- Stage 0: 레지스트리 준비 ---
if [ ! -f "$REGISTRY" ]; then
    build_registry_from_config || { echo "[auto-shutdown] 레지스트리 생성 실패"; exit 1; }
fi

jq '.shutdownState = "shutdown_initiated"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

ACTIVE_MEMBERS=$(jq -r '.members | to_entries[] | select(.value.state != "terminated") | .key' "$REGISTRY")
[ -z "$ACTIVE_MEMBERS" ] && cleanup_and_exit

# --- Stage 1: Graceful Request (10초) ---
echo "[auto-shutdown] Stage 1: 종료 요청..."
for member in $ACTIVE_MEMBERS; do
    set_member_state "$member" "shutdown_pending"
    echo "  → $member: shutdown_pending"
done

echo "[auto-shutdown] 10초 대기..."
sleep 10

# --- Stage 2: Force Kill (tmux kill-pane) ---
jq '.shutdownState = "force_killing"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

STILL_ACTIVE=$(jq -r '.members | to_entries[] | select(.value.state == "shutdown_pending") | .key' "$REGISTRY")
for member in $STILL_ACTIVE; do
    PANE_ID=$(jq -r --arg m "$member" '.members[$m].paneId' "$REGISTRY")

    # 리더 보호 (pane_index 0)
    if [ -n "$PANE_ID" ] && [ "$PANE_ID" != "null" ]; then
        PANE_INDEX=$(tmux display-message -t "$PANE_ID" -p '#{pane_index}' 2>/dev/null || echo "")
        if [ "$PANE_INDEX" = "0" ]; then
            echo "  [BLOCK] $member: 리더 pane — skip"
            continue
        fi

        if tmux kill-pane -t "$PANE_ID" 2>/dev/null; then
            set_member_state "$member" "terminated"
            set_member_terminated_by "$member" "force_kill"
            echo "  [KILL] $member: force-killed (pane $PANE_ID)"
        else
            set_member_state "$member" "terminated"
            set_member_terminated_by "$member" "pane_dead"
            echo "  [DEAD] $member: pane already dead"
        fi
    else
        set_member_state "$member" "terminated"
        set_member_terminated_by "$member" "pane_dead"
        echo "  [DEAD] $member: no pane ID"
    fi
done

# --- Stage 3: Cleanup ---
jq '.shutdownState = "cleanup"' "$REGISTRY" > "${REGISTRY}.tmp" \
    && mv "${REGISTRY}.tmp" "$REGISTRY"

# PDCA 갱신
PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
if [ -f "$PDCA_FILE" ]; then
    jq --arg t "$NOW" '."_lastUpdated" = $t | .updatedAt = $t' "$PDCA_FILE" > "${PDCA_FILE}.tmp" \
        && mv "${PDCA_FILE}.tmp" "$PDCA_FILE"
fi

# config.json isActive=false
CONFIG=$(ls -t ~/.claude/teams/*/config.json 2>/dev/null | head -1)
if [ -n "$CONFIG" ] && [ -f "$CONFIG" ]; then
    jq '(.members[] | select(.name != "team-lead") | .isActive) = false' \
        "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
fi

cleanup_and_exit
