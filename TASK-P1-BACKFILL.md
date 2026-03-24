# TASK: backfill 실행 (38계정 × 90일)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
수집 구조 리팩토링으로 raw JSONB(raw_insight, raw_ad, raw_creative) 컬럼 추가됨.
기존 데이터에는 raw 값이 없고, CAROUSEL 재분류도 안 된 상태.
backfill로 기존 38계정의 90일치 데이터를 재수집해서 교정해야 함.

## 선행 조건
- ⚠️ TASK-P0-DEPLOY.md (Cloud Run 재배포) 완료 후 실행할 것

## 해야 할 것
1. Cloud Run 엔드포인트 `/api/cron/backfill-accounts` 호출
2. 38 active 계정 순차 실행 (rate limit 때문에 병렬 금지)
3. 각 계정당 90일치 Meta API 재호출 → raw JSONB 채우기
4. CAROUSEL 타입 재분류 (raw_creative에서 object_story_spec 파싱)
5. 누락 카드(creative_media position > 0) 추가
6. 진행 상황 모니터링 (SSE 스트리밍 로그)

## 실행 방법
```bash
# Cloud Run URL로 호출 (Vercel URL 아님!)
curl -X POST "https://bscamp-cron-906295665279.asia-northeast3.run.app/api/cron/backfill-accounts" \
  -H "Authorization: Bearer {CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}'
```

## 검증
- daily_ad_insights에서 raw_insight NOT NULL 비율 확인
- creatives에서 raw_creative NOT NULL 비율 확인
- creative_media에서 position > 0 레코드 존재 확인 (CAROUSEL 카드)
- CAROUSEL 타입 creatives 건수 확인

## 주의
- ❌ reach 합산하지 마라 (유니크 수치 — Math.max 사용)
- ❌ 기존 데이터 삭제하지 마라 (교정만)
- ❌ Vercel URL로 호출하지 마라

## 완료 기준
- raw_insight: 4,952건 중 90%+ NOT NULL
- raw_creative: 3,235건 중 90%+ NOT NULL
- CAROUSEL 재분류 완료 (creative_type = 'CAROUSEL' 레코드 존재)
