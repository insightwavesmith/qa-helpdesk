# TASK.md — 뉴스레터 성과 추적 UI
> 2026-02-23 | 빌드 에러 수정 완료, 배포 완료 → bkit QA + 브라우저 QA 진행

## 타입
개발

## 목표
뉴스레터 편집 패널에 "성과 추적" 탭 추가. 발송된 뉴스레터별 열람율/클릭율 시각화.

## 완료된 작업
- [x] analytics tab 컴포넌트 구현 (`newsletter-analytics-tab.tsx`)
- [x] analytics API 구현 (`/api/admin/email/analytics/route.ts`)
- [x] 뉴스레터 편집 패널 탭 연결 (`/admin/content/[id]/page.tsx`)
- [x] 빌드 에러 수정 (email_sends content_id → subject 기반 쿼리 재설계)
- [x] 빌드 성공 확인
- [x] qa-helpdesk-coral.vercel.app 배포 완료

## 커밋
- `d907471` wip: 뉴스레터 성과 추적 UI
- `a2b112d` fix: 뉴스레터 성과 추적 API 타입 에러 수정

## 남은 작업

### T1. bkit QA (→ leader)
☐ /bkit pdca check 실행
☐ Match Rate 90%+, Critical 0 확인
☐ QA 결과 기록

### T2. 프로덕션 배포 (→ frontend-dev)
☐ npx vercel --prod 실행 (qa-helpdesk.vercel.app)
☐ git push

## 현재 코드
- analytics tab: `src/components/content/newsletter-analytics-tab.tsx` (356줄)
- analytics API: `src/app/api/admin/email/analytics/route.ts`
- 탭 연결: `src/app/(main)/admin/content/[id]/page.tsx`

## 엣지 케이스
1. 발송 이력 0건 → "발송 이력 없음" 빈 상태
2. analytics 데이터 없을 때 → 0% 표시
3. 기존 탭(발송/편집/구독자) 회귀 없음

## 검증
☐ npm run build 성공 (완료)
☐ qa-helpdesk-coral 배포 확인 (완료)
☐ 관리자 로그인 → 뉴스레터 편집 → "성과 추적" 탭 표시 확인
☐ 기존 탭 회귀 없음

## 완료 후 QA
☐ /bkit pdca check 실행
☐ QA봇에게 결과 보고 (sessions_send → agent:qa-lead:main)

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/task/2026-02-23-newsletter-analytics-mockup.html
- 리뷰 일시: 2026-02-23 10:27
- 변경 유형: UI/UX 추가
- 반영 여부: 구현 완료
