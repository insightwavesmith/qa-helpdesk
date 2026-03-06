# 경쟁사 분석기 Gap 분석

## Match Rate: 95%

---

## 일치 항목

### T1: 경쟁사 광고 검색 (100%)
- [x] `src/types/competitor.ts` — 타입 정의 (MetaAdRaw, CompetitorAd, CompetitorSearchResponse, CompetitorMonitor, CompetitorInsight, CompetitorErrorCode)
- [x] `src/lib/competitor/meta-ad-library.ts` — Meta API 클라이언트 (토큰 optional, 빌드 안전)
- [x] `src/app/api/competitor/search/route.ts` — 검색 API Route (GET, 파라미터 q/country/active_only/min_days/platform/limit)
- [x] `src/app/(main)/protractor/protractor-tab-nav.tsx` — 탭 네비게이션 (대시보드/경쟁사 분석)
- [x] `src/app/(main)/protractor/layout.tsx` — ProtractorTabNav 통합
- [x] `src/app/(main)/protractor/competitor/page.tsx` — 서버 컴포넌트 (인증 체크)
- [x] `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — 메인 클라이언트 컴포넌트
- [x] `src/app/(main)/protractor/competitor/components/search-bar.tsx` — 검색바 + 히스토리 (localStorage)
- [x] `src/app/(main)/protractor/competitor/components/filter-chips.tsx` — 필터 칩 (30일+/게재중/Facebook/Instagram)
- [x] `src/app/(main)/protractor/competitor/components/ad-card.tsx` — 광고 카드 (소재 썸네일/브랜드명/문구/운영기간바/플랫폼아이콘/CTA)
- [x] `src/app/(main)/protractor/competitor/components/ad-card-list.tsx` — 광고 카드 리스트 + 그리드
- [x] `src/app/(main)/protractor/competitor/components/duration-bar.tsx` — 운영기간 바 (30일+ 빨강, 미만 회색)
- [x] 에러 처리: TOKEN_MISSING(503), INVALID_QUERY(400), META_API_ERROR(502), RATE_LIMITED(429)
- [x] bscamp 디자인 시스템: Primary #F75D5D, Pretendard, rounded-xl, 라이트모드
- [x] META_AD_LIBRARY_TOKEN 없이 빌드 성공 확인

### T2: 브랜드 모니터링 (95%)
- [x] `src/app/api/competitor/monitors/route.ts` — GET (목록 + unreadAlertCount), POST (등록, 10개 제한)
- [x] `src/app/api/competitor/monitors/[id]/route.ts` — DELETE (본인 소유 확인)
- [x] `src/app/api/competitor/monitors/[id]/alerts/route.ts` — PATCH (읽음 처리)
- [x] `src/app/api/cron/competitor-check/route.ts` — Cron (CRON_SECRET 인증, rate limit 대응)
- [x] `src/app/(main)/protractor/competitor/components/monitor-panel.tsx` — 접이식 모니터링 패널
- [x] `src/app/(main)/protractor/competitor/components/monitor-brand-card.tsx` — 브랜드 카드 + 알림 뱃지
- [x] `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx` — 등록 다이얼로그
- [x] DB 마이그레이션 SQL: competitor_monitors + competitor_alerts + RLS
- [ ] DB 실제 적용 (마이그레이션 SQL만 작성, 실행은 별도)

### T3: AI 인사이트 (90%)
- [x] `src/lib/competitor/analyze-ads.ts` — AI 분석 로직 (ai-proxy 우선 + Anthropic 직접 폴백)
- [x] `src/app/api/competitor/insights/route.ts` — POST (24h 캐시 + AI 분석)
- [x] `src/app/(main)/protractor/competitor/components/insight-section.tsx` — 인사이트 섹션 (분석 전/로딩/결과)
- [x] `src/app/(main)/protractor/competitor/components/insight-stat-card.tsx` — 통계 카드 (gradient 배경)
- [x] `src/app/(main)/protractor/competitor/components/hook-type-chart.tsx` — 훅 유형 분포 차트
- [x] `src/app/(main)/protractor/competitor/components/season-chart.tsx` — 월별 시즌 패턴 차트
- [x] DB 마이그레이션 SQL: competitor_insight_cache
- [ ] 실제 AI 분석 동작 검증 (API 키 없이 빌드만 검증)

---

## 불일치 항목

1. **DB 마이그레이션 미적용**: SQL 파일만 작성. Supabase에 실제 테이블 생성은 별도 실행 필요.
2. **반응형 레이아웃**: 설계서의 3단계(Desktop/Tablet/Mobile) 중 모니터링 "하단 시트" 모바일 UI 미구현 (기본 접이식으로 대체).
3. **Vercel Cron 설정**: `vercel.json`에 cron 스케줄 미등록 (배포 환경 설정 필요).

---

## 수정 필요

- DB 마이그레이션 실제 적용 (Supabase 대시보드 또는 CLI)
- `database.ts` 타입 재생성 후 `as any` 제거
- Vercel cron 설정 추가

---

## 빌드 검증

- [x] `npx tsc --noEmit` — 타입 에러 0개 (신규 코드)
- [x] `npm run lint` — 신규 코드 에러 0개
- [x] `npm run build` — 빌드 성공
- [x] META_AD_LIBRARY_TOKEN 없이 빌드 성공 확인
