# TASK: 경쟁사 분석기 전체 기능 코드리뷰 + 개발

## 타입
개발

## 목표
경쟁사 분석기의 모든 기능(검색, 모니터링, AI 인사이트, 크론)을 코드리뷰하고, 빠진 기능 구현 + 버그 수정 + 로컬 테스트까지 완료

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)
- 로컬 테스트: npm run dev → 브라우저 또는 curl로 전체 기능 확인

## T1. 전체 코드리뷰
### 파일
- `src/lib/competitor/meta-ad-library.ts` — Meta Ad Library API 연동
- `src/lib/competitor/analyze-ads.ts` — AI 인사이트 분석 로직
- `src/app/api/competitor/search/route.ts` — 키워드 검색 API
- `src/app/api/competitor/pages/route.ts` — 페이지 검색 API (브랜드 등록용)
- `src/app/api/competitor/monitors/route.ts` — 모니터링 CRUD
- `src/app/api/competitor/monitors/[id]/route.ts` — 모니터링 단건 삭제
- `src/app/api/competitor/monitors/[id]/alerts/route.ts` — 알림 조회
- `src/app/api/competitor/insights/route.ts` — AI 인사이트 API
- `src/app/api/cron/competitor-check/route.ts` — 크론 체크
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — 대시보드
- `src/app/(main)/protractor/competitor/components/*.tsx` — UI 컴포넌트 전체
- `src/types/competitor.ts` — 타입 정의
- `src/lib/supabase/middleware.ts` — PUBLIC_PATHS에 `/api/competitor` 포함 확인

### 현재 동작
- 검색: 작동함 (Meta Ad Library API 연동 확인)
- 모니터링: DB 테이블 생성됨 (`competitor_monitors`, `competitor_alerts`), 브랜드 등록 다이얼로그에 페이지 검색 드롭다운 구현됨
- AI 인사이트: 코드 있으나 미테스트
- 크론: 코드 있으나 미테스트
- 모든 API route에 `runtime = "nodejs"`, `dynamic = "force-dynamic"` 설정됨

### 기대 동작
- 전체 파일 읽고 코드 품질, 에러 처리, 타입 안전성, 누락 기능 점검
- 리뷰 결과를 `docs/03-analysis/competitor-full-review.analysis.md`에 기록
- 발견된 문제를 T2~T5에 반영

### 하지 말 것
- T1에서는 코드 수정 하지 마. 리뷰만.

## T2. 모니터링 기능 점검 + 수정
### 파일
- `src/app/api/competitor/monitors/route.ts`
- `src/app/api/competitor/monitors/[id]/route.ts`
- `src/app/api/competitor/monitors/[id]/alerts/route.ts`
- `src/app/(main)/protractor/competitor/components/monitor-panel.tsx`
- `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx`
- `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx`

### 현재 동작
DB 테이블 존재, 등록 다이얼로그 구현됨. 실제 등록/삭제/알림 동작 미확인.

### 기대 동작
- 브랜드 등록 → DB 저장 → 목록 표시 → 삭제 가능
- 알림 조회 API 작동
- 모니터링 카드에 pageId 있으면 프로필 이미지, 없으면 첫 글자 아바타
- 로컬에서 curl로 등록/조회/삭제 테스트 결과 포함

### 하지 말 것
- 모니터링 상한(10개) 로직 변경 금지

## T3. AI 인사이트 기능 숨기기 (서비스 오픈 후 재검토)
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`

### 현재 동작
검색 결과 아래에 AI 인사이트 섹션 표시 (InsightSection 컴포넌트). AI 분석 버튼 누르면 Anthropic API 호출.

### 기대 동작
- InsightSection import 및 렌더링 제거 (코드 삭제 아님, 주석 처리 또는 조건부 숨기기)
- insight 관련 state (insight, loadingInsight, handleAnalyze) 제거
- **API route 파일은 그대로 유지** — 나중에 다시 켤 수 있도록 코드 보존
- 빌드 에러 없이 정상 동작

### 하지 말 것
- API route 파일 (`insights/route.ts`, `analyze-ads.ts`) 삭제 금지 — 나중에 재활성화 예정
- InsightSection 컴포넌트 파일 삭제 금지

## T4. 크론 체크 기능 점검
### 파일
- `src/app/api/cron/competitor-check/route.ts`

### 현재 동작
코드 존재. 매일 09:00, 21:00 KST 실행 예정. CRON_SECRET 인증.

### 기대 동작
- 등록된 모니터 브랜드별로 신규 광고 감지
- 신규 발견 시 `competitor_alerts` 테이블에 기록
- 로컬에서 curl로 크론 API 호출 테스트 (CRON_SECRET 없이 테스트 가능하게)

### 하지 말 것
- 크론 스케줄 변경 금지

## T5. 디버그 로그 정리
### 파일
- `src/app/api/competitor/search/route.ts`
- `src/lib/competitor/meta-ad-library.ts`

### 현재 동작
환경변수 디버깅용 console.log가 남아있음 (이전 수정에서 추가)

### 기대 동작
- 불필요한 디버그 console.log 제거
- 에러 로그만 유지

### 하지 말 것
- 에러 처리 로직 변경 금지

## 실행 순서
1. T1 (코드리뷰) → 결과 기록
2. T2 (모니터링) → T1에서 발견된 이슈 반영
3. T3 (AI 인사이트) → 동작 확인 + 수정
4. T4 (크론) → 동작 확인
5. T5 (디버그 정리)
6. tsc + lint + build 통과
7. Gap 분석 문서 작성

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
