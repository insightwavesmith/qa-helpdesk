# TASK: 분석 파이프라인 배치 실행 + 벤치마크 소재 수집

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 현재 상태
- 전체 소재: 3,022건 (IMAGE 2,870 / VIDEO 152)
- Gemini 5축 분석 완료: 496건 (16%) → 나머지 2,526건 미분석
- 임베딩 완료: 2,917건 (97%)
- DeepGaze 시선: 2,926건 (97%)
- 벤치마크 소재: 0건

## 파이프라인 순서 (확정)
수집 → 저장 → 임베딩 → DeepGaze → Gemini 5축 → 처방

## TASK 1: Gemini 5축 배치 실행
- analyze-five-axis.mjs를 Cloud Run Job으로 만들어라 (기존 bscamp-crawl-lps Job 구조 참고)
- 미분석 2,526건 전체 실행
- 모델: gemini-3-pro-preview
- DeepGaze 시선 데이터 주입 이미 구현되어 있음 (a22028a)
- VIDEO 100MB 제한 이미 반영됨
- 예상 비용: ~$12, 예상 시간: ~4-5시간
- Cloud Run Job으로 만드는 이유: 시간 제한 없이 배치 실행

## TASK 2: 벤치마크 소재 수집
- daily_ad_insights에서 벤치마크 수치를 넘는 광고의 소재를 수집
- 기준:
  - 🟢 훅: video_watched_3s_rate > 25.81% 
  - 🟢 클릭: ctr > 3.48%
  - 🟡 참여: engagement_total > 27.0
  - ⭐ 올스타: 위 3개 다 충족
- 대상: quality_ranking이 ABOVE_AVERAGE + UNKNOWN 포함
- 수집할 것: 소재 이미지/영상 URL → Storage 다운로드 → creative_media에 source='benchmark'로 저장
- 수집 후: 임베딩도 같이 실행 (embed-creatives 크론 호출)

## TASK 3: VIDEO mp4 미저장분 다운로드
- creative_media에서 media_type='VIDEO'이고 storage에 mp4 없는 건 전체 다운로드
- Storage 경로: creatives/{account_id}/media/{ad_id}.mp4

## 우선순위
TASK 2 (벤치마크 소재) → TASK 3 (영상 다운로드) → TASK 1 (5축 배치)
이유: 5축 분석할 때 벤치마크 소재 임베딩이 있어야 유사도 비교 가능

## 빌드 검증
모든 코드 변경 후 반드시 tsc + next build 통과 확인
