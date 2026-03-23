# LP 미디어 리소스 전체 다운로드 — Plan

## 배경
LP 크롤링 시 스크린샷+HTML만 저장 중. GIF/이미지/영상 원본이 없어서 LP 삭제/변경 시 시계열 분석 불가.

## 목표
1. LP HTML 파싱 → 미디어 URL 추출 (img, video, source, background-image)
2. Supabase Storage에 다운로드 저장
3. DB에 원본URL→Storage경로 매핑 저장

## 범위
- **IN**: HTML 파싱, 미디어 다운로드, Storage 업로드, DB 컬럼 추가
- **OUT**: 프론트엔드 미디어 뷰어 (별도 TASK)

## 성공 기준
- [ ] crawl-lps 실행 시 HTML에서 미디어 추출 + Storage 저장
- [ ] landing_pages.media_assets에 매핑 저장
- [ ] 중복 다운로드 방지 (hash 비교)
- [ ] 파일 크기 제한 (개별 50MB, LP당 200MB)
- [ ] tsc + build 통과

## 리스크
- 크론 실행 시간 초과 (300s) → 미디어 다운로드를 별도 함수로 분리, 시간 초과 시 graceful skip
- 카페24 CDN 접근 제한 → User-Agent 설정 + 타임아웃 처리

## 의존성
- crawl-lps v2 (완료)
- Storage 버킷 creatives (존재)
