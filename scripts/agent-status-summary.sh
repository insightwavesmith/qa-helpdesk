#!/bin/bash
# agent-status-summary.sh — 현재 에이전트팀 상태 요약
set -e

echo "📊 에이전트팀 현재 상태 ($(date '+%H:%M'))"
echo "================================="

for session in sdk-cto sdk-pm sdk-mkt; do
    if tmux has-session -t $session 2>/dev/null; then
        echo "[$session]"
        
        # 마지막 출력에서 tasks 정보 추출
        TASKS=$(tmux capture-pane -t $session -p | grep -E '\d+ tasks \(' | tail -1)
        
        if [[ -n "$TASKS" ]]; then
            echo "  $TASKS"
        else
            echo "  상태 정보 없음"
        fi
        
        # 마지막 활동 시간
        LAST_ACTIVITY=$(tmux list-sessions -f '#{session_name}: #{session_last_attached}' | grep "^$session:" | cut -d: -f2-)
        echo "  마지막 활동: $LAST_ACTIVITY"
        echo
    else
        echo "[$session] - 세션 없음"
        echo
    fi
done

echo "실시간 모니터링: PID $(pgrep -f agent-monitor.sh 2>/dev/null || echo '없음')"
echo "로그: tail -f /tmp/agent-monitor.log"