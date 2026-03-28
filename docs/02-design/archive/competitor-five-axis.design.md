# 경쟁사 소재 5축 분석 설계서

> 작성일: 2026-03-22
> TASK: T11 (architecture-v3-execution-plan.md)
> 의존성: T2 ✅ (analysis_json 스키마 + 프롬프트 확정)

---

## 1. 데이터 모델

### 1.1 competitor_ad_cache 신규 컬럼

```sql
ALTER TABLE competitor_ad_cache ADD COLUMN IF NOT EXISTS analysis_json_v3 jsonb;
```

- 기존 `element_analysis` (L1 스키마) 유지 — 기존 경쟁사 분석 UI 무영향
- `analysis_json_v3`에 자사 creative_media.analysis_json과 **동일 5축 스키마** 저장

### 1.2 analysis_json_v3 스키마

자사 IMAGE_PROMPT_V3와 동일 JSON 스키마:
```json
{
  "model": "gemini-2.0-flash",
  "type": "IMAGE",
  "summary": "...",
  "visual": { "format": "image", "hook_type": "...", "visual_style": "...", ... },
  "text": { "headline_type": "...", "key_message": "...", ... },
  "psychology": { "emotion": "...", "psychological_trigger": "...", ... },
  "quality": { "production_quality": "...", ... },
  "attention": { "top_fixations": [...], ... },
  "audio": null,
  "structure": null,
  "andromeda_signals": { "visual_fingerprint": "...", "text_fingerprint": "...", ... },
  "scores": null
}
```

---

## 2. API 설계

### 2.1 analyze-five-axis.mjs `--source competitor` 모드 추가

```
Usage: node scripts/analyze-five-axis.mjs --source competitor [--limit N] [--dry-run]

동작:
1. competitor_ad_cache에서 analysis_json_v3 IS NULL인 행 조회
   - image_url IS NOT NULL (Meta CDN URL)
   - ORDER BY created_at DESC
2. 각 소재에 대해:
   a. image_url에서 이미지 다운로드 (Meta CDN)
   b. IMAGE_PROMPT_V3 동일 프롬프트로 Gemini 분석
   c. 모델: gemini-2.0-flash (경쟁사는 Flash로 충분, 비용 절감)
   d. competitor_ad_cache.analysis_json_v3 UPDATE
3. Rate limiting: 2초 간격 (Flash는 Pro보다 빠름)
4. CDN 403 에러 → 스킵 + 로그
```

### 2.2 소스별 분기 로직

| 항목 | `--source creative` (기본) | `--source competitor` |
|------|---------------------------|----------------------|
| 테이블 | creative_media | competitor_ad_cache |
| 이미지 소스 | Storage URL (base64) | Meta CDN URL (직접 전달) |
| 모델 | gemini-2.5-pro | gemini-2.0-flash |
| 출력 컬럼 | analysis_json | analysis_json_v3 |
| Rate limit | 4초 | 2초 |
| 영상 분석 | mp4 다운로드 | 이미지만 (video_url 무시) |
| andromeda_signals | 포함 | 포함 |
| eye_tracking | 영상만 | 제외 |

### 2.3 Meta CDN 이미지 처리

```
이미지 URL 패턴:
- https://scontent.xx.fbcdn.net/v/...
- 만료 가능 (403/404 에러)
- 처리: URL을 Gemini에 직접 전달 (fileUri 대신 imageUrl)
- 실패 시: 스킵 + console.error 로그
```

---

## 3. 컴포넌트 구조

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `scripts/analyze-five-axis.mjs` | **수정** | `--source competitor` 모드 추가 |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| image_url 없음 | 스킵 |
| Meta CDN 403/404 | 스킵 + 에러 로그 |
| Gemini 429/5xx | 재시도 3회 (exponential backoff) |
| JSON 파싱 실패 | 스킵 + 에러 로그 |
| analysis_json_v3 0건 | 즉시 종료 |

---

## 5. 구현 순서

- [ ] CLI `--source` 옵션 파싱 (기본값 "creative")
- [ ] competitor_ad_cache에서 analysis_json_v3 IS NULL 조회
- [ ] Meta CDN 이미지 URL → Gemini에 직접 전달
- [ ] IMAGE_PROMPT_V3 동일 프롬프트 사용 (model 필드만 flash로)
- [ ] gemini-2.0-flash 모델 사용
- [ ] analysis_json_v3 PATCH 저장
- [ ] CDN 403/404 스킵 로직
- [ ] `npx tsc --noEmit` + `npm run build` 통과

---

> 설계서 작성 완료.
