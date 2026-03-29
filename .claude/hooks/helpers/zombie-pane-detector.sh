#!/bin/bash
# zombie-pane-detector.sh — 좀비 tmux pane 자동 감지 + 정리
# source해서 사용: detect_zombie_panes, kill_zombie_panes
#
# 좀비 정의: pane_index > 0 (팀원) 이면서:
#   - 프로세스가 죽었거나 (idle shell만 남음)
#   - teammate-registry에 active인데 실제 claude 프로세스 없음
#   - config.json에 isActive=false인데 pane은 살아있음
#
# 사용: SessionStart hook 또는 리더가 수동 실행

_ZPD_PROJECT_DIR="${PROJECT_DIR:-/Users/smith/projects/bscamp}"

# 좀비 pane 감지
# 결과: ZOMBIE_PANES 배열 (session:pane_id 형태)
#        ZOMBIE_COUNT 숫자
#        ZOMBIE_DETAILS 텍스트 (표시용)
detect_zombie_panes() {
    ZOMBIE_PANES=()
    ZOMBIE_COUNT=0
    ZOMBIE_DETAILS=""

    # tmux 없으면 skip
    command -v tmux >/dev/null 2>&1 || return 0
    tmux info >/dev/null 2>&1 || return 0

    # 현재 세션명 확인
    local MY_SESSION=""
    if [ -n "${TMUX:-}" ]; then
        MY_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null)
    fi

    # SDK 세션 패턴 (sdk-cto, sdk-pm 등)
    local SDK_SESSIONS
    SDK_SESSIONS=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -E "^sdk-" || true)
    [ -z "$SDK_SESSIONS" ] && return 0

    for SESSION in $SDK_SESSIONS; do
        # 현재 세션의 pane만 검사 (다른 세션의 팀원은 그 세션 리더 책임)
        # 단, 호출자가 tmux 외부면 모든 세션 검사
        if [ -n "$MY_SESSION" ] && [ "$SESSION" != "$MY_SESSION" ]; then
            continue
        fi

        local PANES
        PANES=$(tmux list-panes -t "$SESSION" -F '#{pane_index} #{pane_id} #{pane_pid} #{pane_current_command}' 2>/dev/null || true)
        [ -z "$PANES" ] && continue

        echo "$PANES" | while IFS=' ' read -r PANE_IDX PANE_ID PANE_PID PANE_CMD; do
            # pane_index 0 = 리더 → skip
            [ "$PANE_IDX" = "0" ] && continue

            local IS_ZOMBIE=false
            local REASON=""

            # 판단 1: 프로세스가 shell만 남은 경우 (claude/node/bun 없음)
            local HAS_CLAUDE=false
            for CHILD in $(pgrep -P "$PANE_PID" 2>/dev/null); do
                local CHILD_CMD
                CHILD_CMD=$(ps -p "$CHILD" -o comm= 2>/dev/null || true)
                case "$CHILD_CMD" in
                    *claude*|*node*|*bun*) HAS_CLAUDE=true ;;
                esac
            done

            if [ "$HAS_CLAUDE" = "false" ]; then
                # shell만 남은 경우 — pane_current_command가 bash/zsh면 좀비
                case "$PANE_CMD" in
                    bash|zsh|sh|-bash|-zsh)
                        IS_ZOMBIE=true
                        REASON="shell_only"
                        ;;
                esac
            fi

            # 판단 2: config.json에서 isActive=false인데 pane 살아있는 경우
            if [ "$IS_ZOMBIE" = "false" ]; then
                local CONFIG
                CONFIG=$(ls -t ~/.claude/teams/*/config.json 2>/dev/null | head -1)
                if [ -n "$CONFIG" ] && [ -f "$CONFIG" ]; then
                    # pane_id로 매칭 시도
                    local INACTIVE
                    INACTIVE=$(jq -r --arg pid "$PANE_ID" \
                        '.members[]? | select(.tmuxPaneId == $pid and .isActive == false) | .name' \
                        "$CONFIG" 2>/dev/null)
                    if [ -n "$INACTIVE" ]; then
                        IS_ZOMBIE=true
                        REASON="config_inactive($INACTIVE)"
                    fi
                fi
            fi

            # 판단 3: registry에 terminated인데 pane 남아있음
            if [ "$IS_ZOMBIE" = "false" ]; then
                local REGISTRY="$_ZPD_PROJECT_DIR/.claude/runtime/teammate-registry.json"
                if [ -f "$REGISTRY" ]; then
                    local TERM_MEMBER
                    TERM_MEMBER=$(jq -r --arg pid "$PANE_ID" \
                        '.members // {} | to_entries[] | select(.value.paneId == $pid and .value.state == "terminated") | .key' \
                        "$REGISTRY" 2>/dev/null)
                    if [ -n "$TERM_MEMBER" ]; then
                        IS_ZOMBIE=true
                        REASON="registry_terminated($TERM_MEMBER)"
                    fi
                fi
            fi

            if [ "$IS_ZOMBIE" = "true" ]; then
                echo "${SESSION}:${PANE_ID}:${PANE_IDX}:${REASON}"
            fi
        done
    done | {
        while IFS='' read -r line; do
            ZOMBIE_PANES+=("$line")
            ZOMBIE_COUNT=$((ZOMBIE_COUNT + 1))
            local Z_SESSION Z_PANE Z_IDX Z_REASON
            Z_SESSION=$(echo "$line" | cut -d: -f1)
            Z_PANE=$(echo "$line" | cut -d: -f2)
            Z_IDX=$(echo "$line" | cut -d: -f3)
            Z_REASON=$(echo "$line" | cut -d: -f4)
            ZOMBIE_DETAILS="${ZOMBIE_DETAILS}  - ${Z_SESSION} pane#${Z_IDX} (${Z_PANE}): ${Z_REASON}\n"
        done

        # subshell 안이므로 파일로 결과 전달
        local RESULT_FILE="${_ZPD_PROJECT_DIR}/.claude/runtime/.zombie-detect-result"
        mkdir -p "$(dirname "$RESULT_FILE")"
        echo "$ZOMBIE_COUNT" > "$RESULT_FILE"
        echo -e "$ZOMBIE_DETAILS" >> "$RESULT_FILE"
        for z in "${ZOMBIE_PANES[@]}"; do
            echo "PANE:$z" >> "$RESULT_FILE"
        done
    }

    # subshell 결과 읽기
    local RESULT_FILE="${_ZPD_PROJECT_DIR}/.claude/runtime/.zombie-detect-result"
    if [ -f "$RESULT_FILE" ]; then
        ZOMBIE_COUNT=$(head -1 "$RESULT_FILE")
        ZOMBIE_DETAILS=$(sed -n '2p' "$RESULT_FILE")
        ZOMBIE_PANES=()
        while IFS='' read -r line; do
            local pane_val="${line#PANE:}"
            ZOMBIE_PANES+=("$pane_val")
        done < <(grep "^PANE:" "$RESULT_FILE" 2>/dev/null)
        rm -f "$RESULT_FILE"
    fi
}

# 좀비 pane 정리 (kill)
# $1: "report" = 보고만, "kill" = 실제 kill
# 리더 pane (index 0) 절대 kill 안 함
kill_zombie_panes() {
    local MODE="${1:-report}"
    local KILLED=0

    if [ "${ZOMBIE_COUNT:-0}" -eq 0 ]; then
        echo "좀비 pane 없음."
        return 0
    fi

    echo "좀비 pane ${ZOMBIE_COUNT}건 감지:"
    echo -e "$ZOMBIE_DETAILS"

    if [ "$MODE" = "kill" ]; then
        for ENTRY in "${ZOMBIE_PANES[@]}"; do
            local PANE_ID
            PANE_ID=$(echo "$ENTRY" | cut -d: -f2)
            local PANE_IDX
            PANE_IDX=$(echo "$ENTRY" | cut -d: -f3)

            # 리더 보호 (이중 체크)
            if [ "$PANE_IDX" = "0" ]; then
                echo "  [SKIP] pane#0 리더 보호"
                continue
            fi

            if tmux kill-pane -t "$PANE_ID" 2>/dev/null; then
                echo "  [KILL] $PANE_ID 정리 완료"
                KILLED=$((KILLED + 1))
            else
                echo "  [DEAD] $PANE_ID 이미 종료"
                KILLED=$((KILLED + 1))
            fi
        done
        echo "총 ${KILLED}건 정리 완료."
    fi
}

# 직접 실행 시
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    MODE="${1:-${ZPD_MODE:-report}}"
    detect_zombie_panes
    kill_zombie_panes "$MODE"
fi
