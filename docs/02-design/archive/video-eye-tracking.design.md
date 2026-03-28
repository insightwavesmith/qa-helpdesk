# 영상 Eye Tracking + Canvas 오버레이 설계서

> 작성일: 2026-03-22
> TASK: T7 (architecture-v3-execution-plan.md)
> 의존성: T2 ✅ (analysis_json 스키마)

---

## 1. 데이터 모델

### 1.1 eye_tracking 축 스키마 (영상 전용)

analysis_json에 추가:
```json
{
  "eye_tracking": {
    "frames": [
      {
        "timestamp": 0,
        "fixations": [
          { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "텍스트" }
        ]
      },
      {
        "timestamp": 3,
        "fixations": [
          { "x": 0.3, "y": 0.5, "weight": 0.7, "label": "제품" },
          { "x": 0.8, "y": 0.8, "weight": 0.6, "label": "CTA" }
        ]
      }
    ]
  }
}
```

- timestamp: 초 단위 (0, 3, 6, 9, ... 3초 간격)
- fixations: 예상 시선 고정점 (x/y: 0.0~1.0 비율, weight: 0.0~1.0 주목도)
- label: 시선이 향하는 대상 (텍스트/제품/인물/CTA/배경/로고)

### 1.2 이미지는 제외
이미지 소재의 시선 분석은 DeepGaze(L2 saliency)가 담당. eye_tracking은 영상 전용.

---

## 2. API 설계

### 2.1 analyze-five-axis.mjs 프롬프트 변경

VIDEO_PROMPT_V3의 기존 `attention` 축 아래에 `eye_tracking` 추가:

```json
"eye_tracking": {
  "frames": [
    {
      "timestamp": 0,
      "fixations": [
        { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "텍스트|제품|인물|CTA|배경|로고" }
      ]
    }
  ]
}
```

3초 간격으로 주요 구간 분석 (0초, 3초, 6초, 9초, 12초, 15초).
Gemini가 영상 프레임별 시선 예측을 수행.

### 2.2 video-heatmap-overlay.tsx (프론트엔드)

```typescript
interface VideoHeatmapOverlayProps {
  eyeTracking: {
    frames: Array<{
      timestamp: number;
      fixations: Array<{
        x: number;
        y: number;
        weight: number;
        label: string;
      }>;
    }>;
  };
  videoRef: React.RefObject<HTMLVideoElement>;
}
```

동작:
- video timeupdate 이벤트 리스닝
- 현재 시간에 가장 가까운 frame의 fixations 렌더링
- Canvas에 가우시안 히트맵 원형 오버레이
- 구간별 색상: 0-3초 빨강(훅), 3-8초 파랑(제품), 8-15초 초록(CTA)

---

## 3. 컴포넌트 구조

### 3.1 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | VIDEO_PROMPT_V3에 eye_tracking 추가 |
| `src/components/video-heatmap-overlay.tsx` | **신규** | Canvas 오버레이 컴포넌트 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| eye_tracking 데이터 없음 | 오버레이 미표시 |
| frames 빈 배열 | 오버레이 미표시 |
| video 요소 없음 | 컴포넌트 null 반환 |

---

## 5. 구현 순서

- [ ] VIDEO_PROMPT_V3에 eye_tracking 축 추가
- [ ] VIDEO_PROMPT_FREE에 eye_tracking 자유 기술 추가
- [ ] video-heatmap-overlay.tsx 신규 작성
- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run build` 통과

---

> 설계서 작성 완료.
