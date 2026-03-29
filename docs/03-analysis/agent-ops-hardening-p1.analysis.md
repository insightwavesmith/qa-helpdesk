# Agent Ops Hardening P1 (에이전트 운영 강화 P1) Gap 분석

## Match Rate: 100%

## 분석 일시
2026-03-30

## 설계서
- `docs/02-design/features/agent-ops-hardening-p1.design.md`

## 일치 항목

### D3: 에러 분류 룰북 (Error Classifier Rulebook)
| 설계 항목 | 구현 상태 | 비고 |
|-----------|-----------|------|
| classify_error() bash 함수 | ✅ 구현 완료 | `.claude/hooks/helpers/error-classifier.sh` |
| 7 패턴 규칙 (RATE_LIMIT~CONTEXT_OVERFLOW) | ✅ 구현 완료 | grep -qiE 기반 |
| CLASSIFIED_CODE/SEVERITY/ACTION 반환 | ✅ 구현 완료 | |
| 우선순위 순서 (429→401→403→4xx→...) | ✅ 구현 완료 | |
| 미분류 시 return 1 + UNKNOWN | ✅ 구현 완료 | |
| 룰북 문서 (error-rulebook.md) | ✅ 구현 완료 | `docs/ops/error-rulebook.md` |
| EC-1~EC-12 TDD 테스트 | ✅ 12/12 Green | `__tests__/hooks/error-classifier.test.ts` |

### D6: 수신 측 중복 보고 방지 (Receiver-side Dedup)
| 설계 항목 | 구현 상태 | 비고 |
|-----------|-----------|------|
| _check_received() 함수 | ✅ 양쪽 구현 | pm-chain-forward.sh + coo-chain-report.sh |
| _record_received() 함수 | ✅ 양쪽 구현 | |
| chain-received.log (epoch\|msg_id) | ✅ 구현 완료 | 300초 TTL |
| 중복 시 "SKIP: dedup" + exit 0 | ✅ 구현 완료 | |
| msg_id 없으면 dedup 안 함 | ✅ 구현 완료 | |
| stale 항목 자동 정리 (5분+) | ✅ 구현 완료 | _record_received 내 inline |
| CDR-1~CDR-6 TDD 테스트 | ✅ 6/6 Green | `__tests__/hooks/chain-dedup-receiver.test.ts` |

### D8-5: CLAUDE.md 슬림화
| 설계 항목 | 구현 상태 | 비고 |
|-----------|-----------|------|
| CLAUDE.md 300줄 이하 | ✅ 175줄 | 목표 초과 달성 |
| CLAUDE-DETAIL.md 생성 | ✅ 535줄 | 상세 프로토콜 전부 이동 |
| 규칙 삭제 0건 | ✅ 확인 | 전부 이동/압축만 |
| 에러 분류 룰북 섹션 추가 | ✅ 추가 완료 | CLAUDE.md 마지막 섹션 |
| 총합 710줄 (원본 741줄) | ✅ 압축 효과 | 31줄 순감 (중복 제거) |

## 불일치 항목
없음

## 수정 필요
없음

## 테스트 결과 요약
- P1 신규 테스트: EC-1~12 + CDR-1~6 = **18/18 Green**
- P0 기존 테스트: OFR-1~35 = **35/35 Green** (회귀 없음)
- 기존 실패(P1 무관): chain-e2e 1건 (broker 미기동), zombie-pane-detector 1건 (타임아웃)

## 수정된 파일
| 파일 | 변경 |
|------|------|
| `.claude/hooks/helpers/error-classifier.sh` | 신규 — 에러 분류 함수 |
| `docs/ops/error-rulebook.md` | 신규 — 에러 패턴 룰북 문서 |
| `.claude/hooks/pm-chain-forward.sh` | 수정 — 수신 측 dedup 추가 (+35줄) |
| `.claude/hooks/coo-chain-report.sh` | 수정 — 수신 측 dedup 추가 (+35줄) |
| `CLAUDE.md` | 수정 — 741줄 → 175줄 (핵심만 유지) |
| `CLAUDE-DETAIL.md` | 신규 — 상세 프로토콜 535줄 |
| `__tests__/hooks/error-classifier.test.ts` | 신규 — EC-1~12 |
| `__tests__/hooks/chain-dedup-receiver.test.ts` | 신규 — CDR-1~6 |
| `docs/02-design/features/agent-ops-hardening-p1.design.md` | 신규 — P1 설계서 |
