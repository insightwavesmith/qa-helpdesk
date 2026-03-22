# TASK: 페이지 로딩 성능 개선 (P0 항목)

## What
bscamp 각 탭 전환 시 로딩 속도 개선. 분석 결과(`docs/performance-analysis.md`)의 P0 항목 구현.

## Why
- 수강생 43명 실사용 중. 탭 전환 느리면 UX 나빠짐
- Q&A/정보공유 이미지 로딩 특히 느림
- 현재 순차 쿼리가 많아서 불필요한 대기 발생

## ⚠️ 절대 규칙
- **기존 API 엔드포인트 URL/파라미터/응답 구조 변경 금지**
- **현재 서비스 동작에 문제 생기면 안 됨**
- **DB 스키마 변경 금지**
- **기존 기능 제거하거나 동작 바꾸지 마**
- 성능 개선만. 기능 변경 X

## 구현 항목

### 1. next.config 이미지 최적화
- `next.config.ts`에 `images.formats: ["image/avif", "image/webp"]` 추가
- `images.remotePatterns`에 Supabase Storage 도메인 있는지 확인, 없으면 추가
- 파일: `next.config.ts`

### 2. raw img → next/image 교체
- `docs/performance-analysis.md` 섹션 6에 나열된 raw img 11곳 중 사용자 대면 페이지 우선 교체
- Q&A 답변 이미지, 정보공유 이미지, 답변 검토 이미지
- width/height 또는 fill 속성 + sizes 명시
- lazy loading 기본 적용 (priority는 above-the-fold만)
- 파일: 해당 컴포넌트 파일들

### 3. layout 중복 쿼리 제거
- `(main)/layout.tsx`에서 매번 실행되는 getPendingAnswersCount() → unstable_cache 또는 revalidateTag 적용 (60초 TTL)
- auth/profile 중복 호출 → layout에서 1번만 호출하고 context로 전달하거나, 이미 있는 패턴 활용
- 파일: `src/app/(main)/layout.tsx`

### 4. SWR dedupingInterval 증대
- 현재 60초 → 300초로 변경
- 파일: `src/lib/swr/config.ts` (또는 SWR 설정 파일)

### 5. API Cache-Control 헤더 추가
- 총가치각도기 관련 API: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`
- 정보공유/Q&A 목록 API: `Cache-Control: public, s-maxage=30, stale-while-revalidate=120`
- **주의**: 관리자 전용 API나 인증 필요한 API에는 캐시 헤더 넣지 마
- 파일: 해당 API route 파일들

### 6. Q&A/정보공유 쿼리 병렬화
- `/questions` 페이지: 순차 4단계 → Promise.all로 병렬화 가능한 것 묶기
- `/posts` 페이지: 순차 3단계 → 2단계로
- **주의**: 의존성 있는 쿼리(앞 결과 필요한 것)는 순서 유지

## Validation
- [ ] `tsc --noEmit` 통과
- [ ] 기존 페이지 전부 정상 동작 (Q&A, 정보공유, 대시보드, 총가치각도기, 관리자 페이지)
- [ ] 기존 API 엔드포인트 URL 변경 없음
- [ ] 이미지가 정상적으로 표시됨
- [ ] 빌드 성공

### 7. 정보공유 이미지 사전 확정
- 현재: 글 본문에 `[이미지: 키워드]` 마크업 → 클라이언트에서 매번 Unsplash API 호출 → 느림
- 변경: 글 생성/수정 시점에 이미지 검색 → Supabase Storage에 업로드 → 본문의 img src를 Storage URL로 교체
- 기존 정보공유 글: 마이그레이션 스크립트로 일괄 변경 (Unsplash에서 이미지 받아서 Storage 저장 → 본문 업데이트)
- `post-body.tsx`의 클라이언트 Unsplash 호출 로직 제거
- `/api/unsplash/search` 엔드포인트는 글 생성 시 서버에서만 사용하도록 변경
- **주의**: 기존 글 본문 내용(텍스트)은 절대 변경하지 마. 이미지 src만 교체

## 하지 말 것
- API 엔드포인트 URL이나 응답 구조 변경 금지
- DB 스키마/마이그레이션 금지
- 기존 기능 제거 금지
- 새 패키지 추가 금지 (next/image는 내장)
- Vercel 리전은 이미 변경 완료 — 건드리지 마
