# 오가닉 Phase 2 — 콘텐츠 분석 엔진 Plan

## 1. 개요
blai.co.kr이 제공하는 키워드 분석/포스팅 진단 기능을 bscamp 자체 구현한다.
네이버 검색광고 API + 블로그 섹션 검색 API를 활용하여 6가지 분석 도구를 신규 파일로 추가.

## 2. 배경/맥락
- Phase 1(오가닉 채널 MVP)은 완료 상태 (Match Rate 95%)
- 네이버 검색광고 API 키 발급 완료 (환경변수 설정됨)
- blai 역분석 결과를 기반으로 형태소 분석 없이 구현 가능한 6개 진단 항목 선정
- Python 의존성 없이 TypeScript/Node.js로만 구현
- 기존 코드 수정 최소화 (organic-keywords-tab.tsx만 수정 허용)

## 3. 범위

### In-Scope (Phase 2)
1. 네이버 금칙어 실시간 체크 API (lib + route)
2. 키워드 분석 API + UI (네이버 검색광고 API 래퍼 + 포화도 계산)
3. 비속어/금칙어 DB (300+ 단어, 6개 카테고리, 정규식 매칭)
4. 포스팅 진단 엔진 (6항목 진단 + UI)
5. TOP 3 블로그 벤치마킹 (크롤링 + 평균값)
6. 키워드 분석 탭 통합 (기존 탭에 3개 섹션 추가)

### Out-of-Scope
- 형태소 분석 기반 진단 (문장 유사도, 품사 분석)
- DB 테이블 추가/변경
- Python/외부 NLP 라이브러리
- SmartEditor 자동 발행

## 4. 성공 기준
- [ ] `npm run build` 성공
- [ ] 금칙어 체크 API: 키워드 10개 배치 체크 동작
- [ ] 키워드 분석: 검색량/경쟁도/포화도 표시
- [ ] 비속어 DB: 300+ 단어, 6개 카테고리
- [ ] 포스팅 진단: 6항목 점수 + UI 표시
- [ ] TOP 3 벤치마킹: 크롤링 + 평균값 반환

## 5. 의존성
- 환경변수: NAVER_AD_CUSTOMER_ID, NAVER_AD_ACCESS_LICENSE, NAVER_AD_SECRET_KEY
- 네이버 블로그 섹션 검색 API (비인증, rate limit 주의)
- 네이버 검색광고 API (HMAC-SHA256 인증)
- 기존 organic UI 컴포넌트 (Phase 1에서 생성됨)

## 6. 제약사항
- Python 의존성 절대 금지
- 기존 파일 최소 수정 — organic-keywords-tab.tsx만 허용
- DB 변경 없음
- 환경변수 없으면 graceful fallback (빈 결과 반환, 에러 안 남)
- 네이버 크롤링 시 User-Agent 설정 + 딜레이
- Task별 별도 커밋

## 7. 파일 경계 (팀원 배정)

### backend-dev
- `src/lib/naver-forbidden.ts` (신규)
- `src/lib/naver-keyword.ts` (신규)
- `src/lib/profanity-db.ts` (신규)
- `src/lib/post-diagnosis.ts` (신규)
- `src/lib/naver-blog-scraper.ts` (신규)
- `src/app/api/admin/forbidden-check/route.ts` (신규)
- `src/app/api/admin/keyword-analysis/route.ts` (신규)
- `src/app/api/admin/post-diagnosis/route.ts` (신규)
- `src/app/api/admin/blog-benchmark/route.ts` (신규)

### frontend-dev
- `src/components/organic/keyword-analysis-panel.tsx` (신규)
- `src/components/organic/post-diagnosis-panel.tsx` (신규)
- `src/components/organic/organic-keywords-tab.tsx` (수정 — 3개 섹션 추가)

### qa-engineer
- `docs/03-analysis/organic-content-analysis.analysis.md`
- 빌드 검증 (tsc + lint + build)

## 8. 구현 순서
1. T1: 금칙어 체크 lib + route (backend-dev)
2. T3: 비속어 DB (backend-dev) — T4 의존
3. T2: 키워드 분석 lib + route (backend-dev)
4. T5: 블로그 벤치마킹 lib + route (backend-dev)
5. T4: 포스팅 진단 엔진 lib + route (backend-dev, T3 의존)
6. T2-UI: 키워드 분석 패널 (frontend-dev, T2 API 의존)
7. T4-UI: 포스팅 진단 패널 (frontend-dev, T4 API 의존)
8. T6: 키워드 탭 통합 (frontend-dev, T2-UI 의존)
