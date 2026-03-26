# 쿼리빌더 장애 회고 (2026-03-26)

## 사고 요약
Supabase SDK → Cloud SQL 커스텀 쿼리빌더 전환 과정에서 PostgREST 패턴 불완전 구현으로
사이트 전체 쓰기 기능 장애 + 속도 저하 발생.

## 타임라인
| 날짜 | 이벤트 |
|------|--------|
| 03-24 | GCP Cloud SQL 전환 시작 (3e719a4) |
| 03-25 | Supabase SDK 완전 제거 126파일 (d86a923) — **여기서 버그 주입** |
| 03-25 | Firebase Auth 전환 + 미들웨어 복원 (c507191, 4b028dd) |
| 03-26 | 게시글/질문 미표시 발견 → 감사 시작 |
| 03-26 | BUG-1,2,4 수정 (d6e9daf, c4e0689) |
| 03-26 | BUG-3,5,6,7 + Speed 수정 완료 |

## 버그 9건 상세

### 수정 완료
| # | 내용 | 영향 | 커밋 |
|---|------|------|------|
| BUG-1 | alias:table(cols) FK없는 패턴 | posts, qa-embedder | d6e9daf |
| BUG-2 | table(count) 집계 패턴 | questions, search | d6e9daf |
| BUG-3 | .insert().select() operation 덮어쓰기 | **25파일** — 모든 쓰기 기능 | 미커밋 (로컬) |
| BUG-4 | proxy 정적파일 스킵 | 전체 요청 속도 | c4e0689 |
| BUG-5 | ignoreDuplicates DO NOTHING 미구현 | 경쟁사 모니터링 | 미커밋 (로컬) |
| BUG-6 | table!inner() 패턴 미지원 | 소재 분석 6파일 | 미커밋 (로컬) |
| BUG-7 | dot-notation 컬럼 필터 | 소재 분석 2파일 | 미커밋 (로컬) |
| Proxy | middleware→proxy 컨벤션 | Next.js 16 호환 | dbfdb29 |
| Speed | verifySessionCookie(true) | 매 요청 +200ms | 미커밋 (로컬) |

### BUG-3 영향 파일 (25개)
**actions/**: organic, posts, questions, contents, answers, reviews, curation, qa-reports, recipients, distribution, onboarding, auth
**lib/**: cron-logger, ad-creative-embedder, creative-analyzer, domain-intelligence, image-embedder, knowledge, qa-embedder, style-learner
**api/**: posts, internal/add-webinar, competitor/monitors, admin/email/send, cron/sync-notion, cron/collect-content, cron/collect-youtube

## 근본 원인 5가지

### 1. Big Bang 마이그레이션
d86a923 (126파일, +3057/-1247줄) 한 커밋. Auth/DB/패키지를 분리하지 않음.

### 2. 쿼리빌더 체이닝 패턴 전수 조사 안 함
`select()`, `insert()` 개별만 구현. `.insert().select()` 조합 미테스트.
PostgREST에는 8+개 체이닝 패턴 존재 → 쿼리빌더는 3개만 커버.

### 3. 런타임 QA 부재
tsc+build 통과 = SQL 문자열 정확성 미보장. 실제 DB 쿼리 결과 미확인.

### 4. Firebase 마이그레이션 성능 미고려
verifySessionCookie(true) → Google 서버 왕복 200ms. trade-off 평가 없이 설정.

### 5. Next.js 16 breaking change 미확인
middleware → proxy 컨벤션 변경 사전 확인 안 함.

## 재발 방지

### 에이전트팀 규칙 추가
1. **마이그레이션 3단계 분할 강제** — 한 커밋에 50파일 이상 변경 금지
2. **런타임 체크리스트 필수** — 로그인→글작성→조회→댓글→검색
3. **쿼리빌더 변경 시 패턴 전수 조사** — grep으로 모든 호출 패턴 확인
4. **팀원 산출물 중간 검증** — 커밋 전 diff 확인 최소 1회

### Smith님 액션 아이템
1. 마이그레이션 PR 분할 요구 습관화
2. "빌드 성공" ≠ "동작 정상" 인식
3. 쿼리빌더 vs ORM(Drizzle) 전략 결정 필요
