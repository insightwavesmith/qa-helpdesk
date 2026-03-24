# 영상 소재 1초별 DeepGaze 시선 흐름 — Plan

## 요약
영상 소재(VIDEO) 403건에 대해 1초별 프레임 추출 → DeepGaze 시선 분석 → 시계열 저장하는 전용 크론 구축.

## 배경
- 기존 `creative-saliency` 크론이 IMAGE 처리 후 끝부분에서 `/video-saliency`를 `limit: 20`으로 호출
- 계정별 처리 없이 전역 20건만 처리 → 403건 VIDEO 백로그 해소 불가
- `creative_media.video_analysis` JSONB 컬럼이 미활용 상태
- Python `predict_video_frames.py`와 Cloud Run `/video-saliency` 엔드포인트는 이미 완성

## 범위

### IN
1. **전용 크론 `video-saliency/route.ts`** — 계정별 VIDEO 처리, Cloud Run 호출
2. **creative-saliency 크론에서 VIDEO 호출 제거** — 책임 분리
3. **Python 스크립트 보완** — ADR-001 경로 수정, creative_media.video_analysis 동기화
4. **시계열 저장** — creative_saliency(프레임별) + creative_media.video_analysis(요약)

### OUT
- DeepGaze 모델 변경
- 프레임 추출 간격 변경 (1fps 유지)
- 프론트엔드 시각화 (별도 TASK)
- Cloud Run 서비스 변경 (server.js 수정 불필요)

## 성공 기준
- [ ] video-saliency 전용 크론이 계정별로 VIDEO 처리
- [ ] creative_media.video_analysis에 시계열 요약 저장
- [ ] creative-saliency 크론에서 VIDEO 호출 완전 제거
- [ ] ADR-001 스토리지 경로 준수
- [ ] tsc + build 통과

## 의존성
- `services/creative-pipeline/saliency/predict_video_frames.py` (기존)
- Cloud Run `/video-saliency` 엔드포인트 (기존)
- `creative_saliency` 테이블 (기존)
- `creative_media.video_analysis` JSONB 컬럼 (기존, 미사용)

## 타입
개발
