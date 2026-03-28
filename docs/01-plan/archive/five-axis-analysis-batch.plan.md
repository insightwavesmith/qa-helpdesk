# 5축 분석 배치 스크립트 Plan

> 작성일: 2026-03-21
> TASK: TASK-phase2-execution.md STEP 5

## 목적

전체 소재(이미지+영상)에 대해 Gemini 3.1 Pro Preview로 5축 통합 분석을 실행하고,
결과를 `creative_media.analysis_json`에 저장한다.

기존 L1(creative_element_analysis), L2(creative_saliency), L4(creative_intelligence_scores)
테이블을 대체하는 단일 JSON 구조.

## 범위

- **이미지**: ~2,709건 (ad_creative_embeddings 기준, Storage에 이미지 있음)
- **영상**: ~225건 (creative_media VIDEO, Storage에 mp4 있음)
- **모델**: Gemini 3.1 Pro Preview (gemini-3.1-pro-preview)
- **출력**: `creative_media.analysis_json` (JSONB) + `analyzed_at` + `analysis_model`

## JSON 스키마 (5축)

```json
{
  "summary": "소재 한줄 요약",
  "visual": {
    "format": "image|video",
    "product_visibility": { "position": "center|left|right", "size_pct": 30 },
    "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile" },
    "color": { "dominant": "#FF6B6B", "palette": [], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "style": "ugc|professional|minimal|bold|lifestyle",
    "layout": { "text_pct": 20, "whitespace_pct": 15 }
  },
  "text": {
    "hook": { "type": "question|shock|benefit|problem|curiosity", "text": "" },
    "overlay_texts": [],
    "cta_text": "",
    "key_message": ""
  },
  "audio": null,
  "structure": null,
  "attention": {
    "top_fixations": [{ "x": 0.5, "y": 0.3, "weight": 0.9, "label": "" }],
    "cta_attention_score": 0.0,
    "cognitive_load": "low|medium|high"
  }
}
```

영상의 경우 `audio`, `structure` 축이 추가:
```json
{
  "audio": {
    "narration_text": "",
    "bgm_genre": "",
    "audio_emotion": "",
    "audio_type": "narration|bgm|sfx|silent"
  },
  "structure": {
    "scenes": [{ "sec": "0-3", "type": "hook", "desc": "" }],
    "pacing": "fast|medium|slow",
    "hook_type": "",
    "ending_cta_type": ""
  }
}
```

## 데이터 소스 전략

1. **creative_media** 행이 있으면 → 해당 행의 `storage_url`로 분석 → `analysis_json` 직접 저장
2. **creative_media** 행이 없고 `ad_creative_embeddings`에만 있으면 → `ad_creative_embeddings.storage_url`로 분석 → 결과를 `ad_creative_embeddings.video_analysis`에 임시 저장 (creative_media 행 생성은 collect-daily v2 크론에 위임)

## 배치 처리

- **Rate Limit**: Gemini API 분당 15 요청 제한 → 요청 간 4초 sleep
- **배치 크기**: 50건씩 처리 후 진행 상태 출력
- **재시도**: 429/500 에러 시 exponential backoff (최대 3회)
- **이미 분석된 건**: `analyzed_at IS NOT NULL` → 스킵
- **예상 시간**: 이미지 2,709건 × 4초 = ~3시간 / 영상 225건 × 8초 = ~30분

## 성공 기준

- 전체 소재의 90%+ 분석 완료
- analysis_json이 유효한 JSON
- tsc + build 통과 (스크립트 파일이라 영향 없음)

## 하지 말 것

- 기존 L1/L2/L4 테이블 삭제 금지 (deprecated 마킹만)
- creative_media 행 직접 생성 금지 (collect-daily v2가 담당)
