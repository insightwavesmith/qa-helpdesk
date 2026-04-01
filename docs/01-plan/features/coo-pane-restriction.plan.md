# COO tmux 팀원 pane 직접 접근 차단 (coo-pane-restriction) Plan

> 작성일: 2026-04-01
> 프로세스 레벨: L2 (src/ 미수정, .bkit/hooks/ 수정)
> 작성자: PM팀
> TASK 원본: `/Users/smith/.openclaw/workspace/tasks/TASK-COO-PANE-RESTRICTION.md`

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | COO(모찌)가 팀원 pane에 직접 tmux send-keys로 개입하는 것을 hook으로 차단 |
| **작성일** | 2026-04-01 |
| **핵심** | 역할 경계 불침범(A0-3) 강화 — COO는 리더(pane 0)만 통신, 팀원 pane 직접 접근 금지 |
| **배경** | COO가 sdk-cto.1+ pane에 직접 send-keys로 개입하는 위반 발생 |
| **선행** | destructive-detector.sh(완료), is-teammate.sh(완료) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | COO가 리더를 우회하여 팀원에 직접 지시 → 리더 컨텍스트 단절 + 지시 충돌 + 작업 혼선 |
| **Solution** | PreToolUse:Bash hook으로 `tmux send-keys -t sdk-*.[1-9]` 패턴 차단 + 리더 pane으로 자동 리다이렉트 안내 |
| **Function UX Effect** | COO가 팀원 pane 접근 시도 시 즉시 차단 + "리더(sdk-xxx.0)로 전달하세요" 안내 메시지 |
| **Core Value** | 역할 경계를 시스템으로 강제. LLM 판단 0, 패턴 매칭으로 게이트 |

---

## 설계 원칙

### 범용 설계 (COO 전용 → 비리더 전체)

TASK는 COO 전용 차단을 요청하지만, 더 강건한 원칙은:
**"특정 팀의 리더(pane 0)만 해당 팀의 팀원(pane 1+)에 send-keys 가능"**

| 케이스 | 판정 | 이유 |
|--------|------|------|
| COO → sdk-cto.0 | ✅ 허용 | 리더 pane 통신 |
| COO → sdk-cto.1 | ❌ 차단 | 팀원 직접 접근 |
| sdk-cto 리더(pane 0) → sdk-cto.1 | ✅ 허용 | 자기 팀 팀원 |
| sdk-pm 리더 → sdk-cto.1 | ❌ 차단 | 타 팀 팀원 직접 접근 |
| sdk-cto 팀원(pane 1) → sdk-cto.2 | ❌ 차단 | 팀원→팀원 직접 통신 금지 |

### 판별 로직

```
1. 명령어에서 tmux send-keys -t <target> 파싱
2. target이 sdk-*.[1-9] 형태인가? (팀원 pane)
   - 아니면 → 허용 (exit 0)
   - 맞으면 → 3으로
3. 호출자가 해당 팀의 리더(pane 0)인가?
   - 맞으면 → 허용 (자기 팀 팀원)
   - 아니면 → 차단 (exit 2) + 리다이렉트 안내
```

호출자 판별: 현재 프로세스의 tmux 세션/pane 확인 → `tmux display-message -p '#{session_name}.#{pane_index}'`

---

## 구현 산출물

| # | 산출물 | 파일 경로 | 설명 |
|---|--------|----------|------|
| 1 | pane-access-guard.sh | `.bkit/hooks/pane-access-guard.sh` | PreToolUse:Bash hook — 팀원 pane 직접 접근 차단 |
| 2 | settings.local.json 등록 | `.claude/settings.local.json` | PreToolUse:Bash에 pane-access-guard.sh 추가 |
| 3 | TEAM-ABSOLUTE-PRINCIPLES.md | 외부 문서 | A0-7 원칙 추가 |
| 4 | TEAM-PLAYBOOK.md Ch.3 | `docs/TEAM-PLAYBOOK.md` | hook 목록 + 빈 구멍 해결 반영 |
| 5 | TEAM-PLAYBOOK.md Ch.7 | `docs/TEAM-PLAYBOOK.md` | A0-7 절대원칙 카탈로그 추가 |

**별도 hook 파일 생성** (destructive-detector.sh 확장 아닌 신규):
- destructive-detector.sh는 "위험 명령 차단" (범용 파괴 방지)
- pane-access-guard.sh는 "역할 경계 강제" (조직 구조 강제)
- 목적이 다르므로 분리

---

## 완료 게이트

- [ ] pane-access-guard.sh 구현 + settings.local.json 등록
- [ ] TDD 15개 케이스 전량 PASS
- [ ] TEAM-ABSOLUTE-PRINCIPLES.md A0-7 추가
- [ ] TEAM-PLAYBOOK.md Ch.3 hook 목록 + Ch.7 원칙 카탈로그 업데이트
- [ ] 실제 차단 테스트: `tmux send-keys -t sdk-cto.1 "test"` → exit 2 확인

---

## 위험 & 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| tmux 환경 외 실행 시 오판 | 차단 안 됨 | $TMUX 미존재 시 허용 (비-tmux 환경은 팀 구조 없음) |
| send-keys 변형 구문 우회 | 차단 누락 | `-t` 옵션 위치 무관 매칭 + `send-keys` 별칭(send-key) 포함 |
| 리더가 타 팀 팀원에 send-keys | 교차 팀 간섭 | 호출자 세션명 ≠ 타겟 세션명이면 차단 |
