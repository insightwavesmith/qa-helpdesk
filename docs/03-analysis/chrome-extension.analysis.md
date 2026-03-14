# 크롬 확장프로그램 Gap 분석

## Match Rate: 92%

## 일치 항목 (22/24)

### T1: 크롬 확장 기본 구조 ✅
- [x] `extension/manifest.json` — Manifest V3 ✅
- [x] 호스트 퍼미션: blog.naver.com, m.blog.naver.com, section.blog.naver.com, cafe.naver.com ✅
- [x] `extension/src/background/service-worker.ts` — 메시지 핸들러 (GET_AUTH, SET_AUTH, LOGOUT, CHECK_EDITOR) ✅
- [x] `extension/src/popup/` — 로그인/설정 UI (App.tsx, popup.css) ✅
- [x] `extension/src/content/` — content script ✅
- [x] `extension/src/lib/api.ts` — bscamp API 통신 유틸 ✅

### T2: SmartEditor 글 주입 ✅
- [x] URL 패턴 감지 (postwrite, Redirect=Write, PostWriteForm, WriterForm) ✅
- [x] SmartEditor 본문 영역 주입 (제목 + 본문) ✅
- [x] iframe 접근 시 chrome.debugger API 사용 ✅
- [x] window.postMessage 수신 리스너 ✅

### T3: 실시간 진단 사이드패널 ✅
- [x] 에디터 우측 고정 패널 (#bscamp-ext-root) ✅
- [x] 글자수 카운트 (2000자 이상 권장) ✅
- [x] 이미지 개수 (8장 전후 권장) ✅
- [x] 키워드 반복 횟수 ✅
- [x] 문단 길이 분석 ✅
- [x] 금칙어 실시간 체크 (/api/ext/forbidden-check) ✅
- [x] 비속어 체크 (/api/ext/profanity-check) ✅
- [x] 색상 코드: 🟢 양호, 🟡 개선 필요, 🔴 위험 ✅

### T4: TOP3 벤치마크 비교 ✅
- [x] 키워드 입력 → /api/ext/blog-benchmark 호출 ✅
- [x] TOP3 평균값 표시 + 비교 차트 (Bar) ✅
- [x] "이 키워드 1등 되려면 부족한 거" 자동 안내 ✅

### T5: 카페 발행 ✅
- [x] 카페 에디터 감지 (cafe.naver.com) ✅
- [x] 짧은 요약 + 블로그 링크 삽입 ✅
- [ ] 카페 게시판 선택 지원 ❌ (미구현 — 카페 게시판 목록 API 없음)

### T6: 오가닉 벤치마크 크론 ✅
- [x] `src/app/api/cron/organic-benchmark/route.ts` 생성 ✅
- [x] vercel.json crons에 추가 (매주 월요일 03:00 KST) ✅
- [ ] keyword_stats 또는 seo_benchmarks 테이블 저장 ❌ (로그만 출력, DB 테이블 미생성)

## 불일치 항목 (2/24)

1. **T5 카페 게시판 선택** — 카페 게시판 목록을 가져오는 API가 없어서 미구현. 네이버 카페는 게시판 선택이 에디터 UI에 이미 포함되어 있으므로 사용자가 직접 선택 가능.

2. **T6 DB 저장** — 벤치마크 결과를 DB에 저장하려면 Supabase 테이블 마이그레이션 필요. 현재는 콘솔 로그만 출력. Phase 2에서 테이블 생성 + 저장 로직 추가 예정.

## 빌드 검증
- [x] `npm run build` (bscamp 본체) — 성공 ✅
- [x] `npx tsc --noEmit` — 에러 0개 ✅
- [x] `cd extension && npm run build` — 성공 ✅
- [x] `extension/dist/`에 로드 가능한 크롬 확장 생성 ✅

## 파일 목록

### 신규 생성 (서버 측: 9파일)
- `src/app/api/ext/_shared.ts` — 확장 인증 헬퍼
- `src/app/api/ext/_cors.ts` — CORS 헬퍼
- `src/app/api/ext/auth/route.ts` — 로그인 API
- `src/app/api/ext/forbidden-check/route.ts` — 금칙어 체크
- `src/app/api/ext/profanity-check/route.ts` — 비속어 체크
- `src/app/api/ext/post-diagnosis/route.ts` — 포스팅 진단
- `src/app/api/ext/keyword-analysis/route.ts` — 키워드 분석
- `src/app/api/ext/blog-benchmark/route.ts` — 블로그 벤치마크
- `src/app/api/cron/organic-benchmark/route.ts` — 벤치마크 크론

### 신규 생성 (확장: 20+파일)
- `extension/` 폴더 전체 (package.json, tsconfig.json, vite.config.ts, manifest.json)
- `extension/src/popup/` — 팝업 UI (4파일)
- `extension/src/content/` — 콘텐츠 스크립트 (6파일)
- `extension/src/background/` — 서비스 워커 (1파일)
- `extension/src/lib/` — 유틸 (5파일)

### 수정 (2파일)
- `vercel.json` — 크론 1개 추가
- `tsconfig.json` — extension 폴더 exclude 추가
