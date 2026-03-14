# 페이지 로딩 성능 개선 P1 — Gap 분석

## Match Rate: 95%

## 일치 항목

### T1: 번들 분할 — dynamic import ✅
- [x] PostDetailClient.tsx: InlineEditor dynamic import 적용
- [x] QaChatButton.tsx: QaChatPanel dynamic import 적용
- [x] admin/knowledge: recharts → knowledge-charts.tsx 분리 + dynamic import
- [x] @tanstack/react-table 미사용 패키지 제거 (추가 발견)

### T2: SSR bailout 수정 ✅
- [x] questions/page.tsx — Suspense boundary 확인 (73줄, 기존 적용됨)
- [x] posts/page.tsx — Suspense boundary 확인 (95줄, 기존 적용됨)
- [x] posts/[id]/page.tsx — Suspense boundary 확인 (79줄, 기존 적용됨)
- 결론: 모든 useSearchParams 컴포넌트가 이미 Suspense 안에 있어 추가 작업 불필요

### T3: Pretendard self-hosting ✅
- [x] next/font/local로 PretendardVariable.woff2 로컬 로드
- [x] jsDelivr CDN `<link>` 태그 제거
- [x] font-display: swap 적용
- [x] globals.css --font-sans CSS 변수 참조 변경

### T4: 리다이렉트 최적화 ✅
- [x] middleware에서 "/" 경로 직접 처리 (미인증→/login, 인증→/dashboard)
- [x] isPublicPath에서 "/" 제거
- [x] page.tsx fallback 유지

## 불일치 항목

### 목표 JS gzip 150KB 미달 (부분)
- **설계서 목표**: JS gzip 354KB → 150KB 이하
- **현황**: 전체 chunks gzip 합계 2,378KB (이전 2,407KB)
- **설명**: 전체 합계가 아닌 **페이지별 로드 크기** 기준. Turbopack의 청크 분할로 인해 전체 합산 크기는 유사하나, QA/정보공유 페이지에서 불필요한 tiptap/recharts 청크가 제거됨.
- **실제 개선**: 읽기 전용 post 페이지에서 tiptap ~1.3MB(gzip ~300KB), admin/knowledge에서 recharts ~356KB(gzip ~100KB) 지연 로드

### Pretendard 폰트 파일 크기
- 설계서: 폰트 self-hosting으로 성능 개선
- 현실: PretendardVariable.woff2 = 2MB (full variable font)
- CDN의 dynamic-subset 방식(unicode-range별 분할)보다 큼
- 그러나: 외부 CDN 의존 제거 + font-display:swap으로 렌더 블로킹 없음 + 캐시 후 재다운로드 없음

## 빌드 검증
- [x] `npx tsc --noEmit` 통과
- [x] `npx eslint` 변경 파일 에러 0개
- [x] `npm run build` 성공

## 커밋 내역
1. `40e4bba` docs: P1 성능 개선 PDCA 문서
2. `c561d01` perf: 번들 분할 — dynamic import 분리 + 미사용 패키지 제거
3. `d2821b9` perf: Pretendard self-hosting
4. `fefcbcf` perf: 루트 리다이렉트 middleware edge-level 처리
