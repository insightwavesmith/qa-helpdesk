---
id: PM-002
date: 2026-03-30
severity: critical
category: chain
status: resolved
prevention_tdd: [__tests__/hooks/chain-e2e-realworld.test.ts]
---

# team-context 병렬 충돌

## 1. 사고 요약
> 2026-03-30 — CTO/PM/COO 3팀이 단일 team-context.json 공유 → TeamDelete가 파일 삭제 → 직후 pdca-chain-handoff가 context 없어서 exit 0 → 체인 실전 동작률 0%

감지 방법: 체인 E2E 테스트 동작률 0% 확인
영향 시간: 세션 전체

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| 세션 시작 | CTO/PM/COO 3팀 병렬 운영 |
| 작업 중 | TeamDelete 시 team-context.json 삭제 |
| 발견 | pdca-chain-handoff에서 context 미존재 → 체인 0% |
| 수정 | team-context-resolver.sh 도입 (팀별 파일 분리 + 아카이빙) |

## 3. 영향 범위
- **영향 파일**: .claude/hooks/helpers/team-context-resolver.sh, 9개 hook
- **영향 기능**: PDCA 체인 핸드오프 전체
- **사용자 영향**: 기능 저하 — 자동 체인 불가 (수동 fallback)
- **데이터 영향**: 없음

## 4. 근본 원인 (5 Whys)
1. Why: 병렬 팀이 단일 team-context.json 파일을 공유하는 설계 결함
2. Why: TeamDelete가 rm 사용 (아카이빙 아님) → 삭제 후 복구 불가
3. Why: hook 실행 순서에서 삭제→참조 의존성 미고려

**근본 원인 한 줄**: 병렬 에이전트가 공유하는 단일 파일 구조 설계 결함

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| helpers/team-context-resolver.sh | 팀별 파일 분리 + 아카이빙 | e4c41dc |
| 9개 hook | resolver 통일 적용 | e4c41dc |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | resolver로 팀별 파일 분리 | hook | chain-e2e-realworld:CC-5 (병렬 독립) | resolved |
| 2 | 삭제 대신 아카이빙 (rm→mv) | hook | chain-e2e-realworld:CC-6 (아카이빙) | resolved |
| 3 | 아카이브에서 체인 참조 가능 | hook | chain-e2e-realworld:CC-7 | resolved |

## 7. 교훈
- 병렬 에이전트가 공유하는 파일은 반드시 분리 설계
- 삭제 대신 아카이빙이 기본. rm은 최후 수단.

## 8. 검증
- [x] 재발 방지책 TDD 작성 완료
- [x] TDD 전체 Green 확인
- [x] CLAUDE.md 또는 hook에 규칙 반영
- [x] status → resolved 변경
