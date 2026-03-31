# video-saliency 크론 개선 검증 Plan

## 개요
- 기능: video-saliency 크론 DB 저장 실패 수정 검증
- 레벨: L1 (경량)
- 관련 커밋: 2abded1

## 수정 사항 요약

커밋 `2abded1`에서 4개 파일(~180줄) 수정. 두 가지 문제 해결:

### TASK-1: video-saliency DB 저장 실패 (157건 중 2건만 저장)

| 수정 파일 | 변경 내용 | 근본 원인 |
|-----------|----------|----------|
| `services/creative-pipeline/server.js` | `execFile` maxBuffer 1MB→100MB 확대 (saliency/lp/video 3곳) | Python stderr가 1MB 초과 시 Node.js crash |
| `services/creative-pipeline/saliency/predict_video_frames.py` | stdout JSON에 `videoResults` 배열 추가 (ad_id + summary) | cron route에서 Cloud SQL 직접 저장할 데이터 필요 |
| `src/app/api/cron/video-saliency/route.ts` | Supabase creative_saliency 조회 → Cloud Run 응답의 videoResults 직접 저장으로 전환 | Supabase↔Cloud SQL 경로 불일치로 저장 실패 |

**핵심**: 기존 흐름은 Python→Supabase 저장→cron route가 Supabase에서 다시 읽어 Cloud SQL 동기화하는 이중 경로였음. Cloud SQL 전환 후 Supabase 경유가 불필요해졌으므로, Python이 stdout으로 결과를 반환하고 cron route가 Cloud SQL에 직접 저장하는 단일 경로로 변경.

### TASK-2: storage_url NULL VIDEO 재처리 폴백

| 수정 파일 | 변경 내용 |
|-----------|----------|
| `src/app/api/cron/process-media/route.ts` | `extractVideoId()` 4단계 폴백 추가 (video_id → oss.video_data → afs.videos → content_hash) |
| 동일 파일 | VIDEO 스킵 사유별 구조화 로깅 (noVideoId/noSourceUrl/oversized/downloadFail) |

## 검증 방법

### 사전 조건
- creative-pipeline Cloud Run 서비스에 수정 코드 배포 완료 필요 (server.js, predict_video_frames.py)
- Next.js 앱에 route.ts 변경 반영 완료 필요

### 검증 단계

1. **현재 video_analysis 건수 확인** (베이스라인)
   ```sql
   SELECT count(*) FROM creative_media WHERE media_type = 'VIDEO' AND video_analysis IS NOT NULL;
   ```

2. **크론 수동 실행**
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/video-saliency"
   ```

3. **실행 후 건수 재확인**
   ```sql
   SELECT count(*) FROM creative_media WHERE media_type = 'VIDEO' AND video_analysis IS NOT NULL;
   ```

4. **저장된 데이터 품질 확인** (샘플 1건)
   ```sql
   SELECT id, ad_id, video_analysis
   FROM creative_media
   WHERE media_type = 'VIDEO' AND video_analysis IS NOT NULL
   ORDER BY updated_at DESC
   LIMIT 1;
   ```
   - `video_analysis` JSON에 `cta_attention_score`, `cognitive_load`, `model_version`, `analyzed_at` 키 존재 확인

5. **Cloud Run 로그 확인**
   - `maxBuffer` 관련 crash 로그 없음 확인
   - `[video-saliency]` 접두사 로그에서 에러 건수 확인

## 성공 기준

| 항목 | 기준 |
|------|------|
| 신규 video_analysis 저장 건수 | 157건 중 최소 10건 이상 |
| maxBuffer crash | 0건 |
| video_analysis JSON 구조 | `model_version: "deepgaze-iie"` 포함 |
| Cloud Run 에러 로그 | 치명적 에러 0건 |
