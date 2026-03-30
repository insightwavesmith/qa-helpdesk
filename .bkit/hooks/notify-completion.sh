#!/bin/bash
# notify-completion.sh — 작업 완료 시 Smith님에게 즉시 슬랙 알림
set -e

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# tmux 세션 이름 감지
SESSION_NAME=""
if [[ -n "$TMUX" ]]; then
    SESSION_NAME=$(tmux display-message -p '#S')
fi

# TaskCompleted 이벤트에서 호출되므로 에이전트팀에서만 실행
if [[ "$SESSION_NAME" =~ ^sdk- ]]; then
    # 현재 세션의 완료 상태 체크
    TASKS_OUTPUT=$(tmux capture-pane -t "$SESSION_NAME" -p | grep -E '\d+ tasks \(' | tail -1 || echo "")
    
    if [[ -n "$TASKS_OUTPUT" ]]; then
        # tasks 정보 파싱
        if echo "$TASKS_OUTPUT" | grep -q "(\([0-9]\+\) done, 0 in progress, 0 open)"; then
            TOTAL=$(echo "$TASKS_OUTPUT" | sed -E 's/.*([0-9]+) tasks \(([0-9]+) done.*/\2/')
            
            if [[ "$TOTAL" -gt 0 ]]; then
                # 전체 작업 완료!
                MESSAGE="🎉 ${SESSION_NAME} 전체 작업 완료! ($TOTAL/$TOTAL)"
                
                # 슬랙 DM 전송 (Smith님)
                if [[ -n "$SLACK_BOT_TOKEN" ]]; then
                    curl -X POST https://slack.com/api/chat.postMessage \
                        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
                        -H "Content-Type: application/json" \
                        -d "{
                            \"channel\": \"U06BP49UEJD\",
                            \"text\": \"$MESSAGE\",
                            \"blocks\": [{
                                \"type\": \"section\",
                                \"text\": {
                                    \"type\": \"mrkdwn\",
                                    \"text\": \"$MESSAGE\\n\\n\`tmux attach-session -t $SESSION_NAME\` 으로 확인하세요.\"
                                }
                            }]
                        }" > /dev/null 2>&1 &
                fi
                
                # 로그 기록
                echo "[$(date)] $MESSAGE" >> /tmp/agent-completions.log
                echo "$MESSAGE"
            fi
        fi
    fi
fi

exit 0