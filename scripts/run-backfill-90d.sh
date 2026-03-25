#!/bin/bash
# 전체 active 계정 × 90일 backfill
# Cloud Run collect-daily 엔드포인트를 날짜별로 호출
# USE_CLOUD_SQL=true로 Cloud SQL 직접 연결 + 페이지네이션 지원

set -euo pipefail

source /Users/smith/projects/bscamp/.env.local

CLOUD_RUN_URL="https://bscamp-cron-906295665279.asia-northeast3.run.app"
ENDPOINT="${CLOUD_RUN_URL}/api/cron/collect-daily"
LOG_FILE="/tmp/backfill-90d-$(date '+%Y%m%d-%H%M%S').log"

echo "=== Backfill 시작: 90일 (전체 active 계정) ==="
echo "Cloud Run: ${CLOUD_RUN_URL}"
echo "로그 파일: ${LOG_FILE}"
echo "시작 시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

SUCCESS=0
FAIL=0
TOTAL_ADS=0
TOTAL=90

for i in $(seq 1 $TOTAL); do
  # i일 전 날짜 계산
  TARGET_DATE=$(date -v-${i}d '+%Y-%m-%d')

  echo -n "[${i}/${TOTAL}] ${TARGET_DATE} ... "

  HTTP_CODE=$(curl -s -o /tmp/backfill-response.json -w "%{http_code}" \
    "${ENDPOINT}?date=${TARGET_DATE}&backfill=true" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    --max-time 900 2>&1)

  if [ "$HTTP_CODE" = "200" ]; then
    ADS=$(python3 -c "import sys,json; d=json.load(open('/tmp/backfill-response.json')); print(sum(r.get('meta_ads',0) for r in d.get('results',[])))" 2>/dev/null || echo "0")
    ERRORS=$(python3 -c "import sys,json; d=json.load(open('/tmp/backfill-response.json')); print(sum(1 for r in d.get('results',[]) if 'meta_error' in r))" 2>/dev/null || echo "?")
    echo "OK (${ADS} ads, ${ERRORS} errors)"
    echo "[${i}] ${TARGET_DATE} OK ads=${ADS} errors=${ERRORS}" >> "${LOG_FILE}"
    SUCCESS=$((SUCCESS + 1))
    TOTAL_ADS=$((TOTAL_ADS + ${ADS:-0}))
  else
    MSG=$(cat /tmp/backfill-response.json 2>/dev/null | head -c 200)
    echo "FAIL (HTTP ${HTTP_CODE}) ${MSG}"
    echo "[${i}] ${TARGET_DATE} FAIL http=${HTTP_CODE} ${MSG}" >> "${LOG_FILE}"
    FAIL=$((FAIL + 1))
  fi

  # Rate limit 방지: 5초 대기 (Meta API + Cloud SQL 부하 분산)
  sleep 5
done

echo ""
echo "=== Backfill 완료 ==="
echo "성공: ${SUCCESS}/${TOTAL}, 실패: ${FAIL}"
echo "총 광고 수집: ${TOTAL_ADS}"
echo "종료 시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo "상세 로그: ${LOG_FILE}"
