# TASK: 정보공유 페이지 UI/UX 개선 (PC 중심, mfitlab 레퍼런스)

## 목표
PC에서 정보공유 페이지를 mfitlab 블로그(https://www.mfitlab.com/solutions/blog) 수준의 UI/UX로 개선. 수강생이 "와 이거 읽어야지" 하고 느끼는 경험 설계.

## 현재 문제 (모찌가 브라우저에서 직접 확인)
1. 모든 카드가 동일한 크기 — 콘텐츠 위계가 없음
2. coral gradient 가짜 썸네일 — 시각적 매력 부족 (OG 이미지 엔드포인트 사용 중)
3. 섹션 구분 없이 평면적 나열
4. PC에서 여백/타이포그래피가 투박
5. "뭘 먼저 봐야 하지?" — 수강생 관점 동선 부재

## mfitlab 레퍼런스 핵심 (직접 확인)
1. **섹션 구분**: 베스트 컨텐츠 → 카테고리별 섹션 → 뉴스레터 CTA → 최신글
2. **히어로 영역**: 베스트 콘텐츠 1개를 크게 (좌: 이미지, 우: 텍스트)
3. **카테고리별 섹션**: 각 카테고리(교육, 소식 등)가 독립 섹션으로 분리
4. **"더 살펴보기" 버튼**: 각 섹션 하단에 더보기 CTA
5. **뉴스레터 CTA 배너**: 중간에 삽입 (이메일 입력 + 구독 버튼)
6. **깔끔한 타이포**: max-width 제한, 넉넉한 여백, 명확한 제목 위계
7. **카드 스타일**: 흰 배경, 얇은 border, 제목 bold, 설명 gray, 날짜 하단

## 태스크 목록

### T1: 페이지 레이아웃 리뉴얼
- **담당**: frontend-dev
- **의존**: 없음
- **파일**: `src/app/(main)/posts/posts-redesign-client.tsx` (수정)
- **설명**:
  - 현재 단순 grid → **섹션 기반 레이아웃**으로 변경
  - 구조: 히어로(pinned) → 카테고리별 섹션 → 뉴스레터 CTA → 전체 최신글
  - max-width: 1200px, 양쪽 패딩 충분히 (px-6 lg:px-8)
  - 섹션 간 간격: py-12 이상
  - 각 섹션: 제목(h2, text-2xl font-bold) + "더 살펴보기 →" 링크 + 카드 3열
  - 카테고리별 섹션은 `posts`를 category로 그루핑하여 렌더링
  - 검색 모드일 때는 섹션 구분 없이 기존 grid 유지

### T2: 카드 컴포넌트 개선
- **담당**: frontend-dev
- **의존**: 없음 (T1과 병렬 가능)
- **파일**: `src/components/posts/post-card.tsx` (수정)
- **설명**:
  - 기존 카드 디자인 리뉴얼 (mfitlab 스타일)
  - 카드 구조: 상단 썸네일(OG이미지) → 카테고리 뱃지 → 제목(font-semibold, text-base) → 설명(text-sm, text-gray-500, 2줄) → 하단(날짜 + 조회수)
  - 호버: 카드 전체 shadow 증가 + 제목 색상 변경(#F75D5D)
  - featured 카드(히어로): 2열(좌 이미지 60%, 우 텍스트 40%), 제목 text-2xl, 설명 3줄
  - border: border-gray-100, rounded-xl
  - 카드 높이 균일 (flex-col, flex-1)

### T3: 뉴스레터 CTA 배너 개선
- **담당**: frontend-dev
- **의존**: 없음
- **파일**: `src/components/posts/newsletter-cta.tsx` (수정)
- **설명**:
  - mfitlab 스타일: 중앙 정렬, 아이콘(Mail or Sparkles) + 제목 + 부제 + 이메일 input + 구독 버튼
  - 배경: 흰 배경 + 얇은 border (or 연한 gray bg)
  - 버튼: coral #F75D5D 배경, 흰 텍스트
  - "매주 새로운 인사이트를 메일로 전해드려요" 같은 카피
  - 모바일: 세로 스택

### T4: 카테고리 탭 개선
- **담당**: frontend-dev
- **의존**: 없음
- **파일**: `src/components/posts/category-tabs.tsx` (수정)
- **설명**:
  - 현재 탭 → mfitlab 스타일의 수평 필터 바
  - 활성 탭: 하단 coral 밑줄 (border-bottom) + 텍스트 bold
  - 비활성: text-gray-500
  - 간격: gap-6, text-sm
  - "전체" 탭 포함

### T5: 코드 리뷰
- **담당**: code-reviewer
- **의존**: T1, T2, T3, T4 (전부 완료 후)
- **파일**: 전체 리뷰 (읽기만)
- **설명**: 빌드 확인 + 타입 + 한국어 UI + 디자인 시스템 준수 + 반응형

## 의존성 규칙
- T1~T4: 각자 다른 파일이라 병렬 가능
- T5: T1~T4 전부 완료 후 시작

## 기술 제약
- Next.js 15 App Router, TypeScript strict
- 한국어 UI only, Primary #F75D5D, Hover #E54949
- shadcn/ui, Pretendard 폰트, 라이트 모드만
- 기존 페이지 구조(page.tsx → server fetch → client component) 유지
- 이미 존재하는 컴포넌트 import 경로 유지

## 완료 기준
- [ ] npm run build 성공
- [ ] lint 에러 0개
- [ ] 타입 에러 0개
- [ ] PC에서 mfitlab 수준의 섹션 기반 레이아웃
- [ ] 모바일에서도 깨지지 않음
- [ ] git commit + push
- [ ] /workflows:compound로 교훈 기록
