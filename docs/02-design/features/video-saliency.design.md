# 영상 소재 1초별 DeepGaze 시선 흐름 — Design

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│  Cloud Scheduler (매 2시간)                                  │
│  GET /api/cron/video-saliency                               │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  video-saliency/route.ts (NEW)                              │
│  1. creative_media → VIDEO + storage_url 있고 미분석 조회    │
│  2. 계정별 그룹핑                                            │
│  3. Cloud Run /video-saliency 호출 (계정별)                  │
│  4. creative_saliency → creative_media.video_analysis 동기화 │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Cloud Run /video-saliency                                  │
│  → python3 predict_video_frames.py --account-id --limit     │
│     1. mp4 다운로드 (storage_url)                            │
│     2. ffmpeg -vf fps=1 → 프레임 추출                        │
│     3. DeepGaze IIE → 프레임별 saliency                     │
│     4. 히트맵 GCS 업로드 (매 5프레임)                         │
│     5. creative_saliency UPSERT (프레임별 + 영상 요약)       │
│     6. creative_media.video_analysis UPDATE (시계열 요약)     │
└─────────────────────────────────────────────────────────────┘
```

## 2. 데이터 모델

### 2.1 creative_saliency (기존 — 변경 없음)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| ad_id | text UNIQUE | 프레임: `{ad_id}__frame_{idx:04d}`, 요약: `{ad_id}` |
| target_type | text | `video_frame` / `video` |
| attention_map_url | text | 히트맵 URL (매 5프레임) |
| top_fixations | jsonb | fixation 좌표 배열 |
| cta_attention_score | float | CTA(하단 20%) 주목도 |
| cognitive_load | text | low / medium / high |

### 2.2 creative_media.video_analysis (기존 JSONB 컬럼 활용)
```json
{
  "total_frames": 15,
  "duration_sec": 15.0,
  "dominant_cognitive_load": "medium",
  "cognitive_load_distribution": { "low": 3, "medium": 8, "high": 4 },
  "avg_cta_attention": 0.234,
  "attention_transitions": 5,
  "attention_timeline": [
    { "sec": 0, "dominant_region": "top" },
    { "sec": 1, "dominant_region": "middle" },
    { "sec": 2, "dominant_region": "middle" }
  ],
  "analyzed_at": "2026-03-24T12:00:00Z",
  "model_version": "deepgaze-iie"
}
```

### 2.3 GCS 경로 (ADR-001 준수)
```
video-saliency/{account_id}/{ad_id}/frame_{idx:04d}.png
```
기존: `video-saliency/{ad_id}/frame_{idx:04d}.png` → account_id 폴더 추가

## 3. API 설계

### 3.1 GET /api/cron/video-saliency (NEW)
| 항목 | 값 |
|------|-----|
| Method | GET |
| Auth | CRON_SECRET 헤더 |
| maxDuration | 300s |
| 호출 주체 | Cloud Scheduler |

**응답:**
```json
{
  "message": "video-saliency 완료",
  "elapsed": "45.2s",
  "totalVideos": 30,
  "accounts": 5,
  "results": [
    { "accountId": "123", "analyzed": 5, "errors": 0 }
  ],
  "synced": 5
}
```

### 3.2 Cloud Run /video-saliency (기존 — 변경 없음)
```
POST /video-saliency
Headers: X-API-SECRET
Body: { "limit": 50, "accountId": "123456", "maxFrames": 30 }
Response: { "ok": true, "analyzed": 5, "errors": 0, "skipped": 10 }
```

## 4. 크론 구현 상세

### 4.1 video-saliency/route.ts 흐름
```
1. creative_media 조회:
   - media_type = VIDEO
   - storage_url LIKE '%.mp4'  (mp4 다운로드 가능한 것만)
   - video_analysis IS NULL     (미분석)
   - JOIN creatives (ad_id, account_id)
   - LIMIT 200

2. 계정별 그룹핑 (Map<accountId, adIds[]>)

3. 계정별 Cloud Run 호출:
   POST /video-saliency { limit: N, accountId: "xxx", maxFrames: 30 }
   - 계정 간 2초 딜레이
   - 타임아웃 240초
   - 에러 격리 (계정별 try-catch)

4. 동기화: creative_saliency → creative_media.video_analysis
   - target_type='video'인 레코드에서 summary 조회
   - 방금 처리된 ad_id 목록 기준
   - creative_media.video_analysis JSONB 업데이트
```

### 4.2 creative-saliency/route.ts 변경
- lines 240-260 `/video-saliency` 호출 블록 제거
- 응답에서 `video` 필드 제거

## 5. Python 스크립트 변경

### 5.1 predict_video_frames.py 수정 사항

#### A. 스토리지 경로 ADR-001 준수
```python
# 기존
storage_path = f"video-saliency/{ad_id}/frame_{fi:04d}.png"

# 변경
storage_path = f"video-saliency/{account_id}/{ad_id}/frame_{fi:04d}.png"
```

#### B. creative_media.video_analysis 업데이트 추가
```python
# 영상 요약 저장 후, creative_media.video_analysis도 업데이트
def update_creative_media_analysis(ad_id, summary):
    """creative_media.video_analysis JSONB에 시계열 요약 저장."""
    payload = {
        **summary,
        "analyzed_at": datetime.utcnow().isoformat() + "Z",
        "model_version": "deepgaze-iie",
    }
    # creative_media는 creative_id 기준이므로 creatives.ad_id로 조인 필요
    # → creative_media?creatives.ad_id=eq.{ad_id} 로 PATCH
    url = f"{SB_URL}/rest/v1/creative_media?select=id&creatives.ad_id=eq.{ad_id}&media_type=eq.VIDEO"
    rows = sb_get(url_path)  # id 조회
    if rows:
        for row in rows:
            patch_url = f"{SB_URL}/rest/v1/creative_media?id=eq.{row['id']}"
            requests.patch(patch_url, headers={**HEADERS, "Content-Type": "application/json"},
                          json={"video_analysis": payload}, timeout=30)
```

## 6. 구현 순서
- [ ] 6.1 `src/app/api/cron/video-saliency/route.ts` 생성
- [ ] 6.2 `creative-saliency/route.ts`에서 VIDEO 호출 제거
- [ ] 6.3 `predict_video_frames.py` ADR-001 경로 수정 + video_analysis 동기화
- [ ] 6.4 tsc + build 검증
- [ ] 6.5 PDCA 상태 업데이트 + 커밋

## 7. 에러 처리
| 상황 | 처리 |
|------|------|
| Cloud Run 타임아웃 | 계정 스킵, 에러 로그, 다음 계정 계속 |
| ffmpeg 실패 | Python 내부 처리 (프레임 추출 실패 → 해당 영상 스킵) |
| GCS 업로드 실패 | 히트맵 없이 DB 결과만 저장 |
| creative_media 조회 0건 | 즉시 완료 응답 반환 |
| 동기화 실패 | 무시 (다음 크론에서 재시도) |
