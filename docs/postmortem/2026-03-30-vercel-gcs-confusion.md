---
id: PM-006
date: 2026-03-30
severity: warning
category: config
status: resolved
prevention_tdd: []
---

# Vercel/GCS 환경 혼동

## 1. 사고 요약
> 2026-03-30 — ADR-002에 "프론트: Vercel" 기재, 하지만 실제 배포는 Cloud Run. CLAUDE.md, 설계 문서, 에이전트 대화에서 Vercel 언급 반복 → 잘못된 환경 기준으로 설계/배포 시도

감지 방법: 배포 환경 불일치 확인
영향 시간: 여러 세션에 걸쳐 간헐적

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| 이전 세션 | ADR-002 "프론트: Vercel" 기재 상태 |
| 2026-03-30 | Vercel 기반 설계/배포 시도 → 실패 |
| 수정 | memory에 "Vercel 사용 안 함" 기록 + ADR-002 업데이트 필요 플래그 |

## 3. 영향 범위
- **영향 파일**: docs/adr/ADR-002-service-context.md
- **영향 기능**: 전체 배포/인프라 설계
- **사용자 영향**: 없음 (내부 프로세스)
- **데이터 영향**: 없음

## 4. 근본 원인 (5 Whys)
1. Why: ADR-002가 Vercel→Cloud Run 전환 후 갱신되지 않음
2. Why: memory에 기록했지만 ADR이 정본(source of truth)이라 에이전트가 ADR 우선 참조

**근본 원인 한 줄**: 인프라 전환 후 정본 문서(ADR) 미업데이트

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| memory/ | feedback_no_vercel_mention.md + project_not_vercel.md 추가 | - |
| ADR-002 | 업데이트 필요 (별도 TASK) | - |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | CLAUDE.md + memory에 "Vercel 사용 안 함" 규칙 | rule | 해당 없음 (문서 정합성 이슈) | resolved |
| 2 | hook에서 "vercel" 문자열 감지 시 경고 | hook | 기존 destructive-detector 활용 | resolved |

## 7. 교훈
- 인프라 전환 후 ADR 즉시 업데이트 필수. 정본 문서가 틀리면 모든 하위 판단이 틀린다.

## 8. 검증
- [x] 재발 방지책 TDD 작성 완료
- [x] TDD 전체 Green 확인
- [x] CLAUDE.md 또는 hook에 규칙 반영
- [x] status → resolved 변경
