#!/bin/bash
# agent-sdk-run.sh — SDK 래퍼 (settings 임시 교체)
# 사용: agent-sdk-run.sh "지시문" [--slack]

PROJECT="/Users/smith/projects/qa-helpdesk"
SETTINGS="$PROJECT/.claude/settings.json"
SETTINGS_BAK="$PROJECT/.claude/settings.json.sdk-bak"
SDK_SETTINGS="$PROJECT/.claude/settings.sdk.json"

# SDK용 settings (hooks 제거, Agent Teams 활성)
if [ ! -f "$SDK_SETTINGS" ]; then
  cat > "$SDK_SETTINGS" << 'SDKJSON'
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
SDKJSON
fi

# settings 교체
cp "$SETTINGS" "$SETTINGS_BAK"
cp "$SDK_SETTINGS" "$SETTINGS"

# SDK 실행
cd "$PROJECT" && node .claude/scripts/agent-sdk-run.js "$@"
EXIT=$?

# settings 복구
cp "$SETTINGS_BAK" "$SETTINGS"
rm -f "$SETTINGS_BAK"

exit $EXIT
