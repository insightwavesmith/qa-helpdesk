# TASK.md — 뉴스레터 성과 추적 UI (WIP, 새 세션 인계)
> 2026-02-23 | 에이전트팀 Rate limit으로 중단 → 새 세션에서 이어받기

## 타입
개발

## 목표
뉴스레터 편집 패널에 "성과 추적" 탭 추가. 발송된 뉴스레터별 열람율/클릭율 시각화.

## 현재 상태 (WIP)
- 커밋: `d907471` (wip: 뉴스레터 성과 추적 UI)
- **빌드 에러 있음 — 이어받기 전 반드시 확인**

## 빌드 에러 (수정 필요)

### 에러 내용
```
./src/app/api/admin/email/analytics/route.ts:57:21
Type error: Property 'subject' does not exist on type
'SelectQueryError<"column 'content_id' does not exist on 'email_sends'.">'
```

### 원인
`email_sends` 테이블에 `content_id` 컬럼이 없음. DB 마이그레이션 누락.

### 해결 방법
1. `email_sends` 테이블 스키마 확인 (`supabase/migrations/` 검색)
2. `content_id` 컬럼 추가하는 마이그레이션 파일 생성
3. 또는 analytics API에서 `content_id` 없이 작동하도록 쿼리 수정

## 완료된 파일
- `src/components/content/newsletter-analytics-tab.tsx` — 성과 추적 탭 컴포넌트 (356줄)
- `src/app/api/admin/email/analytics/route.ts` — 분석 API
- `src/app/(main)/admin/content/[id]/page.tsx` — 탭 연결 수정
- `scripts/embed-notion.mjs` — 노션 임베딩 스크립트 (별도 작업)

## 남은 작업
☐ DB 마이그레이션 에러 해결
☐ npm run build 성공 확인
☐ 관리자 로그인 → 뉴스레터 편집 → "성과 추적" 탭 확인
☐ Vercel 배포

## 제약
- `email_sends` 테이블 기존 스키마 보존
- 기존 발송/편집/구독자 탭 회귀 없어야 함

## 태스크

### T1. DB 마이그레이션 수정 (→ backend-dev)
**대상 파일:** `src/app/api/admin/email/analytics/route.ts`, `supabase/migrations/`

1. `email_sends` 테이블 현재 스키마 확인
2. `content_id` 컬럼 존재 여부 확인
3. 없으면 마이그레이션 추가 또는 쿼리 수정
4. 빌드 통과 확인

### T2. 빌드 통과 + 배포 (→ frontend-dev)
1. `npm run build` 성공
2. Vercel 배포 (`npx vercel --prod`)

## 현재 코드

### email_sends 관련 에러 위치 (route.ts:57)
```ts
// 문제 라인
const key = s.subject || "제목 없음";
// email_sends에 subject, content_id 컬럼 없음
```

## 엣지 케이스
1. `email_sends` 테이블에 `content_id` 없을 때 → JOIN 없이 쿼리 재설계
2. 발송 이력 0건 → "발송 이력 없음" 빈 상태 표시
3. analytics 데이터 없을 때 → 0% 표시

## 검증
☐ npm run build 성공
☐ 성과 추적 탭 표시 확인
☐ 기존 탭 회귀 없음

## 완료 후 QA
☐ /bkit pdca check 실행
☐ QA봇에게 결과 보고 (sessions_send → agent:qa-lead:main)

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/task/2026-02-23-newsletter-analytics-mockup.html
- 리뷰 일시: 2026-02-23 10:27
- 변경 유형: UI/UX 추가
- 반영 여부: 목업 기반 구현 중
