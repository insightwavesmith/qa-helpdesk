# TASK.md — 크론 수정 + 뉴스레터 보안 (2026-02-24)

> 작성: 모찌 | 승인 대기

## 배경
- 크론 3건에 문제 발생 (딜리버리 에러, 파라미터 에러, 타임아웃)
- 뉴스레터 성과 추적 UI에서 bkit QA Critical 3건 미해결 (C1/C5/C6)

---

## T1. naver-seo 크론 딜리버리 에러 수정

**문제:** 분석은 성공하지만 `cron announce delivery failed` 에러
**크론 ID:** `d40bf85d-1726-494b-af1d-181903401434`
**에이전트:** marketing-lead

**원인 조사:**
- delivery 설정: `mode: announce, channel: slack, to: C0A07BS49RS`
- marketing-lead 에이전트의 Slack 계정(dev-lead)에 C0A07BS49RS 채널 접근 권한 확인 필요
- dev-lead 계정의 channels 설정에 C0A07BS49RS가 없음 (C087444TEEB, C0A07BS49RS만 있음 → 있긴 함)

**수정:**
- 크론 딜리버리를 `bestEffort: true`로 변경
- 또는 delivery.mode를 none으로 바꾸고 크론 메시지 내에서 직접 message tool로 전송하도록 변경

**파일:** 크론 설정 변경 (코드 변경 아님)

---

## T2. benchmark-daily 크론 에러 수정

**문제:** "account_id is required" 에러 + Slack 권한 에러
**크론 ID:** `1fe4d734-351d-4076-95ff-34379a8f8ad3`
**에이전트:** cron-worker

**원인:** Cloud Run 엔드포인트 `collect-daily`가 account_id 파라미터를 요구하는데 크론에서 전달하지 않음
**현재 상태:** lastStatus=ok (최근 실행은 성공, 이전 실행에서 에러)

**수정:**
- 크론 메시지에 account_id 파라미터 추가 또는 엔드포인트 확인
- 현재 성공하고 있으면 모니터링만

**파일:** 크론 설정 변경 (코드 변경 아님)

---

## T3. qa-ai-answer 크론 타임아웃 해결

**문제:** 300초(5분) 타임아웃에 5연속 실패 → 비활성화됨
**크론 ID:** `b4dd6e27-a9ae-4c34-b4d1-e1d26c2a75f7`
**에이전트:** cron-worker

**원인:** 한 턴에 너무 많은 작업 수행
1. Supabase에서 미답변 질문 조회
2. 각 질문마다 Gemini 임베딩 생성
3. search_lecture_chunks RPC 호출
4. AI 답변 작성
5. answers 테이블 insert
6. Slack 알림

**해결 방안:**
- Option A: 타임아웃 600초로 증가 + 한 번에 최대 3건만 처리하도록 메시지 수정
- Option B: 스크립트로 분리 (scripts/qa-auto-answer.mjs) → 크론은 스크립트 실행만

**권장:** Option A (빠른 수정)

**수정:**
- timeoutSeconds: 300 → 600
- 메시지에 "최대 3건만 처리" 조건 추가
- consecutiveErrors 리셋 후 재활성화

**파일:** 크론 설정 변경 (코드 변경 아님)

---

## T4. 뉴스레터 성과 추적 UI — Critical 3건 수정

**배경:** 커밋 `19f392c`로 배포된 뉴스레터 성과 추적 UI에서 bkit QA Critical 6건 중 C2/C3/C4는 수정 완료, C1/C5/C6 미해결

### T4-1. C1: as any 타입 캐스트 제거 (타입 안전성)
**위치:** `src/app/api/admin/newsletter/stats/route.ts:31`
**문제:** DB types에 content_id 컬럼이 누락되어 `as any` 캐스트 사용 중
**수정:**
- Supabase types 재생성 (`npx supabase gen types typescript`)
- email_sends 테이블에 content_id가 있으면 타입에 반영
- `as any` 제거하고 정확한 타입 사용

### T4-2. C5: 클릭 추적 오픈 리다이렉트 취약점
**위치:** `src/app/api/newsletter/track/route.ts`
**문제:** 클릭 추적 시 url 파라미터를 검증 없이 리다이렉트 → 오픈 리다이렉트 공격 가능
**수정:**
- 허용 도메인 화이트리스트 적용 (자사 도메인만)
- 또는 url을 DB에서 조회해서 매칭된 것만 리다이렉트
- 외부 URL은 차단하거나 경고 페이지 표시

### T4-3. C6: email_sends RLS 정책 없음
**위치:** Supabase migrations
**문제:** email_sends 테이블에 RLS 정책이 없어 인증된 사용자가 모든 발송 기록 조회 가능
**수정:**
- email_sends 테이블 RLS 활성화
- 정책: 관리자(admin/super_admin)만 조회 가능
- 마이그레이션 파일 추가

---

## 완료 기준
- [ ] T1: naver-seo 크론 딜리버리 정상 동작 확인
- [ ] T2: benchmark-daily 모니터링 (현재 성공 중이면 패스)
- [ ] T3: qa-ai-answer 재활성화 후 1회 성공 실행
- [ ] T4-1: `as any` 제거, 빌드 성공
- [ ] T4-2: 오픈 리다이렉트 차단, 자사 도메인만 허용
- [ ] T4-3: email_sends RLS 마이그레이션 추가, 빌드 성공

---

## 리뷰 결과

> 리뷰어: 에이전트팀 (Plan mode)
> 일시: 2026-02-24 13:29 KST

### C1 (as any 타입캐스트)
- 위치: `src/app/api/admin/email/analytics/route.ts:37-43, 60-61`
- `svc as any`로 Supabase 클라이언트 전체 any 캐스트, `sends: any[]`
- 원인: `00012_email_tracking.sql`에서 content_id 추가했지만 database.ts 미재생성
- 수정: `npx supabase gen types typescript` → as any 제거

### C5 (오픈 리다이렉트)
- 위치: `src/app/api/email/track/route.ts:88-95`
- URL 검증 완전 부재, 프로토콜/도메인 미검증
- 수정: 허용 도메인 화이트리스트 (qa-helpdesk.vercel.app, localhost 등)

### C6 (email_sends RLS)
- email_sends 테이블 RLS 미활성화, 인증된 사용자 누구나 전체 조회 가능
- 동일 도메인 테이블(email_logs, contents)은 모두 RLS 있음
- 수정: 00025_email_sends_rls.sql 마이그레이션 추가 (is_admin() 패턴)

## 리뷰 보고서
- Plan 파일: `~/.claude/plans/radiant-munching-anchor.md`
