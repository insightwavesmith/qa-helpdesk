# 페이지 로딩 성능 개선 P1 — 번들 분할 + SSR 수정

## 타입
개발

## 배경
- P0 성능 개선(5ebc34f) 완료 후에도 QA, 정보공유 페이지 체감 로딩이 느림
- JS 번들 gzip 2.4MB (전체 chunks) — 페이지별 분할이 부족하여 불필요한 코드 로드
- tiptap/prosemirror 에디터 코드 ~1.3MB가 읽기 전용 페이지에도 로드
- Pretendard 외부 CDN(jsDelivr) 의존으로 렌더 블로킹
- 루트 `/` → `/login` 리다이렉트가 서버 컴포넌트 레벨에서 발생 (cold start 낭비)

## 범위

### T1: 번들 분석 + dynamic import 분리
1. `@next/bundle-analyzer` 설치 + 분석
2. `PostDetailClient.tsx`의 InlineEditor(tiptap) → `dynamic()` 분리
3. `admin/knowledge/page.tsx`의 recharts → 별도 컴포넌트로 추출 + `dynamic()` 분리
4. `QaChatButton.tsx`의 QaChatPanel → `dynamic()` 분리 (모든 페이지 공통 레이아웃)
5. **목표: 읽기 전용 페이지(QA, 정보공유)에서 에디터/차트 코드 로드 제거**

### T2: SSR 실패 원인 수정
1. `useSearchParams()` 사용하는 클라이언트 컴포넌트에 Suspense boundary 확인
2. questions/page.tsx, posts/page.tsx — 이미 Suspense 적용됨 ✅
3. posts/[id]/page.tsx — PostDetailClient에 Suspense boundary 필요한지 확인

### T3: Pretendard self-hosting
1. `next/font/local`로 Pretendard Variable 로컬 로드
2. jsDelivr CDN `<link>` 제거 (layout.tsx)
3. font-display: swap 적용

### T4: 리다이렉트 최적화
1. `src/app/page.tsx`의 `/` 리다이렉트 → middleware에서 edge-level 처리
2. 서버 컴포넌트 부팅 + Supabase 클라이언트 생성 비용 제거

## 성공 기준
- [ ] `npm run build` 성공
- [ ] QA/정보공유 페이지에서 tiptap/recharts 청크 미로드 확인
- [ ] Pretendard 로컬 로딩 확인
- [ ] 루트 리다이렉트 middleware 처리 확인
- [ ] 기존 기능 정상 동작

## 의존성
- T1 독립 (가장 임팩트 큼)
- T2 독립
- T3 독립
- T4 독립
- 모두 병렬 작업 가능
