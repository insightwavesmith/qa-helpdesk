# 전체 탭 전환 속도 개선 설계서

## 1. T1: next/link prefetch
- **현상**: app-sidebar.tsx의 Link에 prefetch 명시 없음 (Next.js 15 기본값: viewport 진입 시 prefetch)
- **변경**: 현재 기본값이 이미 prefetch={true}이므로 동작 확인만. 변경 불필요.

## 2. T2: Router Cache (staleTimes)
- **현상**: Next.js 15 기본 staleTimes.dynamic = 0 → 방문한 페이지도 매번 서버 요청
- **변경**: next.config.ts에 `staleTimes: { dynamic: 30 }` 추가
- **효과**: 30초 내 재방문 시 캐시에서 즉시 표시

## 3. T3: 이미지 최적화
- **현상**: PostCard의 Thumbnail에 sizes 속성 없음 → 640px 원본 그대로 로드
- **변경**: sizes 속성 추가, priority 속성 추가 (featured 카드)
- **대상 파일**: src/components/posts/post-card.tsx

## 4. T4: loading.tsx 추가
- **현상**: /questions, /posts에 loading.tsx 없음 → 전환 시 빈 화면
- **추가 파일**:
  - src/app/(main)/questions/loading.tsx
  - src/app/(main)/posts/loading.tsx

## 5. 구현 순서
1. [x] next.config.ts — staleTimes 추가
2. [x] post-card.tsx — sizes, priority 속성
3. [x] questions/loading.tsx 생성
4. [x] posts/loading.tsx 생성
5. [x] 빌드 검증
