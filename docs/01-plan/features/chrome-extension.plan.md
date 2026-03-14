# 크롬 확장프로그램 — 네이버 블로그/카페 발행 + 실시간 진단

## 1. 개요
네이버 블로그/카페 발행을 자동화하고, SmartEditor에서 실시간 SEO 진단을 제공하는 크롬 확장프로그램.

## 2. 배경
- 수강생들이 블로그 글을 작성할 때 SEO 기준에 맞는지 확인하기 어려움
- 금칙어, 비속어, 키워드 밀도 등을 수동으로 확인하는 비효율
- bscamp 서버에 이미 관련 API 구현됨 (forbidden-check, keyword-analysis, blog-benchmark, post-diagnosis)
- 카페에 블로그 요약을 자동 발행하여 트래픽 유도 필요

## 3. 범위

### In-Scope (6 Tasks)
| Task | 기능 | 우선순위 |
|------|------|----------|
| T1 | 크롬 확장 기본 구조 (Manifest V3, popup, content script, service worker) | P0 |
| T2 | SmartEditor 글 주입 (제목/본문/이미지) | P1 |
| T3 | 실시간 진단 사이드패널 (글자수, 이미지, 키워드, 금칙어, 비속어) | P0 |
| T4 | TOP3 벤치마크 비교 (현재 글 vs 상위 블로그 평균) | P1 |
| T5 | 카페 발행 (요약 + 블로그 링크) | P2 |
| T6 | 오가닉 벤치마크 크론 (주 1회 자동 크롤링) | P2 |

### Out-of-Scope
- Chrome Web Store 배포 (개발자 모드 로드만)
- 모바일 네이버 앱 지원
- 자동 발행 스케줄링

## 4. 기술 결정

### 4.1 확장 프로젝트 구조
- `extension/` 폴더에 독립 프로젝트
- Manifest V3
- Vite + React 18 + TypeScript로 빌드
- Content Script: 네이버 에디터 페이지에 진단 패널 삽입
- Popup: 로그인/설정 UI
- Service Worker: 백그라운드 메시지 처리

### 4.2 인증 방식
- 기존 API는 `requireAdmin()` (Supabase 세션 기반)
- 확장용 API 엔드포인트 신규 생성: `/api/ext/` 하위
  - API Key 기반 인증 (간단한 Bearer 토큰)
  - 또는 bscamp 로그인 후 세션 쿠키 공유
- **결정**: 확장 popup에서 bscamp 로그인 → 세션 토큰 저장 → API 호출 시 Authorization 헤더 전송

### 4.3 기존 API 활용
- 기존 `/api/admin/*` 경로를 확장에서 직접 호출하지 않음
- 확장 전용 `/api/ext/*` 래퍼 생성하여 인증 로직 분리
- 핵심 로직(lib/)은 그대로 재사용

### 4.4 빌드 분리
- bscamp 본체 빌드(`npm run build`)와 확장 빌드 독립
- 확장 빌드: `cd extension && npm run build` → `extension/dist/` 생성
- 본체 빌드에 영향 없음 (tsconfig exclude)

## 5. 성공 기준
1. `npm run build` 성공 (bscamp 본체)
2. `extension/dist/`에 로드 가능한 크롬 확장 생성
3. chrome://extensions에서 개발자 모드로 로드 테스트 가능
4. SmartEditor 페이지에서 진단 패널 표시
5. 실시간 글자수/이미지/키워드 분석 동작
6. TOP3 벤치마크 비교 차트 표시
7. 크론 등록 + vercel.json 업데이트

## 6. 의존성
- 기존 lib: naver-forbidden.ts, naver-keyword.ts, naver-blog-scraper.ts, post-diagnosis.ts, profanity-db.ts
- 기존 API: /api/admin/forbidden-check, keyword-analysis, blog-benchmark, post-diagnosis
- Supabase 인증

## 7. 리스크
- SmartEditor iframe 접근 제한 → chrome.debugger API 또는 MutationObserver로 우회
- 네이버 에디터 DOM 구조 변경 가능성 → 선택자 추상화 필요
- API 호출 빈도 제한 → 디바운스/스로틀 적용
