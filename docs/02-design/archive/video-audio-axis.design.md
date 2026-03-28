# 영상 Audio 축 추가 설계서

> 작성일: 2026-03-22
> TASK: T6 (architecture-v3-execution-plan.md)
> 의존성: T2 ✅ (analysis_json 스키마 — audio 필드는 이미 VIDEO_PROMPT_V3에 존재)

---

## 현재 상태 요약

### 이미 구현된 부분
- VIDEO_PROMPT_V3에 `audio` 축 필드 존재 (줄 295-301): narration_text, bgm_genre, sound_effects, audio_emotion, audio_type
- VIDEO_PROMPT_FREE에도 audio 관련 free-text 필드 존재

### 미구현 — 본 설계서 범위
- **현재**: 영상(VIDEO)도 썸네일 이미지(image/jpeg)로만 분석 → audio 축은 Gemini가 이미지 기반으로 추측
- **목표**: 실제 mp4 비디오 파일을 Gemini에 전달 → 오디오 트랙을 실제로 분석

---

## 1. 데이터 모델

### 1.1 비디오 소스 경로

creative_media에서 VIDEO 소재의 파일 경로:
- `storage_url`: Storage에 업로드된 이미지/썸네일 (image)
- Meta API의 `video_url`: 원본 비디오 URL (Meta CDN, 만료 가능)

현실적 방안: creative_media에 video_url 또는 mp4 Storage 경로가 있는 경우에만 비디오 분석.
없으면 기존처럼 썸네일 이미지 분석 (폴백).

### 1.2 audio 축 스키마 (이미 V3에 존재 — 무변경)

```json
{
  "audio": {
    "narration_text": "전사 텍스트 (한국어)",
    "bgm_genre": "pop|calm|exciting|dramatic|none",
    "sound_effects": "효과음 설명 또는 none",
    "audio_emotion": "upbeat|calm|urgent|dramatic|neutral",
    "audio_type": "narration|bgm|sfx|silent|mixed"
  }
}
```

---

## 2. API 설계

### 2.1 analyzeWithGemini() 변경

```
현재 흐름:
  imageUrl → fetch → image/jpeg base64 → Gemini (IMAGE/VIDEO 공통)

변경 후:
  if (mediaType === 'VIDEO' && videoUrl 존재) {
    videoUrl → fetch → video/mp4 base64 → Gemini
  } else {
    imageUrl → fetch → image/jpeg base64 → Gemini (기존 폴백)
  }
```

Gemini 2.5 Pro는 video/mp4를 직접 inline_data로 받을 수 있음.
비디오 크기 제한: Gemini API는 inline_data 최대 20MB.

### 2.2 비디오 URL 조회

creative_media 테이블에서:
```sql
SELECT id, storage_url, media_type
FROM creative_media
WHERE media_type = 'VIDEO'
```

비디오 원본 URL은 ad_creative_embeddings 또는 creatives 테이블의 `video_url` 컬럼에 있을 수 있음.
대안: Storage에 mp4가 저장되어 있는 경우 `storage_url`이 .mp4로 끝남.

### 2.3 analyzeWithGemini() 시그니처 변경

```typescript
// 기존
async function analyzeWithGemini(imageUrl, adCopy, mediaType, mode)

// 변경
async function analyzeWithGemini(imageUrl, adCopy, mediaType, mode, videoUrl?)
```

videoUrl이 있고 mediaType === 'VIDEO'이면 비디오 우선 사용.

---

## 3. 컴포넌트 구조

### 3.1 변경 파일

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | analyzeWithGemini()에 videoUrl 파라미터 추가, 비디오 다운로드+전달 로직 |

### 3.2 기존 서비스 영향: 없음
- IMAGE 분석: 무변경
- VIDEO 분석: videoUrl 없으면 기존 동작 (썸네일 사용)

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| videoUrl 없음 | 기존 폴백 (썸네일 이미지 분석) |
| 비디오 다운로드 실패 | 기존 폴백 (썸네일 이미지 분석) |
| 비디오 20MB 초과 | 기존 폴백 (썸네일 이미지 분석) |
| Gemini 비디오 분석 실패 | 에러 로그 + 기존 폴백 |

---

## 5. 구현 순서

- [ ] analyzeWithGemini()에 videoUrl 파라미터 추가
- [ ] VIDEO일 때 videoUrl/storage_url에서 .mp4 확인
- [ ] mp4 다운로드 → video/mp4 base64 → Gemini inline_data
- [ ] 20MB 초과 시 폴백
- [ ] 메인 루프에서 VIDEO 소재의 videoUrl 조회 + 전달
- [ ] `npx tsc --noEmit` 통과
- [ ] `npm run build` 통과

---

> 설계서 작성 완료.
