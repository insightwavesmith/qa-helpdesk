# TASK: 경쟁사 분석기 — 검색 결과 이미지 일괄 ZIP 다운로드

## 목표
검색 결과의 광고 소재 이미지를 한 번에 ZIP 파일로 다운로드

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. ZIP 다운로드 API
### 파일
- `src/app/api/competitor/download-zip/route.ts` (신규)
- `package.json` (JSZip 추가)
### 현재 동작
- 개별 이미지만 다운로드 가능 (`/api/competitor/download?ad_id=xxx&type=image`)
### 기대 동작
- `POST /api/competitor/download-zip` — body에 ad_id 배열 전달
- 서버에서 각 이미지 fetch → JSZip으로 묶기 → ZIP 스트림 응답
- 파일명: `competitor-ads-{timestamp}.zip`
- 각 이미지 파일명: `{page_name}_{ad_id}.jpg`
- 영상은 video_preview_image_url (썸네일)로 대체 (영상 mp4는 용량 큼)
- 이미지 없는 광고는 스킵
- 최대 50건 제한 (서버 부하 방지)
### 하지 말 것
- 기존 download route 수정하지 마라

## T2. UI에 "전체 다운로드" 버튼 추가
### 파일
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/(main)/protractor/competitor/components/ad-card.tsx` 또는 검색 결과 영역
### 현재 동작
- 개별 카드에만 다운로드 버튼
### 기대 동작
- 검색 결과 상단에 "📥 전체 다운로드 (ZIP)" 버튼
- 클릭 시 현재 검색 결과 전체의 이미지를 ZIP으로 다운로드
- 다운로드 중 로딩 스피너 표시
- 완료 시 자동 파일 저장
### 하지 말 것
- 검색 기능 변경하지 마라

## 검증 기준
- "전체 다운로드" 클릭 → ZIP 파일 다운로드
- ZIP 내 이미지 파일 확인 가능
- 빈 검색 결과 시 버튼 비활성화
- tsc --noEmit + next lint 통과

## 참고
- bscamp 디자인 시스템: Primary #F75D5D, Radius 0.75rem, icons lucide-react
