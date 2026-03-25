#!/bin/bash
# process-media 반복 실행 — storage_url IS NULL인 미디어 전부 처리
# 백필과 병렬로 실행. IMAGE/VIDEO 분리 호출.
# 3번 연속 0건이면 종료.

set -euo pipefail

source /Users/smith/projects/bscamp/.env.local

CLOUD_RUN_URL="https://bscamp-cron-906295665279.asia-northeast3.run.app"
ENDPOINT="${CLOUD_RUN_URL}/api/cron/process-media"
LOG_FILE="/tmp/process-media-$(date '+%Y%m%d-%H%M%S').log"
IMG_LIMIT=200
VID_LIMIT=20
ZERO_COUNT=0
MAX_ZERO=3
ROUND=0
TOTAL_UPLOADED=0
TOTAL_DEDUP=0
TOTAL_ERRORS=0

echo "=== process-media 반복 실행 시작 ==="
echo "Cloud Run: ${CLOUD_RUN_URL}"
echo "IMAGE 배치: ${IMG_LIMIT}, VIDEO 배치: ${VID_LIMIT}"
echo "로그 파일: ${LOG_FILE}"
echo "시작 시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

while true; do
  ROUND=$((ROUND + 1))
  ROUND_PROCESSED=0

  # IMAGE (타임아웃 300초)
  echo -n "[${ROUND}] IMAGE (limit=${IMG_LIMIT}) ... "
  IMG_HTTP=$(curl -s -o /tmp/pm-img-response.json -w "%{http_code}" \
    "${ENDPOINT}?limit=${IMG_LIMIT}&type=IMAGE" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    --max-time 300 2>&1 || true)

  IMG_UPLOADED=0
  IMG_DEDUP=0
  IMG_PROCESSED=0
  if [ "$IMG_HTTP" = "200" ]; then
    IMG_UPLOADED=$(python3 -c "import json; d=json.load(open('/tmp/pm-img-response.json')); print(d.get('uploaded',0))" 2>/dev/null || echo "0")
    IMG_DEDUP=$(python3 -c "import json; d=json.load(open('/tmp/pm-img-response.json')); print(d.get('dedup',0))" 2>/dev/null || echo "0")
    IMG_PROCESSED=$(python3 -c "import json; d=json.load(open('/tmp/pm-img-response.json')); print(d.get('processed',0))" 2>/dev/null || echo "0")
    IMG_ERRORS=$(python3 -c "import json; d=json.load(open('/tmp/pm-img-response.json')); print(d.get('errors',0))" 2>/dev/null || echo "0")
    echo "OK (processed=${IMG_PROCESSED}, uploaded=${IMG_UPLOADED}, dedup=${IMG_DEDUP}, errors=${IMG_ERRORS})"
    TOTAL_ERRORS=$((TOTAL_ERRORS + IMG_ERRORS))
  else
    echo "FAIL (HTTP ${IMG_HTTP})"
  fi
  ROUND_PROCESSED=$((ROUND_PROCESSED + IMG_PROCESSED))

  sleep 2

  # VIDEO (타임아웃 900초, 배치 작게)
  echo -n "[${ROUND}] VIDEO (limit=${VID_LIMIT}) ... "
  VID_HTTP=$(curl -s -o /tmp/pm-vid-response.json -w "%{http_code}" \
    "${ENDPOINT}?limit=${VID_LIMIT}&type=VIDEO" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    --max-time 900 2>&1 || true)

  VID_UPLOADED=0
  VID_DEDUP=0
  VID_PROCESSED=0
  if [ "$VID_HTTP" = "200" ]; then
    VID_UPLOADED=$(python3 -c "import json; d=json.load(open('/tmp/pm-vid-response.json')); print(d.get('uploaded',0))" 2>/dev/null || echo "0")
    VID_DEDUP=$(python3 -c "import json; d=json.load(open('/tmp/pm-vid-response.json')); print(d.get('dedup',0))" 2>/dev/null || echo "0")
    VID_PROCESSED=$(python3 -c "import json; d=json.load(open('/tmp/pm-vid-response.json')); print(d.get('processed',0))" 2>/dev/null || echo "0")
    VID_ERRORS=$(python3 -c "import json; d=json.load(open('/tmp/pm-vid-response.json')); print(d.get('errors',0))" 2>/dev/null || echo "0")
    echo "OK (processed=${VID_PROCESSED}, uploaded=${VID_UPLOADED}, dedup=${VID_DEDUP}, errors=${VID_ERRORS})"
    TOTAL_ERRORS=$((TOTAL_ERRORS + VID_ERRORS))
  else
    echo "FAIL (HTTP ${VID_HTTP})"
  fi
  ROUND_PROCESSED=$((ROUND_PROCESSED + VID_PROCESSED))

  ROUND_UPLOADED=$((IMG_UPLOADED + VID_UPLOADED))
  ROUND_DEDUP=$((IMG_DEDUP + VID_DEDUP))
  TOTAL_UPLOADED=$((TOTAL_UPLOADED + ROUND_UPLOADED))
  TOTAL_DEDUP=$((TOTAL_DEDUP + ROUND_DEDUP))

  echo "[${ROUND}] 합계: processed=${ROUND_PROCESSED}, uploaded=${ROUND_UPLOADED}, dedup=${ROUND_DEDUP} | 누적: uploaded=${TOTAL_UPLOADED}, dedup=${TOTAL_DEDUP}"
  echo "[${ROUND}] p=${ROUND_PROCESSED} u=${ROUND_UPLOADED} d=${ROUND_DEDUP} tu=${TOTAL_UPLOADED} td=${TOTAL_DEDUP}" >> "${LOG_FILE}"

  if [ "$ROUND_PROCESSED" -eq 0 ]; then
    ZERO_COUNT=$((ZERO_COUNT + 1))
    echo "  -> 0건 (${ZERO_COUNT}/${MAX_ZERO})"
    if [ "$ZERO_COUNT" -ge "$MAX_ZERO" ]; then
      echo ""
      echo "=== ${MAX_ZERO}번 연속 0건 — 종료 ==="
      break
    fi
    echo "  -> 60초 대기 (백필 대기)..."
    sleep 60
  else
    ZERO_COUNT=0
    sleep 3
  fi
done

echo ""
echo "=== process-media 완료 ==="
echo "총 라운드: ${ROUND}"
echo "총 업로드: ${TOTAL_UPLOADED}"
echo "총 중복제거: ${TOTAL_DEDUP}"
echo "총 에러: ${TOTAL_ERRORS}"
echo "종료 시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo "상세 로그: ${LOG_FILE}"
