# TASK: 5축 배치 분석 (잔여 전체)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
소재 분석 5축(시선/감성/텍스트/오디오/종합) AI 분석.
현재 496/3,046건 완료 (16%). 나머지 + backfill 후 추가된 카드 전부 처리.

## 선행 조건
- ⚠️ TASK-P1-BACKFILL.md 완료 후 실행 (backfill로 카드 추가될 수 있음)

## 해야 할 것
1. creative_media에서 analysis_json IS NULL인 건 전체 조회
2. Cloud Run Job `analyze-five-axis` 실행
3. Gemini 2.5 Pro Vision으로 카드별 5축 분석
4. 결과를 creative_media.analysis_json에 저장
5. 진행률 모니터링

## 실행 방법
- Cloud Run Job으로 실행 (기존 Job 설정 있음)
- 또는 엔드포인트 호출: `/api/cron/analyze-five-axis`

## 비용/시간 예측
- 이미지: ~$0.003/건, 동영상: ~$0.015/건
- 예상 총비용: ~$15-20
- 예상 시간: 4-5시간

## 검증
- creative_media에서 analysis_json NOT NULL 비율 95%+ 확인
- 랜덤 샘플 5건 5축 결과 정상 확인

## 완료 기준
- analysis_json NOT NULL 비율 95%+
- 에러율 5% 미만
