#!/bin/bash
# teammate-idle.sh — 팀원이 할 일 끝나면 다음 작업 자동 배정
# TeammateIdle hook: 팀원이 idle 상태가 되면 실행
# exit 0 = idle 허용, exit 2 = 피드백 보내고 계속 작업시킴

INPUT=$(cat)

# 현재 TASK 파일에서 미완료 항목 확인
PROJECT_DIR="/Users/smith/projects/qa-helpdesk"
TASK_FILES=$(find "$PROJECT_DIR" -maxdepth 1 -name "TASK*.md" -type f 2>/dev/null)

if [ -z "$TASK_FILES" ]; then
  exit 0  # TASK 없으면 idle 허용
fi

# 가장 최근 TASK 파일
ACTIVE_TASK=""
for f in $TASK_FILES; do
  if [ -z "$ACTIVE_TASK" ] || [ "$f" -nt "$ACTIVE_TASK" ]; then
    ACTIVE_TASK="$f"
  fi
done

# 미완료 T 항목 수
TOTAL=$(grep -cE '^## (T[0-9]+\.|A[0-9]+\.|B[0-9]+\.)' "$ACTIVE_TASK" 2>/dev/null || echo "0")

if [ "$TOTAL" -gt 0 ]; then
  echo "아직 TASK에 미완료 항목이 있습니다. 다음 항목을 확인하고 작업을 계속하세요: $(basename "$ACTIVE_TASK")"
  exit 2  # 계속 작업시킴
fi

exit 0  # 전부 완료면 idle 허용
