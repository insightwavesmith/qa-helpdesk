# TASK: 전체 콘텐츠 분석+처방 배치 (backfill 후)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 선행 조건
- ⚠️ 수집 구조 v3 완료 (계정 디스커버리 + 콘텐츠 중복 제거)
- ⚠️ backfill 완료 (전체 계정 × 90일 숫자+콘텐츠)
- ⚠️ 처방 프롬프트 세팅 완료 (축1 가이드 + 통합 벤치마크 조회 로직)

## 개요
backfill로 수집된 전체 콘텐츠에 대해 분석+처방을 1회 배치로 돌린다.
Gemini 1회 호출 = 5축 분석 + 속성 태깅 + 씬별 분석 + 처방 Top3.

## Gemini 프롬프트에 들어가는 데이터 (소재 1건당)

### 필수 입력
1. **소재 원본** — 이미지 or 영상 파일 (멀티모달)
2. **광고 카피 원문** — ad.name 또는 body 텍스트
3. **DeepGaze 시선 데이터** — 1초별 fixation + cognitive load + AOI(인물/텍스트/제품/CTA %)
4. **ffmpeg 씬 경계** — 영상만. [2.3초, 7초, 10.4초...] 타임스탬프 배열
5. **성과 숫자 + 벤치마크 비교** — daily_ad_insights에서:
   - impressions, CTR, ROAS, 3초재생률, 완시청률, 참여합계/만노출
   - 각 지표별 벤치마크 대비 차이 (%)
6. **재생 이탈 곡선** — 영상만. Meta API에서:
   - video_p3s_watched (3초 재생 수)
   - video_p25_watched (25% 재생 수)
   - video_p50_watched (50% 재생 수)
   - video_p75_watched (75% 재생 수)
   - video_p100_watched (100% 재생 수)
   - video_avg_time (평균 재생 시간)
   - 영상 길이와 곱해서 **초수로 환산** → 씬 경계와 매칭
   - 예: 31초 영상 50% = 15.5초 → 씬3 진입 지점

### 처방 근거 (프롬프트 삽입)
7. **축1 처방 가이드** — prescription-prompt-guide.md 전문 (고정 텍스트)
8. **축2+3 통합 벤치마크** — prescription_benchmarks 테이블에서 이 소재 속성에 해당하는 패턴 조회
9. **임베딩 유사 벤치마크 Top3** — 벡터 유사도로 검색 → 각 소재의 5축 결과 + 성과 + 속성 diff

### 재생 이탈 역추적 (영상 전용, 핵심 신규 기능)
10. **이탈 구간 특정**: 재생 곡선에서 급락 지점 → 해당 씬 특정
11. **해당 씬 콘텐츠 분석**: DeepGaze 시선 + 5축 결과로 "왜 이탈하는지"
12. **벤치마크 같은 구간 비교**: 유사소재 Top3의 같은 시간대 씬 → "잘 되는 건 뭐가 다른지"
13. **구간별 처방**: "이 씬에서 이걸 이렇게 바꿔라" + 근거

## Gemini 출력 (JSON)
```json
{
  "five_axis": { visual, text, psychology, quality, attention, audio },
  "attributes": ["ugc", "curiosity", "timer", ...],
  "retention_curve": {
    "dropoff_points": [
      { "time": "15.5초", "scene": 3, "retention": "36%", "prev_retention": "64%", "drop": "28%p" }
    ],
    "scene_diagnosis": [
      { "scene": 3, "problem": "텍스트 과다 + 비주얼 임팩트 부족", "benchmark_diff": "벤치마크 상위는 제품 시연 장면" }
    ]
  },
  "scenes": [
    { time, stage, saw, heard, felt, eye_tracking, prescription }
  ],
  "top3_prescriptions": [
    { rank, action, stage, expected, evidence_axis1, evidence_axis23, difficulty }
  ]
}
```

## 실행 계획
1. DeepGaze 배치 — 미처리 소재 전체 (이미지 + 영상 1초별)
2. ffmpeg 씬 분할 — 영상 전체
3. Gemini 분석+처방 배치 — 전체 콘텐츠 (content_hash 기준 중복 제거)
4. 결과 → creative_media.analysis_json 저장
5. 패턴 추출 (STEP 3) — 5축 태깅 × 성과 SQL 집계 → prescription_benchmarks

## 비용/시간 예측
- 이미지: ~$0.013/건 (임베딩+5축+DeepGaze)
- 영상: ~$0.061/건 (임베딩+5축+DeepGaze+씬분할)
- 예상 총비용: content_hash 기준 중복 제거 후 추정 필요
- 예상 시간: Cloud Run Job, 4-6시간

## 완료 기준
- analysis_json NOT NULL 비율 95%+
- 에러율 5% 미만
- 재생 이탈 곡선 + 씬 매칭 데이터 포함 (영상)
- 처방 Top3 포함
- 패턴 추출 1회 완료 → prescription_benchmarks 데이터 존재
