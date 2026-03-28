---
team: unassigned
created: 2026-03-28
status: completed
owner: leader
---
# TASK: LP 미디어 리소스 전체 다운로드

## 고객 관점
수강생 상세페이지(LP)를 "진짜 페이지처럼" 보존해서 분석하고 싶다.
지금은 스크린샷+HTML만 있어서 GIF 애니메이션, 상품 영상, 배너 이미지 등이 빠져있다.
LP가 바뀌거나 삭제돼도 원본 미디어가 남아있어야 시계열 비교가 가능하다.

## 현재 상태
- `crawl-lps` 크론: 매시간, Playwright로 LP 방문 → 스크린샷(JPEG) + HTML + CTA 스크린샷 저장
- Storage 경로: `lp/{account_id}/{lp_id}/page.html`, `lp/{account_id}/{lp_id}/screenshot.jpg`
- HTML 안에 이미지/GIF/영상 URL 참조는 있지만, 실제 파일은 우리 Storage에 없음

## 기대 결과
1. LP HTML 파싱 → `<img>`, `<video>`, `<source>`, CSS `background-image` 등에서 미디어 URL 추출
2. 각 미디어 파일을 Supabase Storage에 다운로드 저장
3. Storage 경로: `lp/{account_id}/{lp_id}/media/{hash}.{ext}` (중복 방지)
4. DB `landing_pages` 테이블에 `media_assets` 컬럼 추가 (JSONB) — 원본URL→Storage경로 매핑
5. 이미 저장된 미디어는 hash 비교로 스킵 (중복 다운로드 방지)
6. 파일 크기 제한: 개별 50MB, LP당 총 200MB (초과 시 스킵+로그)

## 대상 미디어 타입
- 이미지: jpg, png, webp, svg
- GIF: gif (애니메이션 포함)
- 영상: mp4, webm
- 제외: 외부 CDN 트래커, 1x1 픽셀, favicon

## 계정 종속 체크
- [x] Storage 경로: `lp/{account_id}/{lp_id}/media/` — 계정 분리 OK
- [x] DB: landing_pages.account_id FK 있음
- [x] API: account_id 필터링 됨

## 구현 위치
- `src/app/api/cron/crawl-lps/route.ts` 확장 또는 별도 함수
- 기존 crawl-lps 플로우에 미디어 다운로드 단계 추가

## 주의사항
- 크론 실행 시간 고려: 미디어 다운로드가 오래 걸리면 별도 배치로 분리
- 카페24 상세페이지 특성: 이미지가 대부분 `ecimg.cafe24img.com` CDN
- GIF가 핵심: 상품 사용 장면 GIF가 전환에 영향 큼

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라
