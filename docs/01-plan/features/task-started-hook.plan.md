# TaskStarted Hook (작업 시작 알림) Plan

> 작성일: 2026-04-01
> 프로세스 레벨: L2-기능 (PDCA)
> 작성자: PM 리더
> 근거: Smith님 요청 — 팀 작업 시작 시점 추적 불가

---

## Executive Summary

현재 TaskCompleted만 Slack 알림 + DB 업데이트.
팀이 언제 작업을 시작했는지 추적 불가 → Smith님이 진행 상황 모름.
해결: Claude Code의 `TaskCreated` 이벤트에 hook을 걸어 시작 알림 + DB 상태 업데이트.

---

## 기술 조사 결과

| 항목 | 내용 |
|------|------|
| 이벤트 이름 | `TaskCreated` (Claude Code 내장, `TaskStarted`는 없음) |
| 페이로드 | `task_id`, `task_subject`, `task_description`, `teammate_name`, `team_name` |
| matcher | 무시됨 (TaskCreated는 모든 hook 무조건 실행) |
| 기존 등록 | 없음 (settings.local.json에 TaskCreated 미등록) |
| 참조 구현 | `notify-completion.sh` (3중 전송: 채널+DM+webhook) |

---

## 산출물

| # | 파일 | 설명 |
|---|------|------|
| 1 | `.bkit/hooks/notify-task-started.sh` | TaskCreated 이벤트 hook (신규) |
| 2 | `.bkit/hooks/task-started-db-update.sh` | DB 상태 in_progress 업데이트 (신규) |
| 3 | `.claude/settings.local.json` | TaskCreated 이벤트 hook 등록 |

---

## 구현 범위

### 포함
- Slack 3중 전송 (채널 + Smith님 DM + COO webhook) — notify-completion.sh 패턴 재사용
- DB task_state를 `in_progress`로 업데이트
- DRY_RUN 지원
- block-logger EXIT trap 포함
- error-log.json 에러 기록

### 제외
- 대시보드 UI 변경 (별도 TASK)
- Slack 메시지 인터랙티브 버튼

---

## 완료 조건

- [ ] TaskCreated 이벤트 발생 시 Slack DM + 채널 전송 성공
- [ ] DB task 상태 in_progress 업데이트
- [ ] settings.local.json에 TaskCreated hook 등록
- [ ] DRY_RUN 테스트 통과
- [ ] block-logger EXIT trap 포함
- [ ] notify-completion.sh와 동일한 에러 처리 패턴
