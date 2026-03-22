# TASK: 성능 개선 P0+P1 — 즉시+단기 적용

---

## 빌드/테스트
- `npm run build` 성공 필수
- 기존 기능 깨지지 않아야 함

## 참고
- `docs/performance-analysis.md` 보고서 기반으로 진행
- 코드 수정만. DB 테이블 추가/변경 없음.

---

## P0 — 즉시 적용 (설정값 수준)

### T1. SWR dedupingInterval 60초 → 300초
- 파일: `src/lib/swr/config.ts` 또는 SWR Provider 설정
- 60초 → 300초로 변경
- keepPreviousData: true 유지

### T2. HTTP Cache-Control 헤더 추가
- 파일: Protractor API 라우트들 (`/api/protractor/accounts`, `/api/protractor/insights`, `/api/sales-summary`)
- 응답에 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` 헤더 추가
- Vercel CDN이 캐시하게 됨

### T3. Layout getPendingAnswersCount 캐시
- 파일: `src/app/(main)/layout.tsx`
- `unstable_cache()` 또는 적절한 캐시 방식으로 60초 TTL
- 미답변 수가 분 단위로 바뀌지 않으므로 안전

### T4. insights API 컬럼 최소화
- 파일: `/api/protractor/insights/route.ts`
- 프론트에서 실제 사용하는 컬럼만 SELECT
- 기본 LIMIT을 합리적 수준으로 조정

---

## P1 — 단기 적용

### T5. Protractor accounts Server props 전달
- 파일: `src/app/(main)/protractor/page.tsx`, RealDashboard 컴포넌트
- page.tsx(Server)에서 이미 ad_accounts 조회하고 있음 → 이걸 Client 컴포넌트에 props/fallbackData로 전달
- SWR에서 accounts API를 다시 호출하지 않도록

### T6. Overlap CONCURRENCY 증대 + adset 제한
- 파일: `/api/protractor/overlap/route.ts`, `src/lib/protractor/overlap-utils.ts`
- CONCURRENCY 5 → 10
- 상위 adset 8개 → 6개로 축소 (C(6,2)=15조합, 기존 28조합 대비 46% 감소)
- Meta API rate limit(100req/분) 초과하지 않도록 주의

### T7. loading.tsx 추가 (체감 속도)
- 대상: /protractor, /dashboard, /reviews (현재 없는 곳)
- Skeleton UI로 즉시 시각적 피드백
- 기존 /questions, /posts의 인라인 loading 참고

### T8. Next.js optimizePackageImports 설정
- 파일: `next.config.ts`
- ```typescript
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@tiptap/react']
  }
  ```
- 번들 크기 10~20% 감소

---

## 검증 기준
- `npm run build` 성공
- 모든 페이지 정상 렌더링 (깨지는 UI 없음)
- 커밋+푸시

## 하지 말 것
- DB 테이블 추가/변경 금지 (P2 범위)
- UI/디자인 변경 금지 (loading.tsx 제외)
- 새로운 npm 패키지 추가 금지
