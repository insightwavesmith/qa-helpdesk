# Video Pipeline Dedup Fix (영상 파이프라인 수정) 설계서

> 작성일: 2026-03-29
> 프로세스 레벨: L2 (src/ + hooks 수정)
> Plan: `docs/01-plan/features/video-pipeline-dedup-fix.plan.md`
> Match Rate 기준: **90%**

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 영상 파이프라인 Dedup 통일 + embed chain 복구 + 비디오 URL 수집 보완 + L1 자동 보고 |
| **작성일** | 2026-03-29 |
| **범위** | src/cron 2개 + lib 1개 + hooks 2개 수정 + TDD 42건 |
| **산출물** | src/ 2파일 + lib/ 1파일 수정 + hooks 2파일 수정 + 테스트 5파일 + fixtures 5개 |

| 관점 | 내용 |
|------|------|
| **Problem** | ① 251건 공회전(VIDEO 253건 중 2건만 분석 완료) ② embed chain 끊김 ③ L1 자동 보고 안 됨 ④ 77건 mp4 미다운로드(49건 fetchVideoSourceUrls 미발견 + 28건 권한 에러) |
| **Solution** | ① creative_saliency 사전 체크+동기화 ② dedup>0 chain 조건 ③ hooks L1 분기 ④ fetchVideoSourceUrls 개별 fallback + collect-daily thumbnail 보강 |
| **Function UX Effect** | Cron 공회전 제거 / 임베딩 100% 실행 / L1 결과가 Smith님에게 자동 도달 / 비디오 소스 URL 수집률 대폭 개선 |
| **Core Value** | Cloud Run 비용 절감 + 파이프라인 완전 자동화 + 조사/분석 가시성 확보 + 비디오 파이프라인 정상화 |

---

## 0. 아키텍처 변경 요약

```
[문제 A — video-saliency 공회전]
BEFORE: creative_media.video_analysis IS NULL → 251건 전부 Cloud Run → 이미 있음 → 공회전
AFTER:  creative_media.video_analysis IS NULL → creative_saliency 사전 조회
        → 이미 있는 건: 동기화만 → video_analysis 채움
        → 없는 건만: Cloud Run 호출

[문제 B — embed-creatives chain 끊김]
BEFORE: chain 조건: uploaded > 0 || processed > 0
AFTER:  chain 조건: uploaded > 0 || processed > 0 || dedup > 0

[문제 C — L1 자동 보고]
BEFORE: task-quality-gate: 모든 레벨 tsc+build+gap 강제 → L1 차단
        pdca-chain-handoff: CTO-only + Match Rate 95% → L1 보고 불가
AFTER:  task-quality-gate: L0 전스킵, L1 산출물 확인만
        pdca-chain-handoff: 전팀 대상 + L0/L1 Match Rate 스킵 → MOZZI 직접 보고

[문제 D — 비디오 URL 수집 누락 (77건)]
BEFORE: fetchVideoSourceUrls → act_{id}/advideos 계정 리스팅만
        → 계정 소유가 아닌 비디오(공유/교차 계정) 미발견 → 49건 sourceUrl null
        → process-media: storage_url 미설정 → 영구 미처리
        collect-daily → VIDEO 행 media_url=null (thumbnail_url 미활용)
AFTER:  fetchVideoSourceUrls → 계정 리스팅 1차 → 미발견 건 /{video_id}?fields=source 개별 조회
        collect-daily → VIDEO 행에 creative.thumbnail_url 저장 (데이터 보강)
```

---

## 1. 데이터 모델

### 1-1. ANALYSIS_REPORT payload (신규 타입)

```typescript
interface AnalysisReport {
  protocol: 'bscamp-team/v1';
  type: 'ANALYSIS_REPORT';             // COMPLETION_REPORT와 구별
  from_role: string;                     // 팀명 (CTO_LEADER, PM_LEADER 등)
  to_role: 'MOZZI';                      // L1은 항상 MOZZI 직접
  payload: {
    task_file: string;
    deliverables: string[];              // 산출물 파일 목록
    process_level: 'L0' | 'L1';
    summary: string;
    chain_step: string;                  // 'l1_to_coo'
  };
  ts: string;
  msg_id: string;
}
```

### 1-2. CTO 조사 결과 (2026-03-29) — 실데이터 기준

| 항목 | 수치 | 비고 |
|------|------|------|
| **VIDEO 전체** | 253건 | 기존 보고 157건은 `.mp4` storage URL 필터 결과 |
| **video_analysis 완료** | 2건 (0.8%) | 파이프라인 사실상 미작동 |
| **storage_url 보유** | 176건 (69.6%) | mp4 다운로드 완료 |
| **storage_url NULL** | 77건 (30.4%) | **media_url도 전부 NULL** |
| **비디오 보유 계정** | 22/57개 | 35개 계정은 이미지 소재만 |

#### 77건 storage_url NULL 계정별 분포

| 계정 | NULL 건수 | 비고 |
|------|-----------|------|
| 868483745454045 | 15 | 권한없는 의심 계정 |
| 818231850818440 | 11 | 정상 계정 |
| 1466150721479287 | 9 | 권한없는 의심 계정 |
| 836091815270343 | 9 | 정상 계정 |
| 3249927691848345 | 5 | 정상 계정 |
| 4271386113187297 | 5 | 정상 계정 |
| 1112351559994391 | 4 | 권한없는 의심 계정 |
| 기타 8개 계정 | 19 | — |

- 의심 3개 계정: 28건 (36%) — Meta API 권한 에러 (`#10`, `#283`)
- 정상 계정: 49건 (64%) — **권한 문제 아닌 다른 원인**

#### 근본 원인 분석

```
collect-daily → media_url: null (VIDEO는 설계상 URL 미저장, raw_creative에 video_id만 보존)
process-media → raw_creative.video_id → fetchVideoSourceUrls(accountId, videoIds)
             → Meta API GET /{video_id}?fields=source → mp4 URL 획득
             → 다운로드 → GCS 업로드 → storage_url 채움
```

**77건 실패 경로:**
1. collect-daily → process-media chain 호출 → **chain 조건 불충족(문제 B)으로 process-media 미실행**
2. process-media 독립 실행 시 → `fetchVideoSourceUrls` → Meta API 권한 에러(의심 3계정, 28건)
3. process-media 독립 실행 시 → `fetchVideoSourceUrls` → 정상 계정이지만 Meta 응답에 source URL 없음(49건, 추가 조사 필요)

**수정 방향:**
- 문제 B(chain 조건) 수정으로 process-media 정상 트리거
- **문제 D(fetchVideoSourceUrls):** 계정 리스팅 후 미발견 video_id에 대해 개별 `GET /{video_id}?fields=source` 호출 추가 → 정상 계정 49건 해소
- **collect-daily 보강:** VIDEO 행에 `creative.thumbnail_url` 저장 → 향후 썸네일 즉시 가용
- 의심 3계정(28건): video-permission-skip 태스크에서 별도 처리 (이미 Plan 존재, 개별 조회에서도 권한 에러 예상)

### 1-3. 기존 테이블 변경 없음

creative_media, creative_saliency, creatives — 스키마 변경 없음. 쿼리만 추가.

---

## 2. 구현 코드

### 2-1. video-saliency/route.ts — creative_saliency 사전 체크 (문제 A)

기존 Step 1~2 사이에 삽입. Step 2(계정별 그룹핑) 전에 이미 분석된 건 분리.

**삽입 위치:** 라인 118 (`filter(Boolean) as VideoMediaRow[]`) 이후, 라인 133 (`계정별 그룹핑`) 이전

```typescript
    // ━━━ 1-B. creative_saliency 사전 체크 — 이미 분석된 건 분리 ━━━
    const allAdIds = rows
      .map((r) => r.creatives?.ad_id)
      .filter(Boolean) as string[];

    let alreadyAnalyzedAdIds = new Set<string>();
    if (allAdIds.length > 0) {
      const { data: existingSaliency } = await svc
        .from("creative_saliency")
        .select("ad_id")
        .in("ad_id", allAdIds)
        .eq("target_type", "video");

      if (existingSaliency && existingSaliency.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alreadyAnalyzedAdIds = new Set(existingSaliency.map((s: any) => s.ad_id as string));
        console.log(
          `[video-saliency] creative_saliency 이미 존재: ${alreadyAnalyzedAdIds.size}건 → 동기화만 실행`
        );
      }
    }

    // 분리: 동기화만 필요 vs Cloud Run 호출 필요
    const syncOnlyRows = rows.filter(
      (r) => r.creatives?.ad_id && alreadyAnalyzedAdIds.has(r.creatives.ad_id)
    );
    const needsCloudRun = rows.filter(
      (r) => !r.creatives?.ad_id || !alreadyAnalyzedAdIds.has(r.creatives.ad_id)
    );

    console.log(
      `[video-saliency] 분류: 동기화만=${syncOnlyRows.length}건, Cloud Run=${needsCloudRun.length}건`
    );

    // ━━━ 1-C. 이미 분석된 건 즉시 동기화 ━━━
    let preSynced = 0;
    if (syncOnlyRows.length > 0) {
      const syncAdIds = syncOnlyRows
        .map((r) => r.creatives?.ad_id)
        .filter(Boolean) as string[];

      const { data: saliencyRows } = await svc
        .from("creative_saliency")
        .select("ad_id, cta_attention_score, cognitive_load, top_fixations, attention_map_url")
        .in("ad_id", syncAdIds)
        .eq("target_type", "video");

      if (saliencyRows && saliencyRows.length > 0) {
        const summaryMap = new Map<string, Record<string, unknown>>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of saliencyRows as any[]) {
          summaryMap.set(s.ad_id as string, {
            cta_attention_score: s.cta_attention_score,
            cognitive_load: s.cognitive_load,
            attention_map_url: s.attention_map_url,
            synced_at: new Date().toISOString(),
            model_version: "deepgaze-iie",
          });
        }

        for (const row of syncOnlyRows) {
          const adId = row.creatives?.ad_id;
          if (!adId) continue;
          const summary = summaryMap.get(adId);
          if (!summary) continue;

          const { error: updateErr } = await svc
            .from("creative_media")
            .update({ video_analysis: summary })
            .eq("id", row.id);

          if (!updateErr) {
            preSynced++;
          } else {
            console.error(
              `[video-saliency] 사전동기화 실패 id=${row.id}: ${updateErr.message}`
            );
          }
        }
        console.log(`[video-saliency] 사전동기화 완료: ${preSynced}건`);
      }
    }
```

**기존 계정별 그룹핑(Step 2) 변경:** `rows` → `needsCloudRun`으로 교체

```typescript
    // ━━━ 2. 계정별 그룹핑 (Cloud Run 필요한 건만) ━━━
    const accountMap = new Map<string, AccountGroup>();

    for (const row of needsCloudRun) {  // 변경: rows → needsCloudRun
      // ... 기존 로직 동일
    }
```

**응답에 preSynced 추가:**
```typescript
    return NextResponse.json({
      message: "video-saliency 완료",
      elapsed: `${elapsed}s`,
      totalVideos,
      preSynced,           // 추가
      cloudRunProcessed: needsCloudRun.length,  // 추가
      accounts: accountList.length,
      results,
      synced,              // 기존 Step 4 동기화 건수
    });
```

### 2-2. process-media/route.ts — chain 조건 완화 (문제 B)

**수정 위치:** 라인 196

```typescript
    // BEFORE:
    // if (isChain && (result.uploaded > 0 || result.processed > 0)) {

    // AFTER:
    if (isChain && (result.uploaded > 0 || result.processed > 0 || result.dedup > 0)) {
      await triggerNext([
        "embed-creatives",
        "creative-saliency",
        "video-saliency",
      ]);
      console.log(
        `[process-media] chain → embed+saliency triggered (uploaded=${result.uploaded}, processed=${result.processed}, dedup=${result.dedup})`
      );
    }
```

### 2-3. task-quality-gate.sh — L0/L1 경량 검증 (문제 C-1)

```bash
#!/bin/bash
# task-quality-gate.sh — 태스크 완료 시 품질 검증 (QA 강제)
# TaskCompleted hook: 검증 실패 시 exit 2로 차단
#
# v3 (2026-03-29): 프로세스 레벨별 분기 추가
#   L0: 전부 스킵
#   L1: 산출물(docs/) 존재 확인만
#   L2/L3: 기존대로 (tsc + build + gap + pdca)

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

PROJECT_DIR="/Users/smith/projects/bscamp"
cd "$PROJECT_DIR" || exit 0

# ── 프로세스 레벨 판단 ──
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
LAST_MSG=$(git log --oneline -1 2>/dev/null || echo "")

# L0: fix:/hotfix: 커밋
if echo "$LAST_MSG" | grep -qE '^[a-f0-9]+ (fix|hotfix):'; then
    echo "✅ [L0 응급] 품질 검증 스킵"
    exit 0
fi

# L1: src/ 변경 없음
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)
if [ "$HAS_SRC" -eq 0 ]; then
    # L1: 산출물 존재 확인만 (docs/ 하위 최근 60분 이내 변경)
    DELIVERABLE_COUNT=$(find "$PROJECT_DIR/docs" -name "*.md" -mmin -60 2>/dev/null | wc -l | tr -d ' ')
    # TASK 파일 변경도 산출물로 인정
    TASK_COUNT=$(find "$PROJECT_DIR/.claude/tasks" -name "TASK-*.md" -mmin -60 2>/dev/null | wc -l | tr -d ' ')
    TOTAL_DELIVERABLES=$((DELIVERABLE_COUNT + TASK_COUNT))

    if [ "$TOTAL_DELIVERABLES" -gt 0 ]; then
        echo "✅ [L1 경량] 산출물 ${TOTAL_DELIVERABLES}건 확인. 품질 검증 통과."
    else
        echo "⚠ [L1 경량] 산출물 없음 (docs/ 또는 tasks/ 60분 이내 변경 없음). 작업 결과를 확인하세요."
    fi
    exit 0
fi

# ── L2/L3: 기존 검증 로직 ──
ERRORS=0
MESSAGES=""

# 1. TypeScript 타입 체크
if ! npx tsc --noEmit 2>/dev/null; then
  MESSAGES="${MESSAGES}\n- TypeScript 타입 에러가 있습니다."
  ERRORS=$((ERRORS + 1))
fi

# 2. 빌드 체크
if ! npm run build 2>/dev/null 1>/dev/null; then
  MESSAGES="${MESSAGES}\n- npm run build 실패. 빌드 에러를 수정하세요."
  ERRORS=$((ERRORS + 1))
fi

# 3. Gap 분석 문서 존재 여부 (최근 1일 이내)
ANALYSIS_COUNT=$(find "$PROJECT_DIR/docs/03-analysis" -name "*.analysis.md" -mtime -1 2>/dev/null | wc -l | tr -d ' ')
if [ "$ANALYSIS_COUNT" -eq 0 ]; then
  MESSAGES="${MESSAGES}\n- Gap 분석 문서(docs/03-analysis/)가 없습니다."
  ERRORS=$((ERRORS + 1))
fi

# 4. .pdca-status.json 업데이트 확인 (최근 1시간 이내 수정)
PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
if [ -f "$PDCA_ROOT" ]; then
  PDCA_AGE=$(( $(date +%s) - $(stat -f %m "$PDCA_ROOT" 2>/dev/null || echo "0") ))
  if [ "$PDCA_AGE" -gt 3600 ]; then
    MESSAGES="${MESSAGES}\n- .pdca-status.json이 1시간 이상 업데이트되지 않았습니다."
    ERRORS=$((ERRORS + 1))
  fi
fi

# 결과 출력
if [ "$ERRORS" -gt 0 ]; then
  echo "품질 검증 실패 (${ERRORS}개 항목):"
  echo -e "$MESSAGES"
  echo ""
  echo "위 항목을 수정한 후 다시 완료 처리하세요."
  exit 2
fi

echo "품질 검증 통과: tsc + build + gap analysis + pdca-status 확인 완료"
exit 0
```

### 2-4. pdca-chain-handoff.sh — L1 보고 경로 추가 (문제 C-2)

기존 v2 코드 위에 수정. **변경점 3곳:**

#### 변경 1: CTO-only 필터 → 전팀 대상 (라인 18~20)

```bash
# ── 2. 팀 컨텍스트 확인 (전팀 대상) ──
CONTEXT_FILE="$PROJECT_DIR/.claude/runtime/team-context.json"
if [ ! -f "$CONTEXT_FILE" ]; then
    exit 0  # 팀 컨텍스트 없음 → 비대상
fi
TEAM=$(jq -r '.team // empty' "$CONTEXT_FILE" 2>/dev/null)
[ -z "$TEAM" ] && exit 0
# 팀명을 from_role로 변환 (CTO → CTO_LEADER, PM → PM_LEADER, 기타 → 그대로)
case "$TEAM" in
    CTO*) FROM_ROLE="CTO_LEADER" ;;
    PM*)  FROM_ROLE="PM_LEADER" ;;
    *)    FROM_ROLE="${TEAM}_LEADER" ;;
esac
```

#### 변경 2: L0/L1 Match Rate 스킵 + ANALYSIS_REPORT 분기 (라인 29~35 사이 삽입)

```bash
# ── 3-B. L0/L1 → Match Rate 스킵 → ANALYSIS_REPORT 직접 전송 ──
# 프로세스 레벨 사전 판단 (git diff 기반)
CHANGED_FILES=$(git diff HEAD~1 --name-only 2>/dev/null || echo "")
HAS_SRC=$(echo "$CHANGED_FILES" | grep -c "^src/" || true)
LAST_MSG=$(git log --oneline -1 2>/dev/null || echo "")
IS_FIX=$(echo "$LAST_MSG" | grep -cE '^[a-f0-9]+ (fix|hotfix):' || true)

if [ "$IS_FIX" -gt 0 ]; then
    EARLY_LEVEL="L0"
elif [ "$HAS_SRC" -eq 0 ]; then
    EARLY_LEVEL="L1"
else
    EARLY_LEVEL=""
fi

if [ "$EARLY_LEVEL" = "L0" ] || [ "$EARLY_LEVEL" = "L1" ]; then
    # L0/L1: Match Rate 게이트 스킵 → MOZZI 직접 ANALYSIS_REPORT
    TASK_FILE=$(jq -r '.taskFiles[0] // empty' "$CONTEXT_FILE" 2>/dev/null)
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    MSG_ID="chain-l1-$(date +%s)-$$"

    # 산출물 목록 수집 (최근 60분 이내 변경된 docs/ 파일)
    DELIVERABLES=$(find "$PROJECT_DIR/docs" -name "*.md" -mmin -60 2>/dev/null | head -10 | while read -r f; do
        echo "\"$(echo "$f" | sed "s|${PROJECT_DIR}/||")\""
    done | paste -sd',' -)
    [ -z "$DELIVERABLES" ] && DELIVERABLES='"(없음)"'

    PAYLOAD=$(cat <<EOFPAYLOAD
{
  "protocol": "bscamp-team/v1",
  "type": "ANALYSIS_REPORT",
  "from_role": "${FROM_ROLE}",
  "to_role": "MOZZI",
  "payload": {
    "task_file": "${TASK_FILE}",
    "deliverables": [${DELIVERABLES}],
    "process_level": "${EARLY_LEVEL}",
    "summary": "조사/분석 완료 (${EARLY_LEVEL}). 산출물 확인 필요.",
    "chain_step": "l1_to_coo"
  },
  "ts": "${TIMESTAMP}",
  "msg_id": "${MSG_ID}"
}
EOFPAYLOAD
    )

    # Broker 전송 시도
    BROKER_URL="http://localhost:7899"
    if curl -sf "${BROKER_URL}/health" >/dev/null 2>&1; then
        PEERS_JSON=$(curl -sf -X POST "${BROKER_URL}/list-peers" \
            -H 'Content-Type: application/json' \
            -d "{\"scope\":\"repo\",\"cwd\":\"${PROJECT_DIR}\",\"git_root\":\"${PROJECT_DIR}\"}" \
            2>/dev/null || echo "[]")

        TARGET_ID=$(echo "$PEERS_JSON" | jq -r '[.[] | select(.summary | test("MOZZI"))][0].id // empty' 2>/dev/null)
        MY_ID=$(echo "$PEERS_JSON" | jq -r "[.[] | select(.summary | test(\"${FROM_ROLE}\"))][0].id // empty" 2>/dev/null)

        if [ -n "$TARGET_ID" ] && [ -n "$MY_ID" ]; then
            SEND_RESULT=$(curl -sf -X POST "${BROKER_URL}/send-message" \
                -H 'Content-Type: application/json' \
                -d "{\"from_id\":\"${MY_ID}\",\"to_id\":\"${TARGET_ID}\",\"text\":$(echo "$PAYLOAD" | jq -c '.')}" \
                2>/dev/null || echo '{"ok":false}')

            SEND_OK=$(echo "$SEND_RESULT" | jq -r '.ok // false' 2>/dev/null)
            if [ "$SEND_OK" = "true" ]; then
                echo "✅ [${EARLY_LEVEL}] ANALYSIS_REPORT → MOZZI 자동 전송 완료"
                echo "  팀: ${FROM_ROLE}"
                echo "  산출물: ${DELIVERABLES}"
                exit 0
            fi
        fi
    fi

    # Fallback
    echo "⚠ [${EARLY_LEVEL}] broker/peer 미발견. 수동 보고 필요."
    echo "ACTION_REQUIRED: send_message(MOZZI, ANALYSIS_REPORT)"
    echo "PAYLOAD: ${PAYLOAD}"
    exit 0
fi

# ── 이하 기존 L2/L3 로직 (Match Rate 게이트 + COMPLETION_REPORT) ──
```

#### 변경 3: 기존 L2/L3 from_role 변수 사용 (라인 97~)

```bash
    # 기존 PAYLOAD에서 "CTO_LEADER" 하드코딩 → FROM_ROLE 변수
    "from_role": "${FROM_ROLE}",
```

### 2-5. creative-image-fetcher.ts — fetchVideoSourceUrls 개별 fallback (문제 D-1)

**수정 위치:** `src/lib/protractor/creative-image-fetcher.ts` 라인 346~350 (경고 로그 직전)

기존 코드는 계정 리스팅(`act_{id}/advideos`)에서 못 찾은 video_id를 경고만 출력하고 포기.
개별 `GET /{video_id}?fields=source` 호출을 추가하여 교차 계정/공유 비디오 source URL 획득.

```typescript
  // ━━━ 개별 video fallback (계정 리스팅에서 미발견 건) ━━━
  if (needed.size > 0) {
    console.log(
      `[creative-fetcher] 계정 리스팅 미발견 ${needed.size}건 → 개별 조회 시작 [${cleanId}]`
    );

    const individualIds = [...needed];
    // 병렬 처리 (5개씩 배치)
    const BATCH_SIZE = 5;
    for (let i = 0; i < individualIds.length; i += BATCH_SIZE) {
      const batch = individualIds.slice(i, i + BATCH_SIZE);
      const promises = batch.map(async (vid) => {
        try {
          const vidUrl = new URL(`${META_API_BASE}/${vid}`);
          vidUrl.searchParams.set("access_token", token);
          vidUrl.searchParams.set("fields", "id,source");
          const vidRes = await fetchMetaWithRetry(vidUrl.toString());
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vidData: any = await vidRes.json();

          if (vidData.error) {
            const errMsg: string = vidData.error.message ?? "";
            const isPermErr = errMsg.includes("(#10)") || errMsg.includes("(#283)");
            if (isPermErr) {
              console.warn(`[creative-fetcher] 개별 조회 권한 에러: ${vid}`);
            } else {
              console.warn(`[creative-fetcher] 개별 조회 에러 ${vid}: ${errMsg}`);
            }
            return;
          }

          if (vidData.source) {
            result.set(vid, vidData.source);
            needed.delete(vid);
          }
        } catch (e) {
          console.warn(`[creative-fetcher] 개별 조회 실패 ${vid}:`, e);
        }
      });
      await Promise.all(promises);
    }

    if (needed.size > 0) {
      console.warn(
        `[creative-fetcher] 최종 미발견 ${needed.size}건 [${cleanId}]: ${[...needed].slice(0, 5).join(",")}`
      );
    } else {
      console.log(`[creative-fetcher] 개별 조회로 전체 해소 [${cleanId}]`);
    }
  }

  return result;
```

**기존 코드에서 삭제할 부분 (라인 346~352):**

```typescript
  // 삭제 — 개별 fallback 코드로 대체
  // if (needed.size > 0) {
  //   console.warn(
  //     `[creative-fetcher] ${needed.size}개 video source 미발견 [${cleanId}]: ${[...needed].slice(0, 5).join(",")}`,
  //   );
  // }
  //
  // return result;
```

### 2-6. collect-daily/route.ts — VIDEO thumbnail_url 보강 (문제 D-2)

collect-daily가 VIDEO 행 생성 시 `creative.thumbnail_url`을 `media_url`에 저장.
Meta API는 `creative.fields(thumbnail_url)`을 이미 요청 중이나 (`meta-collector.ts` AD_FIELDS), collect-daily에서 활용하지 않음.

> **주의:** `thumbnail_url`은 비디오 썸네일 이미지 URL이며 mp4 소스가 아님. process-media는 VIDEO 행에서 `raw_creative.video_id` 기반으로 소스 URL을 별도 조회하므로, 이 변경은 media_url 데이터 보강용(UI 표시, 미리보기)이며 다운로드 로직에 영향 없음.

**수정 위치 3곳:**

#### (1) 비-CAROUSEL VIDEO (라인 284)

```typescript
// BEFORE:
media_url: existing?.media_url || null,

// AFTER:
media_url: existing?.media_url || (videoId ? creative?.thumbnail_url : null) || null,
```

#### (2) CAROUSEL 카드 VIDEO (라인 250)

```typescript
// BEFORE:
media_url: existing?.media_url || card.imageUrl || null,

// AFTER:
media_url: existing?.media_url || card.imageUrl || (card.videoId ? creative?.thumbnail_url : null) || null,
```

#### (3) CAROUSEL fallback VIDEO (라인 267)

```typescript
// BEFORE:
media_url: existing?.media_url || null,

// AFTER:
media_url: existing?.media_url || (videoId ? creative?.thumbnail_url : null) || null,
```

**변경 원리:** `videoId`(또는 `card.videoId`)가 존재할 때만 `thumbnail_url` 사용. IMAGE 행은 기존 로직 유지.

---

## 3. 에러 처리

### video-saliency

| 상황 | 동작 | 영향 |
|------|------|------|
| creative_saliency 사전 조회 실패 | alreadyAnalyzedAdIds = 빈 Set → 전체 Cloud Run (기존 동작) | 안전 fallback |
| 사전 동기화 실패 (update 에러) | 에러 로그 + continue → 다음 cron에서 재시도 | 데이터 손실 없음 |
| target_type != 'video' | summaryMap에 안 잡힘 → syncOnlyRows에서 동기화 안 됨 → needsCloudRun으로 분류 필요 | 아래 보완 참조 |

**target_type 불일치 보완:** creative_saliency 사전 조회에 `.eq("target_type", "video")` 포함. video가 아닌 레코드는 제외 → needsCloudRun으로 넘어감.

### task-quality-gate.sh

| 상황 | 동작 |
|------|------|
| git diff 실패 (git 비초기화) | CHANGED_FILES="" → HAS_SRC=0 → L1 경로 |
| git log 실패 | LAST_MSG="" → L0 미탐지 → L1 또는 L2 경로 |
| find 실패 | DELIVERABLE_COUNT=0 → 경고만 (exit 0) |

### pdca-chain-handoff.sh L1 경로

| 상황 | 동작 |
|------|------|
| 산출물 0건 | DELIVERABLES='"(없음)"' → 정상 전송 (내용만 다름) |
| broker 다운 | ACTION_REQUIRED fallback (exit 0) |
| MOZZI peer 미발견 | ACTION_REQUIRED fallback (exit 0) |
| 자기 peer 미발견 | ACTION_REQUIRED fallback (exit 0) |

### fetchVideoSourceUrls 개별 fallback

| 상황 | 동작 | 영향 |
|------|------|------|
| 개별 조회 API 에러 (비권한) | warn 로그 + 해당 video 스킵 | 부분 실패 허용, 나머지 진행 |
| 개별 조회 권한 에러 (#10, #283) | warn 로그 + 스킵 | video-permission-skip 태스크에서 처리 |
| 개별 조회 source 필드 null | 해당 video 스킵 (needed에 잔류) | 최종 경고 로그에 포함 |
| 개별 조회 네트워크 에러 | catch + warn + 스킵 | fetchMetaWithRetry 내부 재시도 후에도 실패 시 |
| 전체 개별 조회 배치 실패 | 각 Promise 독립 catch → 나머지 진행 | 전체 중단 없음 |

### collect-daily thumbnail 보강

| 상황 | 동작 | 영향 |
|------|------|------|
| creative.thumbnail_url 존재 | media_url에 저장 | UI 미리보기 가용 |
| creative.thumbnail_url null | media_url = null (기존 동작) | process-media에서 raw_creative.video_id로 처리 |
| IMAGE 행 | videoId=null → thumbnail_url 분기 안 탐 | 기존 로직 무영향 |

---

## 4. 구현 순서

### Wave 1: TDD 테스트 작성 (Red)

- [ ] W1-1: `__tests__/hooks/video-saliency-dedup.test.ts` — VS-1~VS-8 (8건)
- [ ] W1-2: `__tests__/hooks/embed-chain-fix.test.ts` — EC-1~EC-5 (5건)
- [ ] W1-3: `__tests__/hooks/l1-auto-report.test.ts` — LR-1~LR-18 (18건)
- [ ] W1-4: `__tests__/hooks/video-source-fallback.test.ts` — VF-1~VF-7 (7건)
- [ ] W1-5: `__tests__/hooks/collect-daily-thumbnail.test.ts` — CT-1~CT-4 (4건)
- [ ] W1-6: Fixtures 5개 작성
- [ ] W1-7: 전부 Red 확인

### Wave 2: 파이프라인 수정 (src/ + lib/)

- [ ] W2-1: video-saliency/route.ts — creative_saliency 사전 체크 + 동기화 (문제 A)
- [ ] W2-2: process-media/route.ts — chain 조건에 dedup > 0 추가 (문제 B)
- [ ] W2-3: creative-image-fetcher.ts — fetchVideoSourceUrls 개별 fallback (문제 D-1)
- [ ] W2-4: collect-daily/route.ts — VIDEO thumbnail_url 보강 (문제 D-2)
- [ ] W2-5: VS-1~VS-8, EC-1~EC-5, VF-1~VF-7, CT-1~CT-4 Green 확인

### Wave 3: Hook 수정

- [ ] W3-1: task-quality-gate.sh v3 — L0/L1 분기 (문제 C-1)
- [ ] W3-2: pdca-chain-handoff.sh v3 — 전팀 대상 + L1 ANALYSIS_REPORT (문제 C-2)
- [ ] W3-3: LR-1~LR-18 Green 확인

### Wave 4: 통합 검증

- [ ] W4-1: `npx tsc --noEmit --quiet` — 타입 에러 0
- [ ] W4-2: `npm run build` — 빌드 성공
- [ ] W4-3: 전체 TDD 42건 Green
- [ ] W4-4: 기존 hooks 테스트 regression 확인 (PC-1~25, RV-1~23 등)
- [ ] W4-5: Gap 분석 → docs/03-analysis/video-pipeline-dedup-fix.analysis.md
- [ ] W4-6: `.pdca-status.json` + `docs/.pdca-status.json` 업데이트

---

## 5. 파일 경계

| 역할 | 담당 파일 |
|------|----------|
| **backend-dev** | `src/app/api/cron/video-saliency/route.ts`, `src/app/api/cron/process-media/route.ts`, `src/app/api/cron/collect-daily/route.ts`, `src/lib/protractor/creative-image-fetcher.ts`, `.claude/hooks/task-quality-gate.sh`, `.claude/hooks/pdca-chain-handoff.sh`, `__tests__/` 전체 |
| **qa-engineer** | `docs/03-analysis/video-pipeline-dedup-fix.analysis.md` |

---

## 6. TDD 테스트 설계

### 6-1. video-saliency-dedup.test.ts (8건)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Supabase mock 구조
// svc.from('creative_media').select().eq().is().not().like().order().limit()
// svc.from('creative_saliency').select().in().eq()
// svc.from('creative_media').update().eq()

describe('video-saliency Dedup 사전 체크', () => {

  // VS-1: creative_saliency에 ad_id 존재 + target_type=video → Cloud Run 스킵, 동기화만
  it('VS-1: 이미 분석된 ad_id → 동기화만 실행, Cloud Run 호출 0건', async () => {
    // Setup:
    //   creative_media: [{id:'m1', creative_id:'c1', video_analysis:null}]
    //   creatives: [{id:'c1', ad_id:'ad1', account_id:'acc1'}]
    //   creative_saliency: [{ad_id:'ad1', target_type:'video', cta_attention_score:0.7}]
    // Expect:
    //   fetch (Cloud Run) 호출 0회
    //   creative_media.update({video_analysis: {...}}).eq('id','m1') 호출 1회
    //   response.preSynced === 1
    //   response.cloudRunProcessed === 0
  });

  // VS-2: creative_saliency에 ad_id 없음 → Cloud Run 호출
  it('VS-2: 미분석 ad_id → Cloud Run 호출', async () => {
    // Setup:
    //   creative_media: [{id:'m1', ..., video_analysis:null}]
    //   creative_saliency: [] (빈 테이블)
    // Expect:
    //   fetch 호출 1회 (Cloud Run /video-saliency)
    //   response.cloudRunProcessed === 1
    //   response.preSynced === 0
  });

  // VS-3: 혼합 — 일부 분석됨 + 일부 미분석
  it('VS-3: 157건 중 150건 이미 분석 → 7건만 Cloud Run', async () => {
    // Setup:
    //   creative_media: 157건 (video_analysis: null)
    //   creative_saliency: 150건 (target_type='video')
    // Expect:
    //   Cloud Run 호출은 미분석 7건의 계정만
    //   preSynced === 150
    //   cloudRunProcessed === 7
  });

  // VS-4: creative_saliency에 ad_id 있지만 target_type='image' → 동기화 안 됨 → Cloud Run 호출
  it('VS-4: target_type=image → 사전 체크에서 제외 → Cloud Run 호출', async () => {
    // Setup:
    //   creative_saliency: [{ad_id:'ad1', target_type:'image'}]
    // Expect:
    //   alreadyAnalyzedAdIds에 'ad1' 미포함
    //   Cloud Run 호출 1회
  });

  // VS-5: creative_saliency 사전 조회 DB 에러 → 기존 동작 fallback
  it('VS-5: saliency 조회 실패 → 전체 Cloud Run 호출 (안전 fallback)', async () => {
    // Setup:
    //   creative_saliency.select() → error
    // Expect:
    //   alreadyAnalyzedAdIds = 빈 Set
    //   모든 rows가 needsCloudRun으로 분류
    //   Cloud Run 정상 호출
  });

  // VS-6: 사전 동기화 중 update 실패 → 에러 로그 + 계속 진행
  it('VS-6: 동기화 update 실패 → 로그 출력 + preSynced 미증가', async () => {
    // Setup:
    //   creative_saliency: 있음, update → error
    // Expect:
    //   console.error 호출
    //   preSynced 미증가
    //   exit 정상 (에러 전파 안 함)
  });

  // VS-7: 미분석 VIDEO 0건 → "처리 대상 없음" 즉시 반환
  it('VS-7: rawMedia 빈 배열 → 사전 체크 스킵 + 즉시 반환', async () => {
    // Setup:
    //   creative_media.select() → []
    // Expect:
    //   creative_saliency 조회 안 함
    //   response.totalVideos === 0
  });

  // VS-8: 사전동기화 후 Step 4 동기화 — 중복 방지 (row.video_analysis 이미 있으면 스킵)
  it('VS-8: 사전동기화 완료 건은 Step 4에서 스킵', async () => {
    // Setup:
    //   사전동기화로 video_analysis 채워진 row
    //   Step 4에서 같은 row 재처리 시 row.video_analysis 존재 → continue
    // Expect:
    //   synced (Step 4) 에서 해당 row 미카운트
  });
});
```

### 6-2. process-media-chain.test.ts (5건)

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('process-media chain 조건', () => {

  // EC-1: dedup=5, uploaded=0, processed=0 → chain 트리거
  it('EC-1: dedup-only → chain 트리거 (embed+saliency+video)', async () => {
    // Setup:
    //   result = { uploaded: 0, processed: 0, dedup: 5, errors: 0, byType: {...} }
    //   searchParams.chain = 'true'
    // Expect:
    //   triggerNext 호출 1회
    //   triggerNext args: ["embed-creatives", "creative-saliency", "video-saliency"]
  });

  // EC-2: dedup=0, uploaded=0, processed=0 → chain 스킵
  it('EC-2: 아무 결과 없음 → chain 스킵', async () => {
    // Setup:
    //   result = { uploaded: 0, processed: 0, dedup: 0, errors: 0, byType: {...} }
    //   searchParams.chain = 'true'
    // Expect:
    //   triggerNext 호출 0회
  });

  // EC-3: uploaded=3, dedup=2 → chain 트리거 (기존 동작 유지)
  it('EC-3: uploaded+dedup → chain 트리거', async () => {
    // Setup: result = { uploaded: 3, processed: 0, dedup: 2 }
    // Expect: triggerNext 호출 1회
  });

  // EC-4: chain=false → dedup 있어도 스킵
  it('EC-4: chain=false → 모든 결과 무시', async () => {
    // Setup: result = { uploaded: 5, processed: 3, dedup: 10 }
    //        searchParams.chain = 'false' (또는 미설정)
    // Expect: triggerNext 호출 0회
  });

  // EC-5: dedup=1 (최소값) → chain 트리거
  it('EC-5: dedup=1 최소값 → chain 트리거', async () => {
    // Setup: result = { uploaded: 0, processed: 0, dedup: 1 }
    //        searchParams.chain = 'true'
    // Expect: triggerNext 호출 1회
  });
});
```

### 6-3. l1-auto-report.test.ts (18건)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestEnv, cleanupTestEnv, runHook,
  writeAnalysisFile, writeTeamContext, prepareHookWithHelpers,
  prepareChainHandoffV2,
} from './helpers';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ━━━ task-quality-gate L0/L1 분기 테스트 ━━━

describe('task-quality-gate L0/L1 분기', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { cleanupTestEnv(env.tmpDir); });

  function prepareQualityGate(changedFiles: string[], lastMsg: string): string {
    const originalPath = join(process.cwd(), '.claude/hooks/task-quality-gate.sh');
    // v3 코드로 교체 후 PROJECT_DIR + git mock 치환
    let content = require('fs').readFileSync(originalPath, 'utf-8');
    content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);
    // git diff mock
    const files = changedFiles.join('\\n');
    content = content.replace(
      /git diff HEAD~1 --name-only 2>\/dev\/null/g,
      `echo -e "${files}"`
    );
    // git log mock
    content = content.replace(
      /git log --oneline -1 2>\/dev\/null/g,
      `echo "${lastMsg}"`
    );
    // tsc/build mock (L2/L3에서만 실행)
    content = content.replace(/npx tsc --noEmit 2>\/dev\/null/g, 'true');
    content = content.replace(/npm run build 2>\/dev\/null 1>\/dev\/null/g, 'true');
    // find mock 제거 — 실제 tmpDir 기반 동작
    const destPath = join(env.hooksDir, 'task-quality-gate.sh');
    require('fs').writeFileSync(destPath, content, { mode: 0o755 });
    // is-teammate.sh 복사
    require('fs').copyFileSync(
      join(process.cwd(), '.claude/hooks/is-teammate.sh'),
      join(env.hooksDir, 'is-teammate.sh')
    );
    return destPath;
  }

  // LR-1: L0 (fix: 커밋) → 전부 스킵
  it('LR-1: fix: 커밋 → L0 → 전부 스킵 → exit 0', () => {
    const hookPath = prepareQualityGate(
      ['src/app/page.tsx'],
      'abc1234 fix: 긴급 수정'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0 응급');
  });

  // LR-2: L0 (hotfix: 커밋) → 전부 스킵
  it('LR-2: hotfix: 커밋 → L0 → 전부 스킵', () => {
    const hookPath = prepareQualityGate(
      ['src/lib/auth.ts'],
      'abc1234 hotfix: 인증 장애'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0 응급');
  });

  // LR-3: L1 (src/ 변경 없음) + docs/ 산출물 있음 → 통과
  it('LR-3: L1 + 산출물 있음 → 통과 메시지', () => {
    // docs/ 에 최근 파일 생성
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'test.plan.md'), '# Test Plan');
    const hookPath = prepareQualityGate(
      ['docs/01-plan/test.plan.md'],
      'abc1234 chore: Plan 작성'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1 경량');
    expect(result.stdout).toMatch(/산출물 \d+건 확인/);
  });

  // LR-4: L1 + 산출물 없음 → 경고만 (차단 안 함)
  it('LR-4: L1 + 산출물 없음 → 경고 출력 + exit 0', () => {
    const hookPath = prepareQualityGate(
      ['.claude/hooks/test.sh'],
      'abc1234 chore: hook 수정'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('산출물 없음');
  });

  // LR-5: L2 (src/ 변경 있음) → 기존 검증 (tsc+build+gap)
  it('LR-5: L2 → 기존 검증 실행', () => {
    // gap 분석 문서 없으면 exit 2
    const hookPath = prepareQualityGate(
      ['src/app/page.tsx'],
      'abc1234 feat: 새 기능'
    );
    const result = runHook(hookPath);
    // gap분석 문서 없으므로 실패 예상 (tsc/build는 mock true)
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('Gap 분석 문서');
  });

  // LR-6: L2 + gap분석 있음 → 통과
  it('LR-6: L2 + 모든 검증 통과 → exit 0', () => {
    writeAnalysisFile(env.tmpDir, 95);
    // pdca-status.json 생성 (최근 수정)
    writeFileSync(join(env.tmpDir, '.pdca-status.json'), '{}');
    const hookPath = prepareQualityGate(
      ['src/app/page.tsx'],
      'abc1234 feat: 새 기능'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('품질 검증 통과');
  });

  // LR-7: 팀원 IS_TEAMMATE=true → 즉시 통과
  it('LR-7: 팀원 → 즉시 exit 0', () => {
    const hookPath = prepareQualityGate(
      ['src/lib/critical.ts'],
      'abc1234 feat: 위험 변경'
    );
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
    // L2 검증 실행 안 됨
    expect(result.stdout).not.toContain('품질 검증 실패');
  });

  // LR-8: L1 + TASK 파일 변경 → 산출물로 인정
  it('LR-8: TASK 파일만 변경 → L1 산출물 인정', () => {
    const tasksDir = join(env.tmpDir, '.claude', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(tasksDir, 'TASK-TEST.md'), '# Task');
    const hookPath = prepareQualityGate(
      ['.claude/tasks/TASK-TEST.md'],
      'abc1234 chore: TASK 추가'
    );
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L1 경량');
  });
});

// ━━━ pdca-chain-handoff L1 ANALYSIS_REPORT 테스트 ━━━

describe('pdca-chain-handoff L1 ANALYSIS_REPORT', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => { env = createTestEnv(); });
  afterEach(() => { cleanupTestEnv(env.tmpDir); });

  const MOCK_PEERS_WITH_MOZZI = [
    { id: 'cto1', summary: 'CTO_LEADER | bscamp' },
    { id: 'pm1', summary: 'PM_LEADER | bscamp' },
    { id: 'moz1', summary: 'MOZZI | bscamp' },
  ];

  // LR-9: L1 CTO팀 + broker OK → MOZZI에 ANALYSIS_REPORT 전송
  it('LR-9: L1 CTO → MOZZI ANALYSIS_REPORT 자동 전송', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    // docs/ 산출물 생성
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'test.plan.md'), '# Plan');

    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('자동 전송 완료');
  });

  // LR-10: L1 PM팀 + broker OK → MOZZI에 ANALYSIS_REPORT 전송
  it('LR-10: L1 PM → MOZZI ANALYSIS_REPORT 자동 전송', () => {
    writeTeamContext(env.tmpDir, 'PM');
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'test.plan.md'), '# Plan');

    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('PM_LEADER');
  });

  // LR-11: L1 + broker 다운 → ACTION_REQUIRED fallback
  it('LR-11: L1 + broker 다운 → ACTION_REQUIRED', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: false }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ACTION_REQUIRED');
    expect(result.stdout).toContain('ANALYSIS_REPORT');
  });

  // LR-12: L1 + MOZZI peer 없음 → ACTION_REQUIRED fallback
  it('LR-12: L1 + MOZZI peer 미발견 → ACTION_REQUIRED', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/test.plan.md'],
      mockBroker: { health: true, peers: [{ id: 'cto1', summary: 'CTO_LEADER | bscamp' }], sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  // LR-13: L2 CTO → 기존 동작 (Match Rate 95% 게이트)
  it('LR-13: L2 CTO → 기존 Match Rate 게이트 작동', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    writeAnalysisFile(env.tmpDir, 80); // 95% 미만
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('체인 차단');
    expect(result.stdout).toContain('80%');
  });

  // LR-14: L2 CTO + Match Rate 97% → 기존 COMPLETION_REPORT
  it('LR-14: L2 CTO + 97% → COMPLETION_REPORT (PM 라우팅)', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    writeAnalysisFile(env.tmpDir, 97);
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('자동 전송 완료');
    expect(result.stdout).toContain('PM_LEADER');
  });

  // LR-15: L0 (fix: 커밋) → Match Rate 스킵 → MOZZI 직접
  it('LR-15: L0 fix → MOZZI 직접 ANALYSIS_REPORT', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    // git log mock을 fix: 으로 변경
    let content = require('fs').readFileSync(hookPath, 'utf-8');
    content = content.replace(
      /echo "abc1234 test commit"/,
      'echo "abc1234 fix: 긴급 수정"'
    );
    require('fs').writeFileSync(hookPath, content, { mode: 0o755 });

    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0');
    expect(result.stdout).toContain('MOZZI');
  });

  // LR-16: L1 payload에 deliverables 배열 포함 확인
  it('LR-16: L1 ANALYSIS_REPORT payload에 deliverables 포함', () => {
    writeTeamContext(env.tmpDir, 'CTO');
    const docsDir = join(env.tmpDir, 'docs', '01-plan');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'research.plan.md'), '# Research');

    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/01-plan/research.plan.md'],
      mockBroker: { health: false } // fallback으로 PAYLOAD 출력
    });
    const result = runHook(hookPath);
    expect(result.stdout).toContain('ANALYSIS_REPORT');
    expect(result.stdout).toContain('deliverables');
    expect(result.stdout).toContain('l1_to_coo');
  });

  // LR-17: L2 PM팀 → 기존대로 PM은 Match Rate 게이트 실행
  it('LR-17: L2 PM → Match Rate 게이트 작동', () => {
    writeTeamContext(env.tmpDir, 'PM');
    writeAnalysisFile(env.tmpDir, 70);
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('체인 차단');
  });

  // LR-18: 팀 컨텍스트 없음 → exit 0 (비대상)
  it('LR-18: team-context.json 없음 → exit 0', () => {
    // writeTeamContext 호출 안 함
    const hookPath = prepareChainHandoffV2(env, {
      changedFiles: ['docs/test.md'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true }
    });
    const result = runHook(hookPath);
    expect(result.exitCode).toBe(0);
    // 아무 출력 없이 조용히 종료
  });
});
```

### 6-4. 테스트 헬퍼 추가 (helpers.ts)

`prepareChainHandoffV2`를 L1 지원하도록 확장:

```typescript
/**
 * v3 확장: git log mock에 커밋 메시지 커스텀 지원
 * opts.lastCommitMsg: git log --oneline 출력 (기본: "abc1234 test commit")
 */
export function prepareChainHandoffV2(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    changedFiles?: string[];
    lastCommitMsg?: string;
    mockBroker?: {
      health: boolean;
      peers?: Array<{ id: string; summary: string }>;
      sendOk?: boolean;
    };
  }
): string {
  // 기존 로직 + lastCommitMsg 파라미터 추가
  const commitMsg = opts.lastCommitMsg || 'abc1234 test commit';
  // ... git log mock 치환에 commitMsg 사용
}
```

**prepareQualityGateV3 함수 신규:**

```typescript
/**
 * task-quality-gate.sh v3 준비.
 * PROJECT_DIR + git 명령 mock + tsc/build mock.
 */
export function prepareQualityGateV3(
  env: ReturnType<typeof createTestEnv>,
  opts: {
    changedFiles?: string[];
    lastCommitMsg?: string;
  }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/task-quality-gate.sh');
  let content = readFileSync(originalPath, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // git diff mock
  const files = (opts.changedFiles || []).join('\\n');
  content = content.replace(
    /git diff HEAD~1 --name-only 2>\/dev\/null/g,
    `echo -e "${files}"`
  );
  // git log mock
  const commitMsg = opts.lastCommitMsg || 'abc1234 test commit';
  content = content.replace(
    /git log --oneline -1 2>\/dev\/null/g,
    `echo "${commitMsg}"`
  );
  // tsc/build mock (항상 성공)
  content = content.replace(/npx tsc --noEmit 2>\/dev\/null/g, 'true');
  content = content.replace(/npm run build 2>\/dev\/null 1>\/dev\/null/g, 'true');

  const destPath = join(env.hooksDir, 'task-quality-gate.sh');
  writeFileSync(destPath, content, { mode: 0o755 });

  // is-teammate.sh 복사
  const isTeammateSrc = join(process.cwd(), '.claude/hooks/is-teammate.sh');
  if (existsSync(isTeammateSrc)) {
    copyFileSync(isTeammateSrc, join(env.hooksDir, 'is-teammate.sh'));
  }

  return destPath;
}
```

### 6-5. Fixtures (3개 신규)

**`__tests__/hooks/fixtures/creative_saliency_video.json`:**
```json
[
  { "ad_id": "ad_001", "target_type": "video", "cta_attention_score": 0.72, "cognitive_load": "medium", "attention_map_url": "gs://bucket/ad001.json" },
  { "ad_id": "ad_002", "target_type": "video", "cta_attention_score": 0.85, "cognitive_load": "low", "attention_map_url": "gs://bucket/ad002.json" }
]
```

**`__tests__/hooks/fixtures/creative_saliency_wrong_type.json`:**
```json
[
  { "ad_id": "ad_003", "target_type": "image", "cta_attention_score": 0.60 }
]
```

**`__tests__/hooks/fixtures/process_media_dedup_result.json`:**
```json
{
  "processed": 0,
  "uploaded": 0,
  "dedup": 5,
  "errors": 0,
  "byType": {
    "IMAGE": { "processed": 0, "uploaded": 0, "errors": 0 },
    "VIDEO": { "processed": 0, "uploaded": 0, "errors": 0 }
  }
}
```

**`__tests__/hooks/fixtures/video_source_account_listing.json`:**
```json
{
  "data": [
    { "id": "vid_001", "source": "https://video.xx.fbcdn.net/v/vid_001.mp4" },
    { "id": "vid_002", "source": "https://video.xx.fbcdn.net/v/vid_002.mp4" }
  ],
  "paging": { "cursors": { "before": "abc", "after": null } }
}
```

**`__tests__/hooks/fixtures/video_source_individual.json`:**
```json
{
  "id": "vid_003",
  "source": "https://video.xx.fbcdn.net/v/vid_003.mp4"
}
```

### 6-6. video-source-fallback.test.ts (7건)

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// fetchVideoSourceUrls 테스트
// Mock: fetchMetaWithRetry → account listing 응답 + 개별 조회 응답

describe('fetchVideoSourceUrls 개별 fallback', () => {

  // VF-1: 계정 리스팅에서 전부 발견 → 개별 조회 안 함
  it('VF-1: 계정 리스팅 전부 hit → 개별 조회 스킵', async () => {
    // Setup:
    //   videoIds = ['vid_001', 'vid_002']
    //   account listing 응답: [{id:'vid_001',source:'url1'}, {id:'vid_002',source:'url2'}]
    // Expect:
    //   result.size === 2
    //   fetchMetaWithRetry 호출 1회 (계정 리스팅만)
    //   console.log 개별 조회 미출력
  });

  // VF-2: 계정 리스팅 부분 hit → 미발견 건 개별 조회 → 성공
  it('VF-2: 리스팅 2/3 hit → 1건 개별 조회 성공', async () => {
    // Setup:
    //   videoIds = ['vid_001', 'vid_002', 'vid_003']
    //   account listing: vid_001, vid_002만 반환
    //   개별 GET /vid_003: {id:'vid_003', source:'url3'}
    // Expect:
    //   result.size === 3
    //   fetchMetaWithRetry 호출 2회 (리스팅 1 + 개별 1)
  });

  // VF-3: 개별 조회도 실패 (source null) → 최종 경고
  it('VF-3: 개별 조회 source=null → 최종 미발견 경고', async () => {
    // Setup:
    //   videoIds = ['vid_missing']
    //   account listing: 미반환
    //   개별 GET /vid_missing: {id:'vid_missing'} (source 필드 없음)
    // Expect:
    //   result.size === 0
    //   console.warn '최종 미발견' 포함
  });

  // VF-4: 계정 리스팅 권한 에러 → 조기 반환 (개별 조회 안 함)
  it('VF-4: 리스팅 권한 에러 (#10) → 즉시 반환, 개별 미시도', async () => {
    // Setup:
    //   account listing 응답: {error: {message: 'Unsupported request (#10)'}}
    // Expect:
    //   result.size === 0
    //   개별 조회 fetchMetaWithRetry 추가 호출 없음
  });

  // VF-5: 개별 조회 권한 에러 → 해당 건 스킵, 나머지 진행
  it('VF-5: 개별 조회 권한 에러 → 스킵 + 나머지 성공', async () => {
    // Setup:
    //   videoIds = ['vid_perm', 'vid_ok']
    //   account listing: 미반환
    //   개별 GET /vid_perm: {error: {message: '(#283)'}}
    //   개별 GET /vid_ok: {id:'vid_ok', source:'url_ok'}
    // Expect:
    //   result.size === 1
    //   result.has('vid_ok') === true
    //   console.warn 'vid_perm' 포함
  });

  // VF-6: 개별 조회 네트워크 에러 → catch + 계속
  it('VF-6: 개별 조회 네트워크 실패 → 스킵 + 나머지 진행', async () => {
    // Setup:
    //   videoIds = ['vid_timeout', 'vid_ok2']
    //   개별 GET /vid_timeout: throw Error
    //   개별 GET /vid_ok2: 성공
    // Expect:
    //   result.size === 1
    //   console.warn 'vid_timeout' 포함
  });

  // VF-7: 배치 5개씩 처리 확인 (6개 입력 → 2 배치)
  it('VF-7: 6개 미발견 → 5+1 배치로 개별 조회', async () => {
    // Setup:
    //   videoIds = ['v1','v2','v3','v4','v5','v6'] (전부 리스팅 미발견)
    //   개별 조회: 전부 성공
    // Expect:
    //   result.size === 6
    //   fetchMetaWithRetry 호출: 리스팅 1회 + 개별 6회 = 7회
    //   Promise.all 2번 실행 (5개 + 1개)
  });
});
```

### 6-7. collect-daily-thumbnail.test.ts (4건)

```typescript
import { describe, it, expect, vi } from 'vitest';

// collect-daily VIDEO thumbnail_url 보강 테스트
// upsert되는 mediaRows의 media_url 필드 검증

describe('collect-daily VIDEO thumbnail_url 보강', () => {

  // CT-1: 비-CAROUSEL VIDEO + thumbnail_url 있음 → media_url = thumbnail_url
  it('CT-1: VIDEO + thumbnail_url → media_url에 저장', async () => {
    // Setup:
    //   creative = { video_id: 'vid1', thumbnail_url: 'https://thumb.jpg', image_hash: null }
    //   existing = null (신규)
    //   creativeType = 'VIDEO' (non-CAROUSEL)
    // Expect:
    //   mediaRows[0].media_url === 'https://thumb.jpg'
    //   mediaRows[0].media_type === 'VIDEO'
    //   mediaRows[0].content_hash === 'vid1'
  });

  // CT-2: 비-CAROUSEL VIDEO + thumbnail_url null → media_url = null (기존 동작)
  it('CT-2: VIDEO + thumbnail_url null → media_url = null', async () => {
    // Setup:
    //   creative = { video_id: 'vid2', thumbnail_url: null }
    //   existing = null
    // Expect:
    //   mediaRows[0].media_url === null
  });

  // CT-3: 비-CAROUSEL IMAGE → thumbnail_url 분기 안 탐 (기존 동작 유지)
  it('CT-3: IMAGE → 기존 로직 무영향', async () => {
    // Setup:
    //   creative = { image_hash: 'hash1', video_id: null, thumbnail_url: 'https://thumb.jpg' }
    //   creativeType = 'IMAGE'
    // Expect:
    //   mediaRows[0].media_url === null (videoId 없으므로 thumbnail_url 분기 안 탐)
    //   mediaRows[0].media_type === 'IMAGE'
  });

  // CT-4: VIDEO + existing.media_url 있음 → existing 우선 (덮어쓰기 안 함)
  it('CT-4: 기존 media_url 있으면 유지', async () => {
    // Setup:
    //   creative = { video_id: 'vid3', thumbnail_url: 'https://new-thumb.jpg' }
    //   existing = { media_url: 'https://old.jpg', storage_url: null }
    // Expect:
    //   mediaRows[0].media_url === 'https://old.jpg' (기존 우선)
  });
});
```

---

## 7. 하지 말 것

- creative-saliency (이미지 saliency) 수정
- Cloud Run Python 서비스 수정
- DB 스키마 변경 (creative_media, creative_saliency 등)
- settings.local.json hook 배열 순서 변경
- embed-creatives 자체 코드 수정 (chain 수신만)
- is-teammate.sh 수정 (별도 TASK)
- 기존 PC-1~25, RV-1~23 테스트 삭제 (호환성 확인만)
- meta-collector.ts AD_FIELDS 변경 (이미 thumbnail_url 요청 중)
- fetchVideoThumbnails 수정 (thumbnails API는 정상 작동)
