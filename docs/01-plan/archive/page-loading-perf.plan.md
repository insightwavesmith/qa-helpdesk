# 페이지 로딩 성능 개선 (P0) — 계획서

## 타입
개발

## 배경
- 수강생 43명 실사용 중, 탭 전환 시 1~5초 대기 → UX 문제
- Q&A/정보공유 이미지 로딩 느림, 순차 쿼리로 불필요한 대기 발생
- 성능 분석 결과(`docs/performance-analysis.md`) P0 항목 구현

## 범위

### T1: next.config 이미지 최적화
- `images.formats: ["image/avif", "image/webp"]` 추가
- Supabase Storage remotePatterns 확인 (이미 있음 ✅)
- **파일**: `next.config.ts`

### T2: raw img → next/image 교체 (사용자 대면 우선)
- Q&A 답변 이미지 관련 컴포넌트 (ImageLightbox, ImageGallery 일부)
- QA 챗봇 이미지 (QaReportList, QaChatPanel)
- 질문 작성 폼 이미지 (new-question-form.tsx)
- 경쟁사 광고 이미지 (ad-card.tsx, ad-media-modal.tsx)
- **주의**: post-body.tsx는 dangerouslySetInnerHTML 사용 → T7에서 별도 처리
- **주의**: blob URL 미리보기는 next/image로 변환 불가 → 유지

### ~~T3: layout 중복 쿼리 제거~~ → 이미 완료 ✅
- `getCachedPendingAnswersCount()` unstable_cache 적용됨 (60초 TTL)

### ~~T4: SWR dedupingInterval 증대~~ → 이미 완료 ✅
- 이미 300초 (300_000ms) 설정됨

### T5: API Cache-Control 헤더 추가
- ⚠️ **총가치각도기 API**: 커밋 7288fb5/881073a에서 public 캐시로 인한 **사용자간 데이터 유출** 발생 → 긴급 제거한 이력. 모든 protractor API가 인증 필요 → public 캐시 재적용 불가. `private, no-store` 유지.
- `/api/posts` GET: 비인증 API → `Cache-Control: public, s-maxage=30, stale-while-revalidate=120` 적용 가능
- Q&A: Server Action 사용 (API route 없음) → Cache-Control 헤더 불가

### T6: Q&A/정보공유 쿼리 병렬화
- `/questions` 페이지: auth+profile ↔ getCategories() 병렬화 가능
- `/posts` 페이지: auth+profile ↔ getPosts() 병렬화 가능 (getPosts는 userId 불필요)
- **주의**: 의존성 있는 쿼리 순서 유지

### T7: 정보공유 이미지 사전 확정 (Unsplash → Supabase Storage)
- 글 생성/수정 시점에 Unsplash 이미지 → Supabase Storage 업로드 → 본문 img src 교체
- 기존 글: 마이그레이션 스크립트로 일괄 변환
- post-body.tsx 클라이언트 Unsplash 호출 로직 제거
- **주의**: 기존 글 본문 텍스트 절대 변경 금지, 이미지 src만 교체

## 성공 기준
- [ ] `tsc --noEmit` 통과
- [ ] `npm run build` 성공
- [ ] 기존 페이지 전부 정상 동작
- [ ] 기존 API 엔드포인트 URL 변경 없음
- [ ] 이미지 정상 표시
- [ ] Q&A/정보공유 페이지 로딩 시간 개선 확인

## 의존성
- T1 → T2 (이미지 최적화 설정 먼저)
- T6 독립 (병렬 작업 가능)
- T7 독립 (가장 큰 항목, 별도 진행)
