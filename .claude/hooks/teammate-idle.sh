#!/bin/bash
# teammate-idle.sh — 팀원 idle 시 다음 TASK 자동 배정
# TeammateIdle hook: exit 0 = idle 허용, exit 2 = 피드백 보내고 계속 작업
#
# 강화 v2 (2026-03-22):
#   - bscamp 프로젝트 경로 고정
#   - TASK.md에서 미완료 T항목 파싱 → 구체적 지시
#   - .pdca-status.json 참조하여 현재 phase 확인

PROJECT_DIR="/Users/smith/projects/bscamp"
TASK_FILE="$PROJECT_DIR/TASK.md"
PDCA_FILE="$PROJECT_DIR/.pdca-status.json"

# TASK.md 없으면 idle 허용
if [ ! -f "$TASK_FILE" ]; then
  exit 0
fi

# 미완료 체크박스 항목 찾기 (- [ ] 패턴)
UNCHECKED=$(grep -n '^\- \[ \]' "$TASK_FILE" 2>/dev/null)
UNCHECKED_COUNT=$(echo "$UNCHECKED" | grep -c '\S' 2>/dev/null || echo "0")

if [ "$UNCHECKED_COUNT" -eq 0 ]; then
  # 체크박스가 없으면 T/A/B 섹션 헤더로 미완료 판단
  PENDING_SECTIONS=$(grep -E '^###\s+T[0-9]+' "$TASK_FILE" 2>/dev/null | head -5)
  if [ -z "$PENDING_SECTIONS" ]; then
    exit 0  # 전부 완료 — idle 허용
  fi
fi

# 첫 번째 미완료 항목 추출
NEXT_TASK=$(echo "$UNCHECKED" | head -1 | sed 's/^[0-9]*://' | sed 's/^- \[ \] //')

if [ -n "$NEXT_TASK" ]; then
  # PDCA 상태 확인
  PDCA_STATUS=""
  if [ -f "$PDCA_FILE" ]; then
    PDCA_STATUS=$(cat "$PDCA_FILE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  fi

  echo "아직 미완료 항목이 ${UNCHECKED_COUNT}개 남아있습니다."
  echo "다음 작업: ${NEXT_TASK}"
  if [ -n "$PDCA_STATUS" ]; then
    echo "현재 PDCA 상태: ${PDCA_STATUS}"
  fi
  echo "TASK.md를 확인하고 다음 항목을 진행하세요."
  exit 2  # 계속 작업시킴
fi

exit 0
