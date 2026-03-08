# TASK: 경쟁사 분석기 v2 — T3 필터 · 정렬 · 페이지네이션

## 전제
- T1(구조) 완료 후 실행
- 검색 API에 nextPageToken, totalCount 포함

## 목표
소재 유형 3종 분류(이미지/슬라이드/영상) + 정렬 옵션 + 더보기 페이지네이션

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234!

## T3.1 필터 칩 — 슬라이드 분리
### 파일
- `src/app/(main)/protractor/competitor/components/filter-chips.tsx`
### 할 것
- 기존 "이미지" 필터: IMAGE + CAROUSEL 합침 → IMAGE만
- "📑 슬라이드" 필터 추가: CAROUSEL만
- 필터 순서: 30일+ / 게재중 / Facebook / Instagram │ 🖼️ 이미지 / 📑 슬라이드 / 🎬 영상
- FilterState에 mediaType 옵션 추가: `'all' | 'image' | 'carousel' | 'video'`

## T3.2 정렬 옵션
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/(main)/protractor/competitor/components/filter-chips.tsx`
### 할 것
- 정렬 칩 추가: `최신순` (기본) / `운영기간순`
- 최신순: start_date DESC (SearchAPI.io 기본 순서 유지)
- 운영기간순: durationDays DESC (클라이언트 정렬)
- 상태: `sortBy: 'latest' | 'duration'`

## T3.3 더보기 페이지네이션
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/(main)/protractor/competitor/components/ad-card-list.tsx`
### 할 것
- 검색 결과 하단에 "더보기" 버튼 (nextPageToken이 있을 때만)
- 클릭 → `/api/competitor/search?q=xxx&page_token=토큰` 호출 → 기존 결과에 append
- "총 N건" 표시 (serverTotalCount)
- 로딩 스피너
- 주의: next_page_token 크기가 클 수 있음 → POST가 아닌 GET이면 URL 길이 확인

## 하지 말 것
- 검색바/다운로드 UI 변경하지 마라
- API 라우트 변경하지 마라

## 검증 기준
- "이미지" 필터 → IMAGE만 / "슬라이드" → CAROUSEL만 / "영상" → VIDEO만
- 운영기간순 → 오래 돌아간 광고가 위로
- 더보기 → 다음 30건 로드 + append + 전체 건수 표시
