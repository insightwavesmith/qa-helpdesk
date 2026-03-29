# Agent Ops Review Issues Gap 분석

> 분석일: 2026-03-29
> 설계서: `docs/02-design/features/agent-ops-review-issues.design.md`

## Match Rate: 97%

## 일치 항목 (33/34)

| # | 설계 항목 | 구현 | 상태 |
|---|----------|------|:----:|
| 1 | pdca-chain-handoff.sh v2 전체 교체 | ✅ v1→v2 교체 완료 (184줄) | ✅ |
| 2 | set -uo pipefail 추가 | ✅ 스크립트 3줄째 | ✅ |
| 3 | CTO* 접두사 매칭 | ✅ `[[ "$TEAM" != CTO* ]]` | ✅ |
| 4 | HIGH_RISK_PATTERN 정규식 | ✅ auth/middleware.ts/migration/.sql/payment/.env/firebase/supabase | ✅ |
| 5 | L0/L1 → MOZZI (PM 스킵) | ✅ case 분기 + cto_to_coo | ✅ |
| 6 | L2 일반 → PM + 30분 타임아웃 | ✅ auto_approve_after_minutes: 30 | ✅ |
| 7 | L2 고위험 → PM 수동 필수 | ✅ requires_manual_review: true | ✅ |
| 8 | L3 → PM 수동 필수 | ✅ case L3 분기 | ✅ |
| 9 | curl 직접 전송 (broker /send-message) | ✅ curl -sf -X POST | ✅ |
| 10 | broker 다운 → ACTION_REQUIRED fallback | ✅ 기존 동작 유지 | ✅ |
| 11 | peer 미발견 → ACTION_REQUIRED fallback | ✅ TARGET_ID 빈값 체크 | ✅ |
| 12 | 자기 ID 미발견 → ACTION_REQUIRED fallback | ✅ MY_ID 빈값 체크 | ✅ |
| 13 | send-message 실패 → ACTION_REQUIRED fallback | ✅ ok:false 체크 | ✅ |
| 14 | msg_id에 PID 포함 | ✅ `chain-cto-$(date +%s)-$$` | ✅ |
| 15 | COMPLETION_REPORT v2 payload | ✅ process_level, risk_flags, auto_approve, requires_manual_review | ✅ |
| 16 | session-resume-check.sh 신규 | ✅ 90줄, 4가지 감지 | ✅ |
| 17 | 미완료 피처 감지 (currentState != completed) | ✅ jq 쿼리 + 출력 | ✅ |
| 18 | 좀비 팀원 감지 (shutdownState=running + active) | ✅ jq 쿼리 + 출력 | ✅ |
| 19 | 미착수 TASK 감지 (pending/없음) | ✅ awk frontmatter 파싱 | ✅ |
| 20 | pdca-status 노후 감지 (24h+) | ✅ stat -f %m (macOS) | ✅ |
| 21 | 항상 exit 0 (차단 안 함) | ✅ 마지막 줄 exit 0 | ✅ |
| 22 | TDD RV-1~RV-7 (위험도 게이트) | ✅ 7건 Green | ✅ |
| 23 | TDD RV-8~RV-15 (curl 전송) | ✅ 8건 Green | ✅ |
| 24 | TDD RV-16~RV-20 (호환성) | ✅ 5건 Green | ✅ |
| 25 | TDD RV-21~RV-23 (CTO 변형) | ✅ 3건 Green | ✅ |
| 26 | TDD SR-1~SR-4 (미완료 피처) | ✅ 4건 Green | ✅ |
| 27 | TDD SR-5~SR-8 (좀비 팀원) | ✅ 4건 Green | ✅ |
| 28 | TDD SR-9~SR-10 (미착수 TASK) | ✅ 2건 Green | ✅ |
| 29 | TDD SR-11 (복합 시나리오) | ✅ 1건 Green | ✅ |
| 30 | TDD SR-12 (malformed JSON → exit 0) | ✅ 1건 Green | ✅ |
| 31 | helpers.ts 7개 함수 추가 | ✅ writeAnalysisFile, writeTeamContext, writePdcaStatus, writeTaskFile, writeRegistry, writeEmptyRegistry, prepareChainHandoffV2, prepareSessionResumeCheck, createMockCurl | ✅ |
| 32 | fixtures 5개 신규 | ✅ broker_peers_full/cto_only, broker_send_ok/fail, pdca_status_incomplete | ✅ |
| 33 | CLAUDE.md 세션 복구 프로토콜 규칙 | ✅ "bash .claude/hooks/session-resume-check.sh" 규칙 추가 | ✅ |

## 불일치 항목 (1/34)

| # | 설계 항목 | 구현 | 차이 | 영향도 |
|---|----------|------|------|:------:|
| 34 | 설계서: broker fallback에서 "수동 검수 필수" 미포함 | ✅ 추가: MANUAL_REVIEW=true 시 모든 fallback 경로에 "수동 검수 필수" 출력 | 설계 보완 (테스트 호환성) | P3 |

## 기존 테스트 호환

| 테스트 스위트 | 건수 | 결과 |
|-------------|:----:|:----:|
| pdca-chain-handoff-v2.test.ts | 23 | ✅ 23/23 |
| session-resume-check.test.ts | 12 | ✅ 12/12 |
| pdca-chain-handoff.test.ts (PC-1~25) | 25 | ✅ 25/25 |
| 전체 hooks/ | 187 | ✅ 186/187 (QG-10 기존 설계의도Red) |

## 수정 필요: 없음

Match Rate 97%로 기준(90%) 충족. 불일치 1건은 설계 보완 수준으로 경미.
