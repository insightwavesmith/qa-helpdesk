#!/bin/bash
# 에이전트팀 기능 사용 강제 검증
# TaskCompleted hook에서 실행됨 — FAIL 시 태스크 완료 차단

ERRORS=0

echo "=== 기능 사용 검증 ==="

# 1. Context7 MCP 설정 확인
if [ -f /Users/smith/projects/qa-helpdesk/.mcp.json ]; then
  echo "✅ Context7 MCP 설정 있음"
else
  echo "❌ FAIL: Context7 MCP 설정 없음 (.mcp.json)"
  ERRORS=$((ERRORS + 1))
fi

# 2. bkit 플러그인 활성화 확인
BKIT=$(grep -c '"bkit@bkit-marketplace": true' /Users/smith/.claude/settings.json 2>/dev/null)
if [ "$BKIT" -ge 1 ]; then
  echo "✅ bkit 플러그인 활성화됨"
else
  echo "❌ FAIL: bkit 플러그인 비활성화"
  ERRORS=$((ERRORS + 1))
fi

# 3. Hooks 설정 확인
HOOKS=$(grep -c '"hooks"' /Users/smith/projects/qa-helpdesk/.claude/settings.json 2>/dev/null)
if [ "$HOOKS" -ge 1 ]; then
  echo "✅ Hooks 설정됨"
else
  echo "❌ FAIL: Hooks 미설정"
  ERRORS=$((ERRORS + 1))
fi

# 4. Skills 존재 확인
SKILLS=$(ls /Users/smith/projects/qa-helpdesk/.claude/skills/ 2>/dev/null | wc -l | tr -d ' ')
if [ "$SKILLS" -ge 1 ]; then
  echo "✅ Skills ${SKILLS}개 로드됨"
else
  echo "❌ FAIL: Skills 없음"
  ERRORS=$((ERRORS + 1))
fi

# 5. Agent Teams 환경변수 확인
TEAMS=$(grep -c "AGENT_TEAMS" /Users/smith/projects/qa-helpdesk/.claude/settings.json 2>/dev/null)
if [ "$TEAMS" -ge 1 ]; then
  echo "✅ Agent Teams 활성화됨"
else
  echo "❌ FAIL: Agent Teams 비활성화"
  ERRORS=$((ERRORS + 1))
fi

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "❌ 기능 검증 FAIL ($ERRORS건). 필수 기능 활성화 후 다시 시도하세요."
  echo '{"block": true, "message": "필수 기능(Context7/bkit/Hooks/Skills/AgentTeams) 미활성화. 수정 후 다시 완료하세요."}' >&2
  exit 2
fi

echo "✅ 기능 검증 PASS"
echo ""
echo "📋 완료 보고서에 다음 항목 포함 필수:"
echo "  - Agent Teams: delegate 횟수, 역할 분배"
echo "  - Context7: 참조한 라이브러리/문서"
echo "  - bkit PDCA: 사용 단계"
echo "  - Hooks: 트리거된 횟수"
echo "  - Skills: 참조한 스킬 목록"
exit 0
