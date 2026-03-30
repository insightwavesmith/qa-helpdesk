# 추가 지시: 5축 분석 프롬프트에 누락된 5개 항목 추가

## prescription-prompt.ts 출력 스키마에 추가할 것

### 1. 광고축 카테고리 (ad_axis)
```json
{
  "format": "UGC/셀프촬영",
  "hook_type": "problem | benefit | curiosity | social_proof | authority",
  "messaging_strategy": "권위+혜택",
  "target_persona": "직장인 여성 (solution_aware)",
  "category": ["beauty", "skincare"],
  "structure": "훅→데모→결과→CTA",
  "persuasion": "authority",
  "offer": "discount 40%",
  "andromeda_code": "skincare-demo-ugc-text-overlay-glowy-skin",
  "pda_code": "office_worker × beauty × solution_aware"
}
```

### 2. 씬별 봤다/들었다/느꼈다 (scene_journey)
```json
[{
  "time": "0-2초",
  "type": "hook",
  "watched": "여성 얼굴 클로즈업 — 손가락으로 볼을 누르며...",
  "heard": "어떤 파데를 써도 피부 화장이 금방 무너진다면",
  "felt": "아 나도 오후에 무너지는데 → 강한 공감(Relatability)",
  "cognitive_load": "high"
}]
```

### 3. 씬별 시선+처방 (scene_gaze_prescription)
```json
[{
  "time": "0-3초",
  "label": "훅",
  "gaze": { "point": "인물 피부+하단 텍스트", "cognitive_load": "high" },
  "subtitle": { "text": "점심만 지나면 파데 무너지는 사람!!ㅠ", "position": "중앙+하단", "safety_zone": true },
  "prescription": {
    "target": "👁 감각",
    "action": "텍스트 줄이고 Contrast 훅 강화...",
    "reasoning": "인지부하 high → 텍스트 읽기보다 시각적 대비가 효과적"
  }
}]
```

### 4. 오디오 분석 (audio_analysis)
```json
{
  "narration_tone": "친한 친구가 꿀팁 알려주듯 친근하고 확신에 찬 하이톤",
  "bgm": "밝고 경쾌한 팝 · 영상의 빠른 템포 보조",
  "emotion_flow": ["공감(문제)", "신뢰(승무원)", "감탄(물광)", "유익(꿀팁)", "제안(할인)"],
  "sound_prescription": "사운드 오프에서도 핵심 키워드 자막 가독성 높이기..."
}
```

### 5. 고객여정 상세 (customer_journey_detail)
```json
{
  "sensation": { "summary": "파운데이션 문제→물광 전환", "detail": "인물 피부+자막에 시선 집중" },
  "thinking": { "summary": "공감→신뢰→기대→만족", "detail": "승무원 권위+임상 데이터" },
  "action_click": { "summary": "CTR 0%", "detail": "클릭 동기 매우 부족" },
  "action_purchase": { "summary": "ROAS 0", "detail": "전환 미발생" },
  "core_insight": "고객은 보고 들으면서 공감→신뢰→기대까지는 잘 타는데, '지금 클릭해야 할 이유'가 없어서 행동으로 안 넘어가."
}
```

## 중요
- 총가치 점수는 빼라 (기간별로 달라지니까)
- 이 5개를 PRESCRIPTION_OUTPUT_SCHEMA에 추가하고, 시스템 프롬프트에도 각 항목 생성 지시를 넣어라
- 목업 HTML 직접 참조: `docs/02-design/mockups/creative-analysis-v2.html`
