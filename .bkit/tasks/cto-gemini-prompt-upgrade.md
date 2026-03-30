# TASK: Gemini 프롬프트 보강 + 엔젤앤비 Top5 재분석 + UI 매칭

## 긴급도: 최고 (9시까지 완료 필수)

## 목표
소재분석 탭 UI를 이 목업과 **동일하게** 만들어라:
https://mozzi-reports.vercel.app/reports/plan/2026-03-23-customer-journey-v5

## Phase 1: Gemini 프롬프트 보강 (prescription-prompt.ts)

### 출력 스키마에 추가할 필드:

```typescript
// analysis_json에 저장할 새 필드들
scene_journey: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      time: { type: 'string' },       // "0-3초"
      type: { type: 'string' },       // "hook" | "demo" | "result" | "tip" | "cta"
      watched: { type: 'string' },    // 👁 봤다 (구체적 시각 묘사)
      heard: { type: 'string' },      // 👂 들었다 (나레이션/오디오 내용)
      felt: { type: 'string' },       // 🧠 느꼈다 (심리적 반응 + 전문 용어)
      gaze_point: { type: 'string' }, // 📍 시선 집중 포인트
      subtitle_text: { type: 'string' }, // 📝 자막 원문
      subtitle_position: { type: 'string' }, // 중앙/하단/상단
      safety_zone: { type: 'boolean' },   // 세이프티존 내 여부
      cognitive_load: { type: 'string' },  // low/medium/high
      prescription: {                     // 💊 씬별 처방
        target: { type: 'string' },       // 👁감각 / 🧠사고 / 🖱행동
        action: { type: 'string' },       // 구체적 개선 방법
        reasoning: { type: 'string' },    // 근거
      }
    }
  }
},
audio_analysis: {
  type: 'object',
  properties: {
    narration_tone: { type: 'string' },   // "친한 친구가 꿀팁 알려주듯..."
    bgm_genre: { type: 'string' },        // "밝고 경쾌한 팝"
    emotion_flow: { type: 'string' },     // "공감→신뢰→감탄"
  }
},
customer_journey_detail: {
  type: 'object',
  properties: {
    sensation: { summary: string, detail: string },
    thinking: { summary: string, detail: string },
    action_click: { summary: string, metric: string },
    action_purchase: { summary: string, metric: string },
    core_insight: { type: 'string' }  // "핵심: 고객은..."
  }
}
```

### 프롬프트에 추가할 지시:
```
## 씬별 고객 여정 분석
영상을 시간대별 씬으로 나누고, 각 씬에서:
1. 👁 봤다: 고객이 화면에서 실제로 본 것 (구체적 시각 묘사)
2. 👂 들었다: 나레이션/음향 내용 (직접 인용)  
3. 🧠 느꼈다: 심리적 반응 + 마케팅 전문 용어 (예: Relatability, Authority, Curiosity)
4. 📍 시선 포인트: 어디에 시선이 집중되는지
5. 📝 자막: 자막 원문 + 위치 + 세이프티존 여부
6. 💊 처방: 이 씬의 구체적 개선안 + 근거

## 오디오 분석
- 나레이션 톤 (말투, 속도, 감정)
- BGM 장르와 역할
- 감정 흐름 요약 (화살표 형식)
```

## Phase 2: 엔젤앤비 Top5 재분석
- 대상 creative_media IDs:
  - 0cbd1fe9-8e2e-463a-8093-b6a4412ad881
  - 5f8183b6-bce9-48bb-b438-5866c83211c9
  - 4fa14aef-61c1-4617-bfeb-859f625e9126
  - 0a3504cf-abc6-47c2-99fd-1622a1cea7b2
  - 42384121-5ac9-4e82-8308-ee290493bca9
- prescription API의 ?force=true로 재분석 트리거하거나 직접 엔진 호출

## Phase 3: UI 컴포넌트 업데이트
기존 컴포넌트를 목업과 동일하게 수정:
- `customer-journey.tsx` — 씬별 봤다/들었다/느꼈다 카드
- `prescription-cards.tsx` — 씬별 처방 카드
- `creative-detail-panel.tsx` — 오디오 분석 섹션 추가
- `gaze-analysis.tsx` — 시선 히트맵 타임라인

## 디자인 규칙
- 화이트 배경, 라이트 모드
- 이모지 적극 사용 (👁👂🧠📍📝💊🎬🏆)
- 시간대별 컬러: 훅=빨강, 데모=파랑, 결과=초록, CTA=보라
- 카드 스타일: 둥근 모서리, 그림자, 패딩 충분히

## DB
- Cloud SQL 직접 연결: postgresql://postgres:BsCamp2026Gcp@34.50.5.237:5432/bscamp
- **Supabase 절대 쓰지 마**
- Gemini API Key: AIzaSyBQZUTjVUeYiT1XLzkWZEjJ7cmSZEbtgus

## 절대 금지
- Supabase 사용 ❌
- DB 스키마 변경 ❌ (analysis_json JSONB에 새 필드 추가는 OK)
- 새 테이블 생성 ❌

## 완료 기준
- localhost:3000/protractor/creatives → 엔젤앤비 선택 → 목업과 동일 수준
- 씬별 봤다/들었다/느꼈다 + 처방 + 오디오 + 고객여정요약 전부 표시
