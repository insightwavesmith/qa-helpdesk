---
name: create-hook
description: Claude Code 훅 생성 가이드. settings.json 등록 + 셸 스크립트 작성을 안내한다. /create-hook 으로 호출.
---

<objective>
bscamp 프로젝트의 Claude Code 훅을 생성한다.
기존 훅 패턴(.bkit/hooks/*.sh)을 따라 일관된 구조로 작성.
</objective>

<hook_types>
| 이벤트 | 실행 시점 | exit 0 | exit 2 |
|--------|----------|--------|--------|
| PreToolUse | 도구 호출 전 | 허용 | 차단 + 피드백 |
| PostToolUse | 도구 호출 후 | 통과 | 피드백 + 재시도 |
| Stop | 에이전트 멈출 때 | 허용 | 피드백 + 계속 |
| TaskCompleted | 태스크 완료 시 | 통과 | 피드백 + 계속 |
| TeammateIdle | 팀원 idle 시 | idle 허용 | 피드백 + 작업 배정 |
</hook_types>

<template>
```bash
#!/bin/bash
# {hook_name}.sh — {한 줄 설명}
# {이벤트} hook: {동작 설명}
# exit 0 = {허용 동작}, exit 2 = {차단 동작}

PROJECT_DIR="/Users/smith/projects/bscamp"

# stdin에서 입력 받기 (PreToolUse/PostToolUse만)
# INPUT=$(cat)
# TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# 로직
# ...

exit 0
```
</template>

<settings_registration>
```json
// .claude/settings.json → hooks.{이벤트} 배열에 추가
{
  "type": "command",
  "command": "bash /Users/smith/projects/bscamp/.bkit/hooks/{hook_name}.sh",
  "timeout": 10000
}
```
matcher 옵션: "Bash", "Edit|Write", "Task", "Read" 등 도구명 정규식
</settings_registration>

<process>
1. 사용자에게 질문: 어떤 이벤트? 어떤 조건에서 차단/허용?
2. .bkit/hooks/ 기존 훅 패턴 확인
3. 셸 스크립트 작성 (.bkit/hooks/{name}.sh)
4. chmod +x 실행
5. settings.json에 훅 등록
6. 테스트 방법 안내
</process>

<bscamp_conventions>
- PROJECT_DIR은 항상 "/Users/smith/projects/bscamp"
- 알림은 openclaw message send 사용 (Smith님 슬랙 DM)
- macOS 알림은 osascript 사용
- 마커 파일은 /tmp/agent-*.json 패턴
- 품질 검증: tsc + build + gap analysis 3종 세트
</bscamp_conventions>

<success_criteria>
- 훅 셸 스크립트 생성 + 실행 권한 부여
- settings.json에 올바른 이벤트/matcher로 등록
- 기존 훅과 충돌 없음 확인
</success_criteria>
