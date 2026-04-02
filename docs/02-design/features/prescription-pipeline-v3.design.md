# Design: 처방 파이프라인 V3 — 분석 구조 개선

> 작성일: 2026-04-03
> 작성자: PM
> 레벨: L2-기능
> 선행: prescription-pipeline-as-is.report.md (As-Is 분석 완료)
> 참조: prescription-system-v2.design.md (V2 엔진 설계)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 기능 | 처방 파이프라인 V3 — Gemini 입력 강화 + 영상 멀티모달 + 5축 통합 |
| 시작일 | 2026-04-03 |
| 대상 파일 | prescription-engine.ts, prescription-prompt.ts |
| 개선 3건 | (1) 씬분석→INPUT, (2) 영상 직접 시청, (3) analyze-five-axis 통합 |
| TDD 케이스 | PV3-001 ~ PV3-035 (35건) |

| 관점 | 내용 |
|------|------|
| **문제** | Gemini가 이미 분석된 씬 데이터를 못 보고, 영상은 URL 텍스트만 받고, 신규 소재는 처방 자체가 차단됨 |
| **해결** | (1) 기존 씬분석을 프롬프트에 주입, (2) File API로 영상 직접 전달, (3) NO_ANALYSIS 차단 제거 |
| **핵심 가치** | 처방 정확도↑ + 영상 소재 분석 품질↑ + 파이프라인 끊김 1곳 해소 |

---

## 1. 현행 문제점 (As-Is)

### 1.1 씬분석 데이터 미활용

```
video-scene-analysis cron
  → creative_media.analysis_json.scene_analysis  ✅ 저장됨

prescription-engine step2
  → creative_media.video_analysis.scene_analysis  ❌ 잘못된 컬럼 참조 (BUG)
  → buildPrescriptionPrompt에 sceneAnalysis 미전달  ❌ 프롬프트에 안 들어감
```

**결과**: Gemini가 매번 영상을 새로 분석. 이미 분석된 씬 데이터(씬 타입, DeepGaze, hook_strength, message_clarity)를 참조하지 못함.

### 1.2 영상 소재 Gemini 미시청

```typescript
// prescription-prompt.ts buildMediaPart (현행)
if (mediaType === 'VIDEO') {
  // 영상: URL 텍스트로 전달
  return { text: `[영상 소재 URL: ${url}]` };
}
```

**결과**: Gemini가 영상 내용을 실제로 볼 수 없음. 텍스트 URL만 받으므로 시각적 분석이 ad_copy + DeepGaze 수치에만 의존.

대조: `video-scene-analysis` cron은 `inline_data` (base64 video/mp4)로 영상 전달 → Gemini가 실제로 봄.

### 1.3 analyze-five-axis 수동 차단

```typescript
// prescription-engine.ts step1 (현행)
if (!media.analysis_json) {
  throw new PrescriptionError(
    '이 소재는 아직 분석되지 않았습니다.',
    422, 'NO_ANALYSIS'
  );
}
```

**결과**: `analyze-five-axis.mjs` (수동 스크립트)를 먼저 돌려야 처방 가능. 파이프라인 끊김 #1의 원인.

Gemini 처방 호출 자체가 `five_axis`를 출력하므로, 별도 5축 분석 단계가 사실상 중복.

---

## 2. 개선 설계

### 2.1 개선 1: 씬분석 결과 → Gemini SECTION 2 주입

#### 2.1.1 step2 버그 수정

```typescript
// prescription-engine.ts step2_fetchSaliencyData 수정

// AS-IS (BUG): video_analysis 컬럼에서 scene_analysis 읽기
sceneAnalysis = (videoData as any)?.video_analysis?.scene_analysis ?? null;

// TO-BE: analysis_json 컬럼에서 scene_analysis 읽기
const { data: cmData } = await svc
  .from('creative_media')
  .select('analysis_json')
  .eq('id', creativeMediaId)
  .single();
sceneAnalysis = (cmData as any)?.analysis_json?.scene_analysis ?? null;
```

> step1에서 이미 `analysis_json` 조회하므로, step2에서 중복 쿼리 대신 step1 결과를 파라미터로 전달하는 것이 더 효율적. §2.1.3 참조.

#### 2.1.2 buildPrescriptionPrompt에 sceneAnalysis 전달

```typescript
// AS-IS: sceneAnalysis 파라미터 없음
export async function buildPrescriptionPrompt(input: {
  media: any;
  saliency: any;
  performanceBacktrack: PerformanceBacktrackInput | null;
  // ... (sceneAnalysis 없음)
}): Promise<GeminiPromptParts>

// TO-BE: sceneAnalysis 파라미터 추가
export async function buildPrescriptionPrompt(input: {
  media: any;
  saliency: any;
  sceneAnalysis: SceneAnalysisData | null;  // ← 추가
  performanceBacktrack: PerformanceBacktrackInput | null;
  // ...
}): Promise<GeminiPromptParts>
```

#### 2.1.3 SECTION 2에 씬분석 데이터 삽입

`buildSection2_Evidence` 함수에 씬분석 서브섹션 추가:

```typescript
function buildSection2_Evidence(input: {
  media: any;
  saliency: any;
  sceneAnalysis: SceneAnalysisData | null;  // ← 추가
  hasPerformanceData: boolean;
}): string {
  const lines: string[] = [
    '## [SECTION 2: 증거 자료]',
    '',
  ];

  // ... (기존 광고 카피, 소재 정보, DeepGaze 시선 분석)

  // 씬분석 데이터 (VIDEO만 — 이미 분석된 데이터 참조)
  if (input.sceneAnalysis && input.sceneAnalysis.scenes?.length > 0) {
    lines.push('### 사전 분석된 씬 데이터 (참조용)');
    lines.push('아래는 이 영상을 사전 분석한 결과입니다. 참고하여 더 정확하게 분석하세요.');
    lines.push('');

    for (const scene of input.sceneAnalysis.scenes) {
      lines.push(`**${scene.time}** [${scene.type}]`);
      lines.push(`- 설명: ${scene.desc}`);
      if (scene.analysis) {
        lines.push(`- 훅 강도: ${(scene.analysis.hook_strength * 100).toFixed(0)}%`);
        lines.push(`- 주목도: ${scene.analysis.attention_quality}`);
        lines.push(`- 메시지 명확도: ${scene.analysis.message_clarity}`);
        if (scene.analysis.improvement) {
          lines.push(`- 개선 제안: ${scene.analysis.improvement}`);
        }
      }
      if (scene.deepgaze) {
        const dg = scene.deepgaze;
        lines.push(`- DeepGaze 시선: ${dg.dominant_region} (고정점 ${dg.fixation_count}개, CTA 가시: ${dg.cta_visible ? '예' : '아니오'})`);
      }
      lines.push('');
    }

    if (input.sceneAnalysis.overall) {
      lines.push(`**전체**: ${input.sceneAnalysis.overall.total_scenes}개 씬, 훅 효과=${input.sceneAnalysis.overall.hook_effective ? '유효' : '미흡'}, CTA 도달=${input.sceneAnalysis.overall.cta_reached ? '도달' : '미도달'}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
```

#### 2.1.4 step1→step2 파라미터 최적화

step1에서 이미 `analysis_json`을 조회하므로, step2에 별도 쿼리 없이 전달:

```typescript
// AS-IS: step2에서 creative_media.video_analysis 다시 조회
const { data: videoData } = await svc
  .from('creative_media')
  .select('video_analysis')
  .eq('id', creativeMediaId)
  .single();

// TO-BE: step1 결과에서 바로 전달
async function step2_fetchSaliencyData(
  svc: DbClient,
  creativeMediaId: string,
  mediaType: string,
  analysisJson: AnalysisJsonV3 | null  // ← step1 결과 전달
) {
  // ...
  let sceneAnalysis = null;
  if (mediaType === 'VIDEO' && analysisJson) {
    sceneAnalysis = analysisJson.scene_analysis ?? null;
  }
  // ... (video_analysis 별도 조회 제거)
}
```

**DB 쿼리 절약**: step2의 `creative_media` 조회 1건 제거.

#### 2.1.5 SceneAnalysisData 타입

이미 `src/types/prescription.ts`에 `AnalysisJsonV3.scene_analysis` 정의됨 (scenes + overall 구조). 별도 타입 추가 불필요 — 기존 타입 재활용:

```typescript
type SceneAnalysisData = NonNullable<AnalysisJsonV3['scene_analysis']>;
```

---

### 2.2 개선 2: 영상 소재 Gemini 멀티모달 직접 시청

#### 2.2.1 방식 비교

| 방식 | 장점 | 단점 |
|------|------|------|
| **A. inline_data (base64)** | 구현 간단, 추가 API 불필요 | 영상 크기 제한 (20MB), 프롬프트 크기 증가 |
| **B. Gemini File API** | 대용량 지원 (2GB), file_uri 재사용 가능 | 업로드 2단계 (upload→reference), API 추가 호출 |
| **C. GCS URI** | 업로드 불필요 (이미 GCS에 있음) | Gemini가 직접 GCS 읽기 불가 (인증 문제) |

**결정: B. Gemini File API 사용**

이유:
1. 광고 영상은 보통 15~60초, 10~50MB → inline_data 20MB 제한 초과 가능
2. 같은 영상을 재분석할 때 file_uri 재사용 가능 (캐시 효과)
3. `video-scene-analysis` cron이 inline_data 사용하지만, 그쪽은 30개 배치 제한 + 영상 크기가 작은 경우만 성공
4. File API는 업로드 후 48시간 유효 → 재처방 시 재업로드 불필요

#### 2.2.2 File API 통합 설계

```typescript
// src/lib/protractor/gemini-file-uploader.ts (신규)

const FILE_API_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const FILE_STATUS_BASE = 'https://generativelanguage.googleapis.com/v1beta/files';

interface GeminiFileRef {
  name: string;      // files/{id}
  uri: string;       // Gemini file URI
  mimeType: string;
  expiresAt: string; // 48시간 후
}

/**
 * GCS URL → Gemini File API 업로드
 * 1. GCS에서 영상 다운로드 (storage_url)
 * 2. Gemini File API에 업로드
 * 3. 처리 완료 대기 (polling)
 * 4. file_uri 반환
 */
export async function uploadVideoToGemini(
  videoUrl: string,
  mimeType = 'video/mp4'
): Promise<GeminiFileRef> {
  // 1. 영상 다운로드
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`영상 다운로드 실패: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const sizeBytes = buffer.byteLength;

  // 2. Resumable upload 시작
  const initRes = await fetch(
    `${FILE_API_BASE}?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(sizeBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({ file: { display_name: `rx-${Date.now()}` } }),
    }
  );

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('File API 업로드 URL 획득 실패');

  // 3. 영상 업로드
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(sizeBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  });

  const fileInfo = await uploadRes.json();

  // 4. 처리 대기 (state === 'ACTIVE')
  let file = fileInfo.file;
  let attempts = 0;
  while (file.state === 'PROCESSING' && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(
      `${FILE_STATUS_BASE}/${file.name}?key=${GEMINI_API_KEY}`
    );
    file = await statusRes.json();
    attempts++;
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`영상 처리 실패: state=${file.state}`);
  }

  return {
    name: file.name,
    uri: file.uri,
    mimeType,
    expiresAt: file.expirationTime,
  };
}
```

#### 2.2.3 buildMediaPart 수정

```typescript
// prescription-prompt.ts buildMediaPart 수정

import { uploadVideoToGemini } from './gemini-file-uploader';

async function buildMediaPart(
  media: any
): Promise<object | null> {
  const url = media.storage_url || media.media_url;
  if (!url) return null;

  try {
    if (media.media_type === 'VIDEO') {
      // V3: File API로 영상 업로드 → file_uri 참조
      const fileRef = await uploadVideoToGemini(url);
      return {
        file_data: {
          mime_type: fileRef.mimeType,
          file_uri: fileRef.uri,
        },
      };
    }

    // 이미지: 기존 inline_data 유지
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.startsWith('image/')
      ? contentType.split(';')[0]
      : 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    return { inline_data: { mime_type: mimeType, data: base64Data } };
  } catch (err) {
    console.error('[buildMediaPart] 미디어 로드 실패:', err);
    // 영상 업로드 실패 시 기존 URL 텍스트 폴백
    if (media.media_type === 'VIDEO') {
      return { text: `[영상 소재 URL: ${url}] (영상 직접 분석 불가 — URL 참조)` };
    }
    return null;
  }
}
```

#### 2.2.4 타임아웃 조정

영상 업로드 + Gemini 처리 시간 증가 고려:

```typescript
// prescription-engine.ts
const TIMEOUT_MS = 120_000; // V3: 90초 → 120초 (영상 업로드 포함)
```

#### 2.2.5 비용 영향 분석

| 항목 | V2 (현행) | V3 (개선) | 차이 |
|------|----------|----------|------|
| 이미지 소재 | base64 전송, ~0.5MB | 동일 | 변경 없음 |
| 영상 소재 input | URL 텍스트 (~50 tokens) | File API (~$0.0006/초 × 영상길이) | 30초 영상 ≈ +$0.018 |
| Gemini Pro 호출 | 1회 (텍스트 only) | 1회 (텍스트+영상) | 영상 토큰 추가 |
| **30초 영상 1건** | **~$0.02** | **~$0.04** | **+$0.02 (+100%)** |
| **일일 100건** | **~$2.0** | **~$4.0** | **+$2.0/일** |
| **월간 3000건** | **~$60** | **~$120** | **+$60/월** |

> 비용 2배 증가하나, 영상 소재 처방 정확도가 "URL 텍스트만 보는 것"에서 "실제 영상을 보는 것"으로 질적 도약. Smith님이 "영상 못 보는 게 가장 큰 문제"로 지적.

#### 2.2.6 비용 최적화 옵션

1. **영상 업로드 캐시**: `creative_media.gemini_file_uri` 컬럼 추가 → 48시간 내 재처방 시 재업로드 생략
2. **조건부 업로드**: 영상 길이 60초 미만만 업로드, 이상은 URL 텍스트 폴백
3. **배치 제한**: cron 실행 시 영상 소재 처방 건수 제한 (일 50건)

---

### 2.3 개선 3: analyze-five-axis 단계 삭제 → run-prescription 통합

#### 2.3.1 NO_ANALYSIS 차단 제거

```typescript
// prescription-engine.ts step1_fetchCreativeMedia 수정

// AS-IS: analysis_json 없으면 422 에러
if (!media.analysis_json) {
  throw new PrescriptionError(
    '이 소재는 아직 분석되지 않았습니다.',
    422, 'NO_ANALYSIS'
  );
}

// TO-BE: analysis_json 없어도 빈 객체로 진행
const analysisJson: AnalysisJsonV3 = (media.analysis_json ?? {}) as AnalysisJsonV3;
```

#### 2.3.2 5축 의존 단계 방어 처리

`analysisJson`이 빈 객체일 때 각 step이 graceful하게 동작하도록 수정:

| Step | 현행 동작 | V3 수정 |
|------|----------|--------|
| step4 (패턴 조회) | `extractAttributes(analysisJson)` → 빈 배열 | 변경 없음 (이미 빈 배열 반환) |
| step5 (Andromeda) | `analyzeAccountDiversity(svc, accountId, id, analysisJson)` | 빈 analysisJson → 다양성 100점 반환 (변경 없음, 이미 try-catch) |
| step9 (역추적) | `buildPerformanceBacktrack(metrics, comparison, ...)` | `hasPerformanceData=false` → null (변경 없음) |
| step10 (프롬프트) | SECTION 2에 광고 카피 + 미디어 타입 표시 | 변경 없음 (null-safe) |
| step12 (후처리) | `buildPercentileMap(scoresRecord, ...)` | Gemini 출력 scores 사용 → 변경 없음 |
| **캐시 체크** | `analysisJson.top3_prescriptions` 존재 시 캐시 반환 | 빈 객체 → 캐시 없음 → 새로 생성 (정상) |

#### 2.3.3 Gemini 프롬프트 분기

성과 데이터 없는 신규 소재를 위한 프롬프트 분기:

```typescript
// buildPrescriptionPrompt 내부

// 성과 데이터 없는 경우: SECTION 1(문제 정의) 스킵, SECTION 2만으로 분석
if (!input.hasPerformanceData) {
  // SECTION 1 스킵 (기존 로직과 동일)
  // SECTION 2에 추가 안내:
  sections.push(buildSection2_Evidence({
    ...input,
    noPerformanceNote: '이 소재는 아직 성과 데이터가 없습니다. ' +
      '소재 자체의 시각/메시지/구조 분석에 집중하세요. ' +
      '성과 역추적 없이 축1(원론) + 축3(글로벌 벤치마크) 기반으로 처방하세요.',
  }));
}
```

#### 2.3.4 meta 필드 확장

```typescript
// V3 meta 추가 필드
interface PrescriptionMeta {
  // ... 기존 필드
  analysis_source: 'existing' | 'fresh';  // 기존 5축 사용 or 새로 생성
  video_multimodal: boolean;               // 영상 직접 분석 여부
  scene_analysis_injected: boolean;        // 씬분석 데이터 주입 여부
}
```

#### 2.3.5 파이프라인 변경 전/후

```
AS-IS:
  collect → embed → saliency → scene-analysis → [수동] analyze-five-axis → [수동] 후처리 → run-prescription

TO-BE:
  collect → embed → saliency → scene-analysis → run-prescription (5축 + 처방 통합)
                                                     ↑
                                              씬분석 데이터 주입
                                              영상 멀티모달 직접 시청
```

**끊김 1 해소**: `analyze-five-axis` 수동 단계 제거. `run-prescription`이 5축 분석도 수행.

---

## 3. 수정 대상 파일

| # | 파일 | 변경 유형 | 설명 |
|---|------|----------|------|
| 1 | `src/lib/protractor/prescription-engine.ts` | 수정 | step1 NO_ANALYSIS 제거, step2 컬럼 참조 수정, 타임아웃 120초 |
| 2 | `src/lib/protractor/prescription-prompt.ts` | 수정 | buildSection2에 씬분석 추가, buildMediaPart File API |
| 3 | `src/lib/protractor/gemini-file-uploader.ts` | **신규** | Gemini File API 업로드 + polling |
| 4 | `src/types/prescription.ts` | 수정 | PrescriptionMeta 확장, SceneAnalysisData alias |

---

## 4. 데이터 흐름 (V3)

```
┌──────────────┐
│ creative_media│
│              │
│ analysis_json │──→ scene_analysis (video-scene-analysis cron이 저장)
│ video_analysis│──→ DeepGaze 영상 요약 (Python Cloud Run이 저장)
│ storage_url   │──→ 영상 파일 (GCS)
│ embedding     │──→ 유사 검색
│ ad_copy       │──→ 텍스트
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│ prescription-engine V3 (13단계)                    │
│                                                    │
│ STEP 1: 소재 조회 (NO_ANALYSIS 차단 제거)          │
│ STEP 2: 시선 + 씬분석 조회 (analysis_json에서)     │
│ STEP 3: 성과 데이터 (없으면 graceful skip)         │
│ STEP 4-9: 패턴/벤치마크/EAR (기존과 동일)          │
│ STEP 10: 프롬프트 구성                              │
│   SECTION 1: 문제 정의 (성과 있을 때만)             │
│   SECTION 2: 증거 자료 + 씬분석 데이터 ← NEW       │
│   SECTION 3: 처방 근거 (3축)                        │
│   SECTION 4: 참조                                   │
│ STEP 11: Gemini 호출 (영상 File API) ← NEW         │
│ STEP 12-13: 후처리 + 조립                           │
└──────────────────────────────────────────────────┘
```

---

## 5. 에러 핸들링

### 5.1 File API 실패 시

```
영상 다운로드 실패 → URL 텍스트 폴백 (기존 V2 방식)
File API 업로드 실패 → URL 텍스트 폴백
File API 처리 타임아웃 (60초) → URL 텍스트 폴백
```

모든 File API 실패는 `console.error` 로깅 후 텍스트 폴백. 처방 자체는 중단하지 않음.

### 5.2 analysis_json 없는 소재

```
analysis_json = null → 빈 객체 {}로 진행
5축 = Gemini가 새로 생성 (기존에도 출력 스키마에 five_axis 포함)
scene_analysis = null → SECTION 2에서 생략
patterns = 빈 배열 → SECTION 3 축2 "데이터 부족"
캐시 = 없음 → 항상 새로 생성
```

### 5.3 성과 데이터 없는 소재

```
hasPerformanceData = false → SECTION 1 스킵
performanceBacktrack = null → 역추적 없음
처방 = 축1(원론) + 축3(글로벌 벤치마크) 기반
meta.has_performance_data = false
```

---

## 6. 시스템 프롬프트 보강

영상 멀티모달 + 씬분석 참조를 반영한 시스템 프롬프트 추가 지시:

```typescript
// PRESCRIPTION_SYSTEM_PROMPT에 추가

// V3 추가 지시:
// 7. 영상 소재가 첨부된 경우 반드시 영상을 직접 시청하고 분석하세요.
//    URL 텍스트만 있는 경우 시각 분석은 DeepGaze 데이터에 의존하세요.
// 8. SECTION 2에 사전 분석된 씬 데이터가 있으면 이를 참조하되,
//    직접 시청한 결과와 다른 부분이 있으면 직접 시청 결과를 우선하세요.
// 9. 성과 데이터가 없는 신규 소재도 분석 가능합니다.
//    이 경우 축1(원론)과 축3(글로벌 벤치마크) 기반으로 처방하세요.
```

---

## 7. 마이그레이션 계획

### 7.1 단계별 적용

| 단계 | 내용 | 리스크 | 롤백 |
|------|------|--------|------|
| **Phase 1** | 씬분석 주입 + 버그 수정 (§2.1) | 낮음 — 프롬프트 텍스트 추가만 | 조건분기 제거 |
| **Phase 2** | NO_ANALYSIS 제거 (§2.3) | 중간 — 신규 소재 처방 품질 확인 필요 | 조건 복원 |
| **Phase 3** | 영상 File API (§2.2) | 높음 — 비용 증가 + 타임아웃 영향 | 폴백 내장 |

### 7.2 기존 데이터 호환

- `analysis_json`에 이미 `five_axis`가 있는 소재: **캐시 반환** (기존과 동일)
- `analysis_json`이 없는 소재: **새로 생성** (V3 개선)
- `scene_analysis`가 없는 영상 소재: **SECTION 2에서 생략** (graceful)
- `analysis_json.scene_analysis`가 있는 영상: **프롬프트에 주입** (V3 개선)

---

## 8. TDD 매핑 테이블

### Phase 1: 씬분석 주입 + 버그 수정 (PV3-001 ~ PV3-012)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| PV3-001 | §2.1.1 | step2가 analysis_json.scene_analysis에서 씬 데이터 읽기 | prescription-engine.ts |
| PV3-002 | §2.1.1 | step2가 video_analysis.scene_analysis 읽지 않음 (BUG 수정 확인) | prescription-engine.ts |
| PV3-003 | §2.1.2 | buildPrescriptionPrompt에 sceneAnalysis 파라미터 전달 | prescription-prompt.ts |
| PV3-004 | §2.1.3 | SECTION 2에 씬분석 데이터 포함 (scenes 있을 때) | prescription-prompt.ts |
| PV3-005 | §2.1.3 | SECTION 2에 씬 없으면 씬 서브섹션 생략 | prescription-prompt.ts |
| PV3-006 | §2.1.3 | 씬분석 내 hook_strength, attention_quality 출력 확인 | prescription-prompt.ts |
| PV3-007 | §2.1.3 | 씬분석 내 deepgaze dominant_region, cta_visible 출력 확인 | prescription-prompt.ts |
| PV3-008 | §2.1.3 | 씬분석 overall (total_scenes, hook_effective, cta_reached) 출력 | prescription-prompt.ts |
| PV3-009 | §2.1.4 | step2가 step1 결과를 재사용 (DB 쿼리 1건 절약) | prescription-engine.ts |
| PV3-010 | §2.1.3 | 이미지 소재에는 씬분석 서브섹션 미포함 | prescription-prompt.ts |
| PV3-011 | §2.1.5 | SceneAnalysisData 타입이 AnalysisJsonV3.scene_analysis와 일치 | prescription.ts |
| PV3-012 | §6 | 시스템 프롬프트에 "사전 분석 씬 데이터 참조" 지시 포함 | prescription-prompt.ts |

### Phase 2: NO_ANALYSIS 제거 (PV3-013 ~ PV3-022)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| PV3-013 | §2.3.1 | analysis_json=null인 소재도 처방 생성 성공 | prescription-engine.ts |
| PV3-014 | §2.3.1 | analysis_json=null → 빈 객체 {}로 진행 | prescription-engine.ts |
| PV3-015 | §2.3.2 | step4 extractAttributes — 빈 analysisJson → 빈 배열 | prescription-engine.ts |
| PV3-016 | §2.3.2 | step5 Andromeda — 빈 analysisJson → diversityScore 100 | prescription-engine.ts |
| PV3-017 | §2.3.3 | hasPerformanceData=false → SECTION 1 스킵, 안내 메시지 포함 | prescription-prompt.ts |
| PV3-018 | §2.3.3 | 성과 없는 소재 → 축1+축3 기반 처방 (축2 "데이터 부족") | prescription-prompt.ts |
| PV3-019 | §2.3.4 | meta.analysis_source = 'fresh' (analysis_json 없을 때) | prescription-engine.ts |
| PV3-020 | §2.3.4 | meta.analysis_source = 'existing' (analysis_json 있을 때) | prescription-engine.ts |
| PV3-021 | §2.3.2 | 캐시 체크 — 빈 analysisJson → 캐시 미적용, 새로 생성 | prescription-engine.ts |
| PV3-022 | §6 | 시스템 프롬프트에 "성과 없는 신규 소재" 분석 지시 포함 | prescription-prompt.ts |

### Phase 3: 영상 File API (PV3-023 ~ PV3-035)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| PV3-023 | §2.2.2 | uploadVideoToGemini — resumable upload 시작 성공 | gemini-file-uploader.ts |
| PV3-024 | §2.2.2 | uploadVideoToGemini — 영상 업로드 + finalize 성공 | gemini-file-uploader.ts |
| PV3-025 | §2.2.2 | uploadVideoToGemini — state=PROCESSING → polling → ACTIVE | gemini-file-uploader.ts |
| PV3-026 | §2.2.2 | uploadVideoToGemini — 30회 polling 후 ACTIVE 안 되면 에러 | gemini-file-uploader.ts |
| PV3-027 | §2.2.3 | buildMediaPart VIDEO → file_data.file_uri 반환 | prescription-prompt.ts |
| PV3-028 | §2.2.3 | buildMediaPart IMAGE → 기존 inline_data 유지 | prescription-prompt.ts |
| PV3-029 | §2.2.3 | buildMediaPart VIDEO 업로드 실패 → URL 텍스트 폴백 | prescription-prompt.ts |
| PV3-030 | §2.2.4 | TIMEOUT_MS 120초 확인 | prescription-engine.ts |
| PV3-031 | §2.2.3 | buildMediaPart storage_url 우선 (media_url 폴백) | prescription-prompt.ts |
| PV3-032 | §5.1 | File API 다운로드 실패 → 텍스트 폴백 + console.error | prescription-prompt.ts |
| PV3-033 | §5.1 | File API 업로드 실패 → 텍스트 폴백 + console.error | prescription-prompt.ts |
| PV3-034 | §2.2.4 | meta.video_multimodal = true (File API 성공 시) | prescription-engine.ts |
| PV3-035 | §2.2.4 | meta.video_multimodal = false (폴백 시) | prescription-engine.ts |

---

## 9. Gap 검증 체크리스트

| 섹션 | 내용 | TDD 커버 | 상태 |
|------|------|----------|------|
| §2.1 씬분석 주입 | 버그 수정 + SECTION 2 주입 + 파라미터 최적화 | PV3-001~012 | ✅ |
| §2.2 영상 멀티모달 | File API + buildMediaPart + 비용 분석 | PV3-023~035 | ✅ |
| §2.3 5축 통합 | NO_ANALYSIS 제거 + 방어 처리 + meta 확장 | PV3-013~022 | ✅ |
| §5 에러 핸들링 | File API 폴백 + null analysis + 성과 없음 | PV3-029, 032~033, 013~014, 017 | ✅ |
| §6 시스템 프롬프트 | 영상 시청 + 씬 참조 + 신규 소재 지시 | PV3-012, 022 | ✅ |
| §7 마이그레이션 | 3단계 적용 + 기존 데이터 호환 | 구조적 — 배포 시 확인 | ✅ |

**전체 TDD: 35건, 섹션 커버: 6/6 = Gap 0%**

---

## 관련 문서

- As-Is 보고서: `docs/04-report/features/prescription-pipeline-as-is.report.md`
- V2 엔진 설계: `docs/02-design/features/prescription-system-v2.design.md`
- 현행 엔진: `src/lib/protractor/prescription-engine.ts`
- 현행 프롬프트: `src/lib/protractor/prescription-prompt.ts`
- 씬분석 cron: `src/app/api/cron/video-scene-analysis/route.ts`
- 5축 수동: `scripts/archive/analyze-five-axis.mjs`
