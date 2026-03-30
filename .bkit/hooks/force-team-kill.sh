#!/bin/bash
# force-team-kill.sh — 팀원 강제 종료 스크립트
# CC v2.1.79 기준 공식 force-kill 없음 → config.json 수정 + tmux pane kill로 우회
#
# 사용법:
#   bash .bkit/hooks/force-team-kill.sh [team-name]
#   team-name 생략 시 가장 최근 팀 자동 감지
#
# 동작:
#   1. 팀 config.json에서 팀원 목록 읽기
#   2. 각 팀원의 tmux pane 강제 종료
#   3. config.json에서 isActive=false로 변경
#   4. TeamDelete 가능 상태로 만들기
#
# v1.0 (2026-03-26)

set -euo pipefail

PROJECT_DIR="/Users/smith/projects/bscamp"
TEAMS_DIR="$HOME/.claude/teams"

# 팀 이름 결정
TEAM_NAME="${1:-}"
if [ -z "$TEAM_NAME" ]; then
    # 가장 최근 팀 자동 감지
    TEAM_NAME=$(ls -t "$TEAMS_DIR" 2>/dev/null | head -1)
    if [ -z "$TEAM_NAME" ]; then
        echo "[force-team-kill] 활성 팀 없음. 종료."
        exit 0
    fi
fi

CONFIG="$TEAMS_DIR/$TEAM_NAME/config.json"

if [ ! -f "$CONFIG" ]; then
    echo "[force-team-kill] 팀 '$TEAM_NAME' config 없음: $CONFIG"
    exit 1
fi

echo "========================================="
echo "[force-team-kill] 팀: $TEAM_NAME"
echo "========================================="

# 팀원 목록 추출 (리더 제외)
MEMBERS=$(jq -r '.members[] | select(.name != "team-lead") | .name' "$CONFIG")

# 리더 pane ID 추출 (pane 보호용)
LEADER_PANE=$(jq -r '.members[] | select(.name == "team-lead") | .tmuxPaneId // ""' "$CONFIG")

if [ -z "$MEMBERS" ]; then
    echo "[force-team-kill] 팀원 없음. 종료."
    exit 0
fi

KILLED=0
TOTAL=0

while IFS= read -r MEMBER_NAME; do
    [ -z "$MEMBER_NAME" ] && continue
    TOTAL=$((TOTAL + 1))

    PANE_ID=$(jq -r --arg name "$MEMBER_NAME" '.members[] | select(.name == $name) | .tmuxPaneId' "$CONFIG")
    IS_ACTIVE=$(jq -r --arg name "$MEMBER_NAME" '.members[] | select(.name == $name) | .isActive' "$CONFIG")

    echo ""
    echo "--- $MEMBER_NAME (pane: $PANE_ID, active: $IS_ACTIVE) ---"

    # Step 0.5: 리더 pane 보호
    # (1) paneId=%0 → tmux 첫 pane = 리더 pane. tmux 없어도 방어
    if [ "$PANE_ID" = "%0" ]; then
        echo "  [BLOCK] $MEMBER_NAME: paneId=%0 (리더 pane) — kill 금지"
        continue
    fi
    # (2) 리더 pane ID 직접 비교
    if [ -n "$PANE_ID" ] && [ "$PANE_ID" != "null" ] && [ -n "$LEADER_PANE" ] && [ "$LEADER_PANE" != "null" ] && [ "$PANE_ID" = "$LEADER_PANE" ]; then
        echo "  [BLOCK] $MEMBER_NAME: 리더 pane ($LEADER_PANE) — kill 금지"
        continue
    fi

    # Step 1: tmux pane 종료
    if [ -n "$PANE_ID" ] && [ "$PANE_ID" != "null" ] && [ "$PANE_ID" != "" ]; then
        if tmux kill-pane -t "$PANE_ID" 2>/dev/null; then
            echo "  [OK] tmux pane $PANE_ID 종료"
        else
            echo "  [SKIP] tmux pane $PANE_ID 이미 종료됨"
        fi
    else
        echo "  [SKIP] tmux pane ID 없음"
    fi

    # Step 2: isActive=false로 변경
    if [ "$IS_ACTIVE" = "true" ]; then
        jq --arg name "$MEMBER_NAME" \
           '(.members[] | select(.name == $name) | .isActive) = false' \
           "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"
        echo "  [OK] isActive → false"
        KILLED=$((KILLED + 1))
    else
        echo "  [SKIP] 이미 isActive=false"
    fi

    # Step 2.5: 레지스트리 갱신
    REGISTRY="$PROJECT_DIR/.bkit/runtime/teammate-registry.json"
    if [ -f "$REGISTRY" ]; then
        NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")
        jq --arg m "$MEMBER_NAME" --arg t "$NOW" \
           '.members[$m].state = "terminated" |
            .members[$m].terminatedBy = "force_kill" |
            .members[$m].terminatedAt = $t |
            .updatedAt = $t' \
           "$REGISTRY" > "${REGISTRY}.tmp" && mv "${REGISTRY}.tmp" "$REGISTRY"
        echo "  [OK] 레지스트리 갱신: $MEMBER_NAME → terminated"
    fi

done <<< "$MEMBERS"

echo ""
echo "========================================="
echo "[force-team-kill] 완료: $KILLED/$TOTAL 팀원 강제 종료"
echo "[force-team-kill] 이제 TeamDelete 실행 가능"
echo "========================================="

# macOS 알림
osascript -e "display notification \"${KILLED}명 팀원 강제 종료 완료. TeamDelete 실행하세요.\" with title \"force-team-kill\" sound name \"Ping\"" 2>/dev/null || true

exit 0
