# TASK — QA 잔여 버그 수정

> 독립 (다른 TASK와 병렬 가능)

## T1. OG 이미지 API 400 에러
- `/api/og` 400 → 커버 이미지/썸네일 전체 깨짐
- 원인 파악 + 수정

## T2. CTA 버튼 렌더링
- 정보공유 글 내 CTA 버튼이 일반 텍스트로 렌더링
- 마크다운 파서에서 CTA 블록 처리 추가

## T3. IMAGE_PLACEHOLDER 404
- `/admin/IMAGE_PLACEHOLDER` 404 에러
- Unsplash 자동 설정 연결 또는 실제 placeholder 이미지 경로
