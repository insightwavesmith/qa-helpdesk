---
id: PM-001
date: 2026-03-26
severity: critical
category: migration
status: resolved
prevention_tdd: [__tests__/hooks/chain-e2e-realworld.test.ts]
---

# 쿼리빌더 Big Bang 마이그레이션 장애

## 1. 사고 요약
> 2026-03-26 — Supabase SDK → Cloud SQL 커스텀 쿼리빌더 전환 과정에서 PostgREST 패턴 불완전 구현으로 사이트 전체 쓰기 기능 장애 + 속도 저하 발생.

감지 방법: 게시글/질문 미표시 → 수동 감사
영향 시간: 03-25 ~ 03-26 (약 24시간)

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| 03-24 | GCP Cloud SQL 전환 시작 (3e719a4) |
| 03-25 | Supabase SDK 완전 제거 126파일 (d86a923) — 버그 주입 |
| 03-25 | Firebase Auth 전환 + 미들웨어 복원 (c507191, 4b028dd) |
| 03-26 | 게시글/질문 미표시 발견 → 감사 시작 |
| 03-26 | BUG-1,2,4 수정 (d6e9daf, c4e0689) |
| 03-26 | BUG-3,5,6,7 + Speed 수정 완료 |

## 3. 영향 범위
- **영향 파일**: 126파일 (d86a923), 이후 수정 25파일 (BUG-3)
- **영향 기능**: 전체 쓰기 기능 (게시글, 질문, 댓글, 큐레이션, 온보딩, 인증)
- **사용자 영향**: 서비스 장애 — 쓰기 전면 불가
- **데이터 영향**: 데이터 유실 없음 (INSERT가 SELECT로 실행되어 무시됨)

## 4. 근본 원인 (5 Whys)
1. Why: 126파일을 한 커밋에 변경 (Big Bang 마이그레이션)
2. Why: 쿼리빌더 체이닝 패턴 (.insert().select()) 전수 조사 안 함
3. Why: 런타임 QA 없이 tsc+build 통과만으로 완료 판단
4. Why: Firebase verifySessionCookie(true) 성능 미고려
5. Why: Next.js 16 middleware→proxy 컨벤션 변경 미확인

**근본 원인 한 줄**: Big Bang 마이그레이션 + 런타임 QA 부재로 체이닝 패턴 누락

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| query-builder.ts | .insert().select() 체이닝 수정 | d6e9daf |
| 25 action/lib/api 파일 | INSERT operation 덮어쓰기 수정 | d6e9daf |
| proxy.ts | 정적파일 스킵 | c4e0689 |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | 마이그레이션 3단계 분할 강제 (50파일 이상 금지) | rule | chain-e2e-realworld.test.ts | resolved |
| 2 | 런타임 체크리스트 필수 (로그인→글작성→조회→댓글) | process | - | resolved |
| 3 | 쿼리빌더 변경 시 패턴 전수 조사 | rule | - | resolved |
| 4 | 팀원 산출물 중간 검증 필수 | process | - | resolved |
| 5 | 배포 후 런타임 검증 (IAM, 환경변수, 로그 확인) | process | - | resolved |

## 7. 교훈
- Big Bang 마이그레이션은 반드시 3단계 이상 분할
- tsc+build 통과 ≠ 런타임 정상. SQL 문자열 정확성은 타입 체크로 불가.
- "에러가 안 나는 버그"가 가장 위험 (.insert()가 SELECT로 실행)
- 배포 성공 ≠ 서비스 정상. 프로덕션 로그 확인 필수.

## 8. 검증
- [x] 재발 방지책 TDD 작성 완료
- [x] TDD 전체 Green 확인
- [x] CLAUDE.md 또는 hook에 규칙 반영
- [x] status → resolved 변경
