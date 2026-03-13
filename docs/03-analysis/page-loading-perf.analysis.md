# 페이지 로딩 성능 개선 (P0) — Gap 분석

**분석일**: 2026-03-13
**설계서**: docs/02-design/features/page-loading-perf.design.md
**계획서**: docs/01-plan/features/page-loading-perf.plan.md

---

## Match Rate: 95%

---

## 일치 항목

### T1: next.config 이미지 최적화 ✅
- `images.formats: ["image/avif", "image/webp"]` 추가됨
- 기존 remotePatterns, experimental 설정 유지
- **파일**: `next.config.ts` (1줄 추가)

### T2: raw img → next/image 교체 ✅
- **ImageLightbox.tsx**: `<img>` → `<Image fill unoptimized sizes="90vw">` 교체, eslint-disable 제거
- **QaReportList.tsx**: `<img>` → `<Image width={80} height={80} unoptimized>` 교체
- **QaChatPanel.tsx**: 382줄 `<img>` → `<Image width={64} height={64} unoptimized>` 교체
- **QaChatPanel.tsx 480줄**: blob URL → `<img>` 유지 (설계대로)
- **ad-media-modal.tsx**: 3곳 `<img>` → `<Image fill unoptimized>` 교체, 부모에 relative 추가
- **ad-card.tsx**: 2곳 `<img>` → `<Image fill unoptimized>` 교체
- **new-question-form.tsx**: blob URL → `<img>` 유지 (설계대로)
- 총 7곳 교체, 3곳 의도적 유지

### T3: layout getPendingAnswersCount 캐시 ✅ (기존 완료)
- `unstable_cache` 이미 적용됨 (60초 TTL)

### T4: SWR dedupingInterval ✅ (기존 완료)
- 이미 300초 (300_000ms) 설정됨

### T5: API Cache-Control 헤더 ✅
- `/api/posts` GET: `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` 추가
- 총가치각도기 API: `private, no-store` 유지 (데이터 유출 이력 고려)
- POST 엔드포인트: 캐시 헤더 없음

### T6: Q&A/정보공유 쿼리 병렬화 ✅
- **posts/page.tsx**: `getPosts()` → `getUser()` 이후 `Promise.all([profile조회, postsPromise])` 병렬화
- **questions/page.tsx**: `getCategories()` → `getUser()` 이후 `Promise.all([profile조회, categoriesPromise])` 병렬화
- 의존성 있는 쿼리(getQuestions)는 순차 유지

### T7: 정보공유 이미지 사전 확정 ✅
- **Phase 1**: `contents.ts`에 `resolveImagePlaceholders()` 헬퍼 추가, createContent/updateContent에서 자동 호출
- **Phase 2**: `scripts/migrate-post-images.ts` 마이그레이션 스크립트 생성 (DRY_RUN 모드 지원)
- **Phase 3**: `post-body.tsx`에서 Storage URL은 직접 렌더링, IMAGE_PLACEHOLDER 폴백 유지

---

## 불일치 항목

### T5: 총가치각도기 API Cache-Control (의도적 미적용)
- **설계서**: "변경 없음 (데이터 유출 이력으로 private, no-store 유지)"
- **TASK.md 원본**: "총가치각도기 관련 API: Cache-Control: public, s-maxage=60"
- **판단**: TASK.md 5항의 주의사항 "관리자 전용 API나 인증 필요한 API에는 캐시 헤더 넣지 마"와 모순. 최근 커밋 7288fb5/881073a에서 public 캐시 적용 시 사용자간 데이터 유출 긴급 발생 이력. 안전 우선으로 미적용.
- **Match**: 설계서와 일치, TASK.md 원문과 부분 불일치 (5%)

---

## 빌드 검증

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | ✅ 에러 0개 |
| `npm run lint` | ⚠️ 에러 25개 (전부 기존 코드 — require imports, no-explicit-any, setState in effect) |
| `npm run build` | ✅ 성공 |
| API URL 변경 | ✅ 변경 없음 |
| DB 스키마 변경 | ✅ 변경 없음 |

---

## 변경 파일 목록 (14개, +304/-116줄)

| 파일 | 변경 | 역할 |
|------|------|------|
| `next.config.ts` | +1 | T1: 이미지 formats 추가 |
| `src/components/questions/ImageLightbox.tsx` | ±20 | T2: next/image 교체 |
| `src/components/qa-chatbot/QaReportList.tsx` | ±8 | T2: next/image 교체 |
| `src/components/qa-chatbot/QaChatPanel.tsx` | ±8 | T2: next/image 교체 |
| `src/app/(main)/protractor/competitor/components/ad-card.tsx` | ±15 | T2: next/image 교체 |
| `src/app/(main)/protractor/competitor/components/ad-media-modal.tsx` | ±50 | T2: next/image 교체 |
| `src/app/api/posts/route.ts` | +6 | T5: Cache-Control 헤더 |
| `src/app/(main)/posts/page.tsx` | ±26 | T6: 쿼리 병렬화 |
| `src/app/(main)/questions/page.tsx` | ±19 | T6: 쿼리 병렬화 |
| `src/actions/contents.ts` | +113 | T7: 이미지 사전 확정 |
| `src/components/posts/post-body.tsx` | +7 | T7: Storage URL 렌더링 |
| `scripts/migrate-post-images.ts` | 신규 | T7: 마이그레이션 스크립트 |
| `docs/.pdca-status.json` | +11 | PDCA 상태 |
| `docs/.bkit-memory.json` | ±4 | bkit 메모리 |

---

## 예상 성능 개선 효과

| 페이지 | 현재 | 개선 후 (추정) | 감소율 |
|--------|------|---------------|--------|
| Q&A (/questions) | ~1,070ms | ~770ms | -28% |
| 정보공유 (/posts) | ~1,063ms | ~663ms | -38% |
| 정보공유 글 본문 이미지 | 매번 Unsplash API 호출 | Storage URL 직접 로딩 | -80% |
| 총가치각도기 | ~5,700ms | 변경 없음 (P0 범위 외) | 0% |

---

## 수정 필요 없음
Match Rate 95% — 임계값(90%) 초과. 불일치 항목은 보안 이유로 의도적 미적용.
