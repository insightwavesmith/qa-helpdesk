# TASK: 에이전트팀 시스템 P0 버그 3건 수정

## 배경
PM팀 조사 결과 시스템 안정성을 해치는 P0 버그 3건 발견.
슬랙 알람이 안 오고 빈 체인 신호가 오는 원인들.

## P0-1: 유령 hook 제거
- 파일: `/Users/smith/projects/bscamp/.bkit/settings.local.json`
- 문제: `notify-completion.sh` 등록되어 있으나 파일 미존재 → TaskCompleted 시 에러
- 수정: settings.local.json에서 해당 항목 제거 또는 파일 생성

## P0-2: PDCA 오염 피처 정리
- 파일: `/Users/smith/projects/bscamp/.bkit/state/pdca-status.json`
- 문제: helpers, .claude, bscamp 등 10건이 Plan/Design 없이 phase: "do" 상태로 존재
  → 체인 handoff 트리거되면 빈 완료 신호(산출물 없음) 발생
- 수정: 오염된 피처 제거 또는 phase 초기화 (plan으로 되돌리기)

## P0-3: 에러 분류기 수정
- 파일: `/Users/smith/projects/bscamp/.bkit/state/error-log.json`
- 문제: 20건 전부 type: "unknown", message: "" — 분류 로직이 실질 작동 안 함
- 수정: 에러 분류 스크립트 찾아서 실제 에러 타입/메시지 기록하도록 수정

## 완료 기준
- TaskCompleted hook 실행 시 에러 없음
- 빈 체인 신호(산출물 없음) 더 이상 안 옴
- error-log.json에 실제 에러 내용 기록됨

## COO 의견
COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
