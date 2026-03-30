---
id: PM-003
date: 2026-03-30
severity: warning
category: process
status: resolved
prevention_tdd: [__tests__/hooks/chain-e2e-realworld.test.ts]
---

# 승인 요청 리더 미전달

## 1. 사고 요약
> 2026-03-30 — 팀원이 .claude/ 수정 시 approval-handler가 pending 파일 생성하지만, 리더가 pending 디렉토리를 폴링하지 않아 알 수 없음 → 팀원 stuck

감지 방법: 팀원 작업 교착 확인
영향 시간: 세션 중 간헐적

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| 작업 중 | 팀원 .claude/ 수정 시도 → approval pending 생성 |
| 발견 | 리더가 pending 확인 안 함 → 팀원 교착 |
| 수정 | notify_leader_approval() tmux send-keys 구현 |

## 3. 영향 범위
- **영향 파일**: .claude/hooks/helpers/approval-handler.sh
- **영향 기능**: 팀원 승인 요청 프로세스
- **사용자 영향**: 기능 저하 — 팀원 작업 지연
- **데이터 영향**: 없음

## 4. 근본 원인 (5 Whys)
1. Why: approval-handler가 파일 생성만 하고 리더에게 알림을 보내지 않음
2. Why: 리더 폴링 메커니즘 미설계 — "리더가 알아서 확인할 것" 가정

**근본 원인 한 줄**: 차단 후 알림 미구현 — 차단은 교착이 됨

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| approval-handler.sh | notify_leader_approval() tmux send-keys 추가 | chain-100-percent |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | send-keys 리더 알림 | hook | chain-e2e-realworld:P1-1 (send-keys 호출) | resolved |
| 2 | tmux 없는 환경 fallback | hook | chain-e2e-realworld:P1-2 | resolved |

## 7. 교훈
- 차단 후 알림이 없으면 차단은 교착이 된다. 차단→알림→해제가 세트.

## 8. 검증
- [x] 재발 방지책 TDD 작성 완료
- [x] TDD 전체 Green 확인
- [x] CLAUDE.md 또는 hook에 규칙 반영
- [x] status → resolved 변경
