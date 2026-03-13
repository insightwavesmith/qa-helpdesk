# 오가닉 채널 관리 — Phase 1 (MVP) Plan

## 1. 개요
bscamp 관리자 사이드바에 "오가닉 채널" 독립 메뉴를 추가한다.
Phase 1은 네이버 블로그 + 카페 발행 관리 + 기본 UI.

## 2. 배경/맥락
- Smith님 결정(2026-03-13): RAG 제외, 친근 전문가 톤, 블로그+카페, 수동 첨삭, 관리자만 접근
- 기존 콘텐츠 관리(`/admin/content`)와 독립 메뉴로 분리 (방법 A 채택)
- 기존 `contents` 테이블과 별도 `organic_posts` 테이블 사용 (RAG 임베딩 제외)

## 3. 범위

### In-Scope (Phase 1)
1. DB: `organic_posts`, `organic_analytics`, `keyword_stats`, `keyword_rankings`, `seo_benchmarks`, `organic_conversions` 6개 테이블 (Supabase SQL)
2. 사이드바: `app-sidebar.tsx`에 "오가닉 채널" 메뉴 추가
3. 페이지: `/admin/organic` 메인 (탭 허브) + `/admin/organic/[id]` 상세/편집
4. 탭 3개: 대시보드, 발행 관리, 키워드
5. Server Actions: `src/actions/organic.ts` 신규
6. 타입: `src/types/organic.ts` 신규

### Out-of-Scope
- RAG 임베딩 연동
- 수강생 접근 라우트
- style-learner 연동
- SmartEditor 자동 발행 (Phase 4)
- 유튜브/인스타/틱톡 (Phase 3)

## 4. 성공 기준
- [ ] `/admin/organic` 페이지 로드 + 탭 전환 정상
- [ ] 글 CRUD (생성/조회/수정/발행) 동작
- [ ] 키워드 목록 조회 동작
- [ ] 대시보드 통계 카드 표시
- [ ] 카페 글 = 블로그 원본 요약 (parent_post_id 연결)
- [ ] 관리자만 접근 (RLS 정책)
- [ ] `npm run build` 성공

## 5. 의존성
- Supabase DB 마이그레이션 (수동 실행 필요)
- shadcn/ui 컴포넌트 (이미 설치됨)
- MDXEditor (마크다운 편집, 이미 설치됨)

## 6. 파일 경계 (팀원 배정)

### backend-dev
- `src/types/organic.ts` (신규)
- `src/actions/organic.ts` (신규)
- `supabase/migrations/organic-channel.sql` (신규 — 참조용)

### frontend-dev
- `src/components/layout/app-sidebar.tsx` (1줄 추가)
- `src/app/(main)/admin/organic/page.tsx` (신규)
- `src/app/(main)/admin/organic/[id]/page.tsx` (신규)
- `src/components/organic/` (신규 디렉토리)
  - `organic-dashboard.tsx`
  - `organic-posts-tab.tsx`
  - `organic-keywords-tab.tsx`
  - `organic-post-editor.tsx`

### qa-engineer
- `docs/03-analysis/organic-channel.analysis.md`
- 빌드 검증
