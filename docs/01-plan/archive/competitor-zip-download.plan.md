# 경쟁사 분석기 ZIP 다운로드 Plan

## 요구사항
검색 결과의 광고 소재 이미지를 한 번에 ZIP 파일로 다운로드하는 기능 추가

## 범위
- T1: ZIP 다운로드 API (`POST /api/competitor/download-zip`)
- T2: UI에 "전체 다운로드 (ZIP)" 버튼 추가

## 성공 기준
- 검색 결과 상단에 "전체 다운로드" 버튼 → 클릭 시 ZIP 파일 다운로드
- ZIP 내 이미지 파일명: `{page_name}_{ad_id}.jpg`
- 영상은 video_preview_image_url(썸네일)로 대체
- 이미지 없는 광고 스킵
- 최대 50건 제한
- 빈 검색 결과 시 버튼 비활성화
- 기존 download route 수정 없음
- tsc + lint + build 통과

## 의존성
- JSZip 패키지 추가 필요
- 기존 competitor_ad_cache 테이블 활용 (변경 없음)
- CompetitorAd 타입 활용 (변경 없음)

## 수정 대상 파일
- `package.json` — JSZip 추가
- `src/app/api/competitor/download-zip/route.ts` — 신규
- `src/app/(main)/protractor/competitor/components/ad-card-list.tsx` — 버튼 추가
