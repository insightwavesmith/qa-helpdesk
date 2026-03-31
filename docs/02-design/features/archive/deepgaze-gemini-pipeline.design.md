# DeepGaze → Gemini 결합 분석 파이프라인 설계서

> 작성일: 2026-03-25
> 작성자: PM팀
> Plan 참조: docs/01-plan/features/deepgaze-gemini-pipeline.plan.md
> 원본 TASK: .claude/tasks/TASK-DEEPGAZE-GEMINI-PIPELINE.md

---

## 1. 데이터 모델

### 1.1 DB 스키마 변경

#### creative_media 테이블 — 신규 컬럼 2개

```sql
-- saliency_data: DeepGaze 좌표/비율 (이미지 소재용)
ALTER TABLE creative_media
  ADD COLUMN IF NOT EXISTS saliency_data JSONB DEFAULT NULL;

COMMENT ON COLUMN creative_media.saliency_data
  IS 'DeepGaze III 시선 분석 결과 (영역별 비율, 주목점 좌표). 이미지 전용.';

-- video_saliency_frames: 영상 프레임별 시선 데이터
ALTER TABLE creative_media
  ADD COLUMN IF NOT EXISTS video_saliency_frames JSONB DEFAULT NULL;

COMMENT ON COLUMN creative_media.video_saliency_frames
  IS 'DeepGaze III 프레임별 시선 분석 (0초,3초,6초... 간격). VIDEO 전용.';
```

기존 컬럼과의 관계:
| 컬럼 | 상태 | 용도 |
|------|------|------|
| `saliency_url` | 기존 (97% 채움) | DeepGaze 히트맵 이미지 URL |
| `saliency_data` | **신규** | DeepGaze 영역별 비율 + 주목점 좌표 JSON |
| `video_saliency_frames` | **신규** | 영상 프레임별(3초 간격) 시선 데이터 JSON |
| `analysis_json` | 기존 (16% 채움) | Gemini 5축 분석 결과 JSON |

### 1.2 DeepGaze 결과 데이터 구조 (JSON 스키마)

#### 이미지 소재 — saliency_data

```json
{
  "model": "deepgaze-iie",
  "analyzed_at": "2026-03-25T10:00:00Z",
  "image_size": { "width": 1080, "height": 1080 },
  "regions": {
    "text": 0.65,
    "human_face": 0.20,
    "product": 0.10,
    "background": 0.05
  },
  "top_fixations": [
    { "x": 0.50, "y": 0.30, "weight": 0.90, "label": "텍스트" },
    { "x": 0.30, "y": 0.55, "weight": 0.70, "label": "인물" },
    { "x": 0.70, "y": 0.80, "weight": 0.50, "label": "CTA" }
  ],
  "peak_point": { "x": 0.50, "y": 0.30 },
  "entropy": 3.2,
  "cognitive_load": "medium"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `regions` | Object | 영역별 시선 비율 합계 (합 = 1.0) |
| `top_fixations` | Array | 상위 3~5개 주목점 (x/y: 0.0~1.0 비율, weight: 주목도) |
| `peak_point` | Object | 최고 주목점 좌표 |
| `entropy` | Number | 시선 분산도 (낮을수록 집중) |
| `cognitive_load` | String | low/medium/high (entropy 기반 판정) |

#### 영상 소재 — video_saliency_frames

```json
{
  "model": "deepgaze-iie",
  "analyzed_at": "2026-03-25T10:00:00Z",
  "frame_interval_sec": 3,
  "total_frames": 5,
  "frames": [
    {
      "timestamp": 0,
      "regions": {
        "human_face": 0.70,
        "text": 0.20,
        "product": 0.05,
        "background": 0.05
      },
      "top_fixations": [
        { "x": 0.45, "y": 0.35, "weight": 0.92, "label": "인물" }
      ],
      "peak_point": { "x": 0.45, "y": 0.35 },
      "cognitive_load": "low"
    },
    {
      "timestamp": 3,
      "regions": {
        "text": 0.65,
        "product": 0.20,
        "human_face": 0.10,
        "background": 0.05
      },
      "top_fixations": [
        { "x": 0.50, "y": 0.30, "weight": 0.85, "label": "텍스트" },
        { "x": 0.60, "y": 0.70, "weight": 0.60, "label": "제품" }
      ],
      "peak_point": { "x": 0.50, "y": 0.30 },
      "cognitive_load": "medium"
    }
  ],
  "summary": {
    "dominant_region_by_time": {
      "0-3": "human_face",
      "3-6": "text",
      "6-9": "product"
    },
    "attention_shift_pattern": "인물→텍스트→제품 순서로 시선 이동"
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `frame_interval_sec` | Number | 프레임 추출 간격 (3초) |
| `frames[]` | Array | 각 프레임별 시선 분석 결과 |
| `frames[].timestamp` | Number | 초 단위 (0, 3, 6, 9, ...) |
| `frames[].regions` | Object | 해당 프레임의 영역별 시선 비율 |
| `summary.dominant_region_by_time` | Object | 시간대별 지배 영역 요약 |
| `summary.attention_shift_pattern` | String | 시선 이동 패턴 한줄 요약 |

---

## 2. API/엔드포인트 설계

### 2.1 소재 DeepGaze 시선 분석 (크론: creative-saliency 확장)

**파일**: `src/app/api/cron/creative-saliency/route.ts`
**변경 유형**: 기존 크론 확장

현재 동작:
- creative_media에서 saliency_url IS NULL인 IMAGE 조회
- Cloud Run `/saliency` 호출 → 히트맵 이미지 URL 저장

추가 동작:
- `/saliency` 응답에서 좌표/비율 JSON도 수신
- `creative_media.saliency_data` 컬럼에 저장
- content_hash 기반 saliency_data 재사용 (기존 saliency_url 재사용 로직과 동일 패턴)

```
[기존]
creative_media → Cloud Run /saliency → saliency_url 저장

[변경]
creative_media → Cloud Run /saliency → saliency_url + saliency_data 저장
```

#### Cloud Run /saliency 응답 확장 (creative-pipeline 측)

현재 응답:
```json
{ "attention_map_url": "gs://...", "analyzed": 50, "skipped": 10 }
```

필요한 응답 확장:
```json
{
  "attention_map_url": "gs://...",
  "saliency_data": {
    "regions": { "text": 0.65, "human_face": 0.20, ... },
    "top_fixations": [...],
    "peak_point": { "x": 0.50, "y": 0.30 },
    "entropy": 3.2,
    "cognitive_load": "medium"
  },
  "analyzed": 50,
  "skipped": 10
}
```

> **참고**: creative-pipeline(Python) 서버 코드 수정은 이 TASK 범위에 포함.
> DeepGaze predict.py에서 이미 saliency map을 계산하므로, 거기서 좌표/비율 추출 후 JSON으로 반환하면 됨.

### 2.2 영상 DeepGaze 프레임별 분석 (크론: video-saliency 확장)

**파일**: `src/app/api/cron/video-saliency/route.ts`
**변경 유형**: 기존 크론 확장

추가 동작:
- 영상에서 3초 간격 프레임 추출 (ffmpeg 또는 creative-pipeline 내부)
- 각 프레임을 DeepGaze에 개별 분석
- 프레임별 결과를 `creative_media.video_saliency_frames`에 저장
- summary 객체 자동 생성 (시간대별 dominant_region 계산)

```
VIDEO 소재 → 프레임 추출 (0초, 3초, 6초, 9초, 12초, 15초)
→ 각 프레임 DeepGaze III 분석
→ video_saliency_frames JSON 저장
```

### 2.3 Gemini 결합 분석 (Cloud Run Job: analyze-five-axis 수정)

**파일**: `scripts/analyze-five-axis.mjs`
**변경 유형**: 프롬프트 수정 + 데이터 조회 로직 추가

변경 흐름:
1. creative_media 조회 시 `saliency_data`, `video_saliency_frames` 함께 SELECT
2. saliency_data가 있으면 → DeepGaze 주입 프롬프트 사용
3. saliency_data가 없으면 → 기존 프롬프트 사용 (fallback)
4. 영상: video_saliency_frames가 있으면 → 시간대별 시선 데이터 주입

### 2.4 LP DeepGaze 결합 분석 (Cloud Run Job: analyze-lps-v2 수정)

**파일**: `scripts/analyze-lps-v2.mjs`
**변경 유형**: 프롬프트 수정 + DeepGaze 데이터 조회 추가

변경 흐름:
1. lp_analysis 조회 시 `eye_tracking` 데이터 확인
2. LP 스크린샷의 DeepGaze 히트맵이 있으면 → 결합 분석 프롬프트 사용
3. CTA 영역 시선 집중도, 핵심 오퍼 영역 주목도를 Gemini에 전달
4. Gemini가 시선 데이터 기반으로 LP 효과 판단

---

## 3. Gemini 프롬프트 설계

### 3.1 이미지 소재 프롬프트 (DeepGaze 데이터 포함)

기존 `IMAGE_PROMPT_V3`에 DeepGaze 컨텍스트 블록을 **앞에** 추가:

```
[시선 분석 데이터 (DeepGaze III — 실측 기반)]
아래는 이 소재에 대한 객관적 시선 추적 분석 결과입니다.
이 데이터를 참고하여 소재를 분석하세요.

- 주목 영역 비율:
  텍스트: 65%
  인물 얼굴: 20%
  제품: 10%
  기타: 5%

- 최고 주목점: (x=0.50, y=0.30) — 중앙 상단
- 인지 부하: medium (시선이 약간 분산)
- 히트맵 이미지: (첨부)

위 시선 데이터를 참고해서 이 소재의 분석을 진행하라.
특히 다음을 판단하라:
1. 시선이 집중되는 곳과 핵심 메시지가 일치하는가?
2. CTA 영역에 충분한 시선이 가는가?
3. 시선 분산이 과도하지 않은가 (인지 부하)?

---
(아래 기존 IMAGE_PROMPT_V3 이어서)
이 광고 소재 이미지를 분석해서 아래 JSON 스키마에 맞춰 출력하라...
```

**데이터 주입 형식** (코드에서 동적 생성):

```javascript
function buildDeepGazeContext(saliencyData) {
  if (!saliencyData) return ''; // fallback: 주입 없음

  const { regions, peak_point, cognitive_load } = saliencyData;

  let ctx = `[시선 분석 데이터 (DeepGaze III — 실측 기반)]\n`;
  ctx += `아래는 이 소재에 대한 객관적 시선 추적 분석 결과입니다.\n\n`;
  ctx += `- 주목 영역 비율:\n`;

  for (const [region, pct] of Object.entries(regions)) {
    ctx += `  ${region}: ${Math.round(pct * 100)}%\n`;
  }

  ctx += `\n- 최고 주목점: (x=${peak_point.x}, y=${peak_point.y})\n`;
  ctx += `- 인지 부하: ${cognitive_load}\n\n`;
  ctx += `위 시선 데이터를 참고해서 이 소재를 분석하라.\n`;
  ctx += `시선이 집중되는 곳과 핵심 메시지가 일치하는지,\n`;
  ctx += `CTA에 충분한 시선이 가는지 판단하라.\n\n---\n\n`;

  return ctx;
}
```

### 3.2 영상 소재 프롬프트 (시간대별 시선 데이터 포함)

기존 `VIDEO_PROMPT_V3`에 시간대별 DeepGaze 컨텍스트 블록 추가:

```
[시선 분석 데이터 (DeepGaze III — 프레임별 실측)]
이 영상의 3초 간격 시선 추적 결과입니다.

[0초 — 오프닝/훅]
- 주목 영역: 인물 얼굴 70%, 텍스트 20%, 기타 10%
- 최고 주목점: (x=0.45, y=0.35) — 인물 얼굴 중심

[3초]
- 주목 영역: 텍스트 65%, 제품 20%, 인물 10%, 기타 5%
- 최고 주목점: (x=0.50, y=0.30) — 중앙 상단 텍스트

[6초]
- 주목 영역: 제품 55%, 텍스트 25%, CTA 15%, 기타 5%
- 최고 주목점: (x=0.60, y=0.50) — 제품 영역

시선 이동 패턴: 인물→텍스트→제품 순서로 시선 이동

위 시간대별 시선 데이터를 참고해서 이 영상을 분석하라.
특히 다음을 판단하라:
1. 0초 훅에서 시선을 효과적으로 잡는가?
2. 핵심 메시지 시점에 시선이 맞는가?
3. CTA 시점에 시선이 CTA 영역으로 이동하는가?

---
(아래 기존 VIDEO_PROMPT_V3 이어서)
```

**데이터 주입 형식** (코드에서 동적 생성):

```javascript
function buildVideoDeepGazeContext(videoSaliencyFrames) {
  if (!videoSaliencyFrames || !videoSaliencyFrames.frames?.length) return '';

  let ctx = `[시선 분석 데이터 (DeepGaze III — 프레임별 실측)]\n`;
  ctx += `이 영상의 ${videoSaliencyFrames.frame_interval_sec}초 간격 시선 추적 결과입니다.\n\n`;

  for (const frame of videoSaliencyFrames.frames) {
    ctx += `[${frame.timestamp}초]\n`;
    ctx += `- 주목 영역: `;
    const sorted = Object.entries(frame.regions)
      .sort((a, b) => b[1] - a[1]);
    ctx += sorted.map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ') + '\n';
    if (frame.peak_point) {
      ctx += `- 최고 주목점: (x=${frame.peak_point.x}, y=${frame.peak_point.y})\n`;
    }
    ctx += '\n';
  }

  if (videoSaliencyFrames.summary?.attention_shift_pattern) {
    ctx += `시선 이동 패턴: ${videoSaliencyFrames.summary.attention_shift_pattern}\n\n`;
  }

  ctx += `위 시간대별 시선 데이터를 참고해서 이 영상을 분석하라.\n`;
  ctx += `0초 훅의 시선 포착 효과, 핵심 메시지와 시선 일치도,\n`;
  ctx += `CTA 시점 시선 이동을 판단하라.\n\n---\n\n`;

  return ctx;
}
```

### 3.3 LP 분석 프롬프트 (히트맵 + HTML)

기존 `analyze-lps-v2.mjs`의 `buildPrompt()`에 DeepGaze 컨텍스트 추가:

```
[LP 시선 분석 데이터 (DeepGaze III)]
이 랜딩 페이지 스크린샷에 대한 시선 추적 분석 결과입니다.

- CTA 버튼 영역 시선 집중도: 35%
- 가격/오퍼 영역 시선 집중도: 25%
- Hero 이미지 시선 집중도: 20%
- 리뷰/사회적 증거 영역 시선 집중도: 15%
- 기타: 5%

- 히트맵 이미지: (첨부)

위 시선 데이터를 참고해서 이 LP를 분석하라.
특히 다음을 판단하라:
1. CTA 버튼에 시선이 충분히 가는가?
2. 핵심 오퍼/가격에 주목하는가?
3. 사회적 증거(리뷰)가 시선을 끄는 위치에 있는가?

---
(아래 기존 LP 분석 프롬프트 이어서)
```

---

## 4. 크론 작업 설계

### 4.1 creative-saliency (기존 크론 확장)

**파일**: `src/app/api/cron/creative-saliency/route.ts`
**Cloud Scheduler**: `creative-saliency` → **19:00 KST** (기존 시간에서 변경)

변경 사항:
1. Cloud Run `/saliency` 호출 시 `include_data: true` 파라미터 추가
2. 응답에서 `saliency_data` JSON 수신
3. `creative_media.saliency_data` UPDATE 추가
4. content_hash 기반 saliency_data 재사용 로직 추가 (기존 saliency_url 재사용과 동일 패턴)

```typescript
// 기존: saliency_url만 업데이트
await svc.from("creative_media")
  .update({ saliency_url: mapUrl })
  .eq("id", row.id);

// 변경: saliency_url + saliency_data 함께 업데이트
await svc.from("creative_media")
  .update({
    saliency_url: mapUrl,
    saliency_data: result.saliency_data ?? null,
  })
  .eq("id", row.id);
```

### 4.2 video-saliency (기존 크론 확장)

**파일**: `src/app/api/cron/video-saliency/route.ts`
**Cloud Scheduler**: `video-saliency` → **19:00 KST** (creative-saliency와 동시)

변경 사항:
1. 영상 프레임 추출 요청 (0초, 3초, 6초, 9초, 12초, 15초)
2. 각 프레임에 대해 DeepGaze 분석 실행
3. 프레임별 결과를 `video_saliency_frames` JSON으로 조합
4. `creative_media.video_saliency_frames` UPDATE
5. summary 객체 자동 생성 (dominant_region_by_time 계산)

### 4.3 analyze-five-axis (수정)

**파일**: `scripts/analyze-five-axis.mjs`
**Cloud Scheduler**: `five-axis-batch` → **01:00 KST** (기존 시간에서 변경)

변경 사항:
1. creative_media SELECT에 `saliency_data`, `video_saliency_frames` 추가
2. `buildDeepGazeContext()` 함수 신규 추가
3. `buildVideoDeepGazeContext()` 함수 신규 추가
4. Gemini 호출 시:
   - IMAGE: `buildDeepGazeContext(saliency_data) + IMAGE_PROMPT_V3`
   - VIDEO: `buildVideoDeepGazeContext(video_saliency_frames) + VIDEO_PROMPT_V3`
5. saliency_data가 NULL이면 기존 프롬프트만 사용 (graceful fallback)
6. 히트맵 이미지도 Gemini에 함께 전달 (multimodal: 소재 원본 + 히트맵)

```javascript
// Gemini 호출 (이미지)
const deepGazeCtx = buildDeepGazeContext(item.saliency_data);
const parts = [];

// 1) DeepGaze 히트맵 이미지 (있으면)
if (item.saliency_url) {
  parts.push({ inline_data: { mime_type: "image/png", data: heatmapBase64 } });
}
// 2) 소재 원본 이미지
parts.push({ inline_data: { mime_type: imageMime, data: imageBase64 } });
// 3) 텍스트 프롬프트 (DeepGaze 컨텍스트 + 기존 프롬프트)
parts.push({ text: deepGazeCtx + IMAGE_PROMPT_V3 });
```

### 4.4 analyze-lps-v2 (수정)

**파일**: `scripts/analyze-lps-v2.mjs`
**Cloud Scheduler**: 기존 스케줄 유지

변경 사항:
1. lp_analysis 조회 시 `eye_tracking` 데이터 함께 조회
2. `buildLPDeepGazeContext()` 함수 신규 추가
3. LP 스크린샷의 DeepGaze 히트맵이 있으면 multimodal 전달 (스크린샷 + 히트맵)
4. Gemini에 CTA/오퍼/리뷰 영역 시선 데이터 주입

---

## 5. 에러 처리

### DeepGaze 파이프라인 실패 시 fallback

| 실패 시나리오 | 처리 방식 |
|-------------|----------|
| Cloud Run /saliency 응답에 saliency_data 없음 | saliency_data = NULL, saliency_url만 저장 (기존 동작) |
| Cloud Run /saliency 전체 실패 (500/timeout) | 해당 account 스킵 → 다음 account 진행, 에러 로그 |
| 영상 프레임 추출 실패 | 해당 프레임 스킵, 가용 프레임만으로 video_saliency_frames 생성 |
| 전체 프레임 추출 실패 | video_saliency_frames = NULL, analyze-five-axis에서 기존 프롬프트 사용 |
| saliency_data NULL인 소재의 Gemini 분석 | **기존 프롬프트로 분석 진행** (DeepGaze 컨텍스트 없이) |
| 히트맵 이미지 다운로드 실패 | 텍스트 데이터만 주입 (히트맵 이미지 없이) |

**핵심 원칙**: DeepGaze 데이터가 없어도 Gemini 분석은 중단되지 않는다. 기존 동작이 fallback.

### Gemini API 실패 시 재시도

| 실패 시나리오 | 처리 방식 |
|-------------|----------|
| Gemini 429 (Rate Limit) | exponential backoff (4초 → 8초 → 16초), 최대 3회 재시도 |
| Gemini 500/503 | 동일 재시도 |
| Gemini 응답 JSON 파싱 실패 | 마크다운 제거 → regex 추출 → 실패 시 스킵 |
| 프롬프트 길이 초과 (DeepGaze 데이터 포함 시) | saliency_data 요약본으로 축소 (top_fixations 상위 3개만) |

---

## 6. 구현 순서 (CTO팀용 체크리스트)

### Wave 1: DB 스키마 + DeepGaze 데이터 저장 (Day 1)

- [ ] **T1-1**: SQL 마이그레이션 작성 — saliency_data, video_saliency_frames 컬럼 추가
- [ ] **T1-2**: Cloud SQL에 마이그레이션 적용
- [ ] **T1-3**: creative-pipeline(Python) /saliency 응답에 saliency_data JSON 추가
  - predict.py에서 saliency map → regions 비율 계산 + top_fixations 좌표 추출
  - 응답 JSON에 `saliency_data` 필드 추가
- [ ] **T1-4**: creative-saliency 크론 수정 — saliency_data 저장 로직 추가
- [ ] **T1-5**: creative-pipeline /saliency 엔드포인트에 영상 프레임별 분석 기능 추가
  - 영상 → ffmpeg 프레임 추출 (0초, 3초, 6초...) → 각 프레임 DeepGaze
  - 프레임별 결과 JSON 반환
- [ ] **T1-6**: video-saliency 크론 수정 — video_saliency_frames 저장 로직 추가

**파일 경계**:
- backend-dev: `supabase/migrations/`, `src/app/api/cron/creative-saliency/route.ts`, `src/app/api/cron/video-saliency/route.ts`
- creative-pipeline(Python): `predict.py` (별도 리포지토리)

### Wave 2: Gemini 프롬프트 수정 + 결합 분석 (Day 2)

- [ ] **T2-1**: `buildDeepGazeContext()` 함수 작성 (이미지용)
- [ ] **T2-2**: `buildVideoDeepGazeContext()` 함수 작성 (영상용)
- [ ] **T2-3**: analyze-five-axis.mjs SELECT 쿼리에 saliency_data, video_saliency_frames 추가
- [ ] **T2-4**: Gemini 호출 시 DeepGaze 컨텍스트 주입 로직 (fallback 포함)
- [ ] **T2-5**: 히트맵 이미지 multimodal 전달 로직 (소재 원본 + 히트맵 동시 전달)
- [ ] **T2-6**: 샘플 10건 테스트 — Gemini 단독 vs 결합 결과 비교 확인

**파일 경계**:
- backend-dev: `scripts/analyze-five-axis.mjs`

### Wave 3: LP 결합 분석 (Day 3)

- [ ] **T3-1**: `buildLPDeepGazeContext()` 함수 작성
- [ ] **T3-2**: analyze-lps-v2.mjs에 LP DeepGaze 데이터 조회 + 주입 로직 추가
- [ ] **T3-3**: LP 히트맵 이미지 multimodal 전달 로직
- [ ] **T3-4**: 샘플 5건 LP 결합 분석 테스트

**파일 경계**:
- backend-dev: `scripts/analyze-lps-v2.mjs`

### Wave 4: 크론 스케줄 변경 + 배치 실행 + 검증 (Day 3-4)

- [ ] **T4-1**: Cloud Scheduler 크론 시간 변경
  - creative-saliency: → 19:00 KST
  - video-saliency: → 19:00 KST
  - five-axis-batch: → 01:00 KST
- [ ] **T4-2**: 기존 saliency_url은 있지만 saliency_data가 NULL인 소재 배치 처리 (backfill)
  - 대상: ~2,926건 (saliency_url IS NOT NULL AND saliency_data IS NULL)
- [ ] **T4-3**: 영상 소재 video_saliency_frames 배치 처리
  - 대상: ~152건 (VIDEO 타입)
- [ ] **T4-4**: DeepGaze 결합 5축 분석 전체 배치 실행
  - 대상: ~3,022건 (analysis_json 재분석 또는 미분석)
- [ ] **T4-5**: LP DeepGaze 결합 분석 배치 실행
  - 대상: ~216건 LP
- [ ] **T4-6**: 결과 검증
  - saliency_data 채움률 95%+ 확인
  - video_saliency_frames 채움률 90%+ 확인
  - 샘플 비교: Gemini 단독 vs 결합 정확도 개선 확인
- [ ] **T4-7**: tsc + build + lint 통과 확인

---

## 7. Executive Summary

이 설계서는 Smith님 확정 8단계 파이프라인에 따라 DeepGaze III 시선 분석을 Gemini 분석 **앞으로**
이동시키는 결합 파이프라인의 구현 상세를 정의한다.

**DB**: creative_media에 saliency_data(JSONB), video_saliency_frames(JSONB) 2개 컬럼 추가.
기존 saliency_url(히트맵 이미지)과 별도로, 영역별 시선 비율/좌표/인지부하 데이터를 구조화 저장.

**프롬프트**: analyze-five-axis.mjs의 IMAGE_PROMPT_V3, VIDEO_PROMPT_V3 앞에 DeepGaze
컨텍스트 블록을 동적 주입. saliency_data가 NULL이면 기존 프롬프트로 graceful fallback.
히트맵 이미지도 multimodal로 Gemini에 함께 전달.

**LP**: analyze-lps-v2.mjs에도 동일 패턴 적용. LP 스크린샷 히트맵 + 시선 데이터를 Gemini에 주입.

**크론**: creative-saliency/video-saliency 19:00 → analyze-five-axis 01:00 (6시간 간격).
DeepGaze 완료를 충분히 보장한 후 Gemini 분석 실행.

**현재 갭**:
| 항목 | 현재 상태 | 목표 |
|------|----------|------|
| saliency_url (히트맵 이미지) | 2,926건 (97%) | 유지 |
| saliency_data (좌표/비율 JSON) | 0건 (0%) | 95%+ |
| video_saliency_frames | 0건 (0%) | 90%+ |
| Gemini 5축 (DeepGaze 결합) | 0건 (0%) | 95%+ |
| LP 결합 분석 | 0건 (0%) | 80%+ |

**Wave 구성**: DB+저장(1일) → 프롬프트+결합(1일) → LP(1일) → 배치+검증(1-2일) = 총 4-5일
