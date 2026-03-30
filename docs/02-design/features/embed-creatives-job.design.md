# embed-creatives Cloud Run Job 전환 설계서

> 작성: 2026-03-30
> Plan: docs/01-plan/features/embed-creatives-job.plan.md
> 레벨: L2 (src/ 수정 + 인프라 변경)
> 관련: docs/02-design/archive/embed-creatives-dual-write.design.md

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | embed-creatives-job (임베딩 Job 전환) |
| 작성일 | 2026-03-30 |
| 예상 변경 | 신규 2파일, 수정 1파일, 인프라 3건 |

| 관점 | 내용 |
|------|------|
| Problem | Cloud Run Service 540초 제한 → 504 타임아웃. 배치 루프 없어 50건만 처리 → 409건 적체 |
| Solution | Cloud Run Job 전환 (타임아웃 해제) + 배치 루프 (전량 처리) |
| Function UX Effect | 미임베딩 0건 달성 → 총가치각도기 유사도 검색 정확도 향상 |
| Core Value | 수강생 광고 소재 분석 커버리지 100% |

---

## 1. 현황 분석

### 1.1 현재 아키텍처

```
Cloud Scheduler (20:00 KST) ──HTTP GET──► bscamp-cron Service
                                            └─ /api/cron/embed-creatives
                                               ├── Phase 1-3: Meta API → upsert → embed (계정별)
                                               ├── Phase 4: content_hash 재사용 (limit 200)
                                               └── Phase 5: embedMissingCreatives(50) ← 1회만
```

### 1.2 문제점

| # | 문제 | 원인 | 영향 |
|---|------|------|------|
| P1 | 504 Gateway Timeout | Cloud Run Service max timeout 540초 | 90개 계정 × Meta API 호출 + Gemini 임베딩 = 540초 초과 |
| P2 | 미임베딩 적체 409건 | Phase 5 `limit(50)` 1회 호출, 루프 없음 | 매일 50건만 처리 → 신규 유입 > 처리량 → 적체 증가 |
| P3 | Scheduler code:13 | HTTP 응답 타임아웃 | 독립 스케줄 실패, 체인 트리거만 작동 |

### 1.3 기존 Job 인프라 패턴

프로젝트에 이미 Cloud Run Job 패턴이 확립되어 있음:

- **Dockerfile**: `Dockerfile.scripts` (node:22-alpine, scripts/ 복사)
- **DB 접속**: `scripts/lib/cloud-sql.mjs` (pg Pool 직접 연결, Unix socket 자동 감지)
- **환경변수**: `scripts/lib/env.mjs` (.env.local 또는 process.env)
- **기존 Jobs**: score-percentiles, fatigue-risk, andromeda, lp-alignment, analyze-lps (5개)

### 1.4 기존 코드 핵심 사실 (코드베이스 검증 결과)

| 항목 | 실제 구현 | 설계 반영 |
|------|----------|----------|
| Gemini 임베딩 API | `inline_data` (base64 fetch) 방식, `fileUri` 아님 | gemini-embed.mjs에 동일 적용 |
| 임베딩 차원 | `process.env.EMBEDDING_DIMENSIONS \|\| "3072"` (env var) | env var 사용 |
| taskType | `SEMANTIC_SIMILARITY` (ad-creative-embedder.ts 기준) | 동일 적용 |
| DB 접속 | route.ts → Supabase client, scripts → pg Pool 직접 | Job은 pg Pool |
| content_hash 재사용 | route.ts Phase 4에서 limit 200으로 donor 탐색 | Job은 limit 없이 전량 |
| embedMissingCreatives | `src/lib/ad-creative-embedder.ts` — limit 기반 1회성 | Job은 배치 루프 |

---

## 2. 설계 방안

### 2.1 아키텍처 전환

```
[변경 전]
Cloud Scheduler ──HTTP──► bscamp-cron (Service, 540초 제한)
                            └─ route.ts (Phase 1~5 전부)

[변경 후]
Cloud Scheduler ──Job 실행──► embed-creatives-job (Job, 3600초)
                                └─ scripts/embed-creatives-job.mjs
                                   ├── Phase A: content_hash 재사용 (전량)
                                   └── Phase B: 배치 루프 임베딩 (50개 × N회)

process-media (체인) ──HTTP──► /api/cron/embed-creatives (경량 프록시)
                                └─ Cloud Run Jobs API로 Job 실행 트리거
```

**결정 근거**: Phase 1-3(Meta API fetch + per-ad embed)은 **route.ts에서 제거하지 않음**. 이유:
- Phase 1-3은 collect-daily → process-media 체인의 후속 단계로, 새 소재 수집 직후 즉시 임베딩이 목적
- 이 흐름은 Cloud Run Service에서 계속 처리 (신규 소재는 소수라 540초 이내 완료)
- Job은 **적체 해소 + 백필** 전용으로 역할 분리

### 2.2 역할 분리 (최종)

| 컴포넌트 | 역할 | 트리거 | 타임아웃 |
|----------|------|--------|---------|
| `route.ts` (Service) | 체인 후속: 신규 소재 즉시 임베딩 (Phase 1-3) + Job 트리거 | process-media 체인 | 540초 |
| `embed-creatives-job.mjs` (Job) | 적체 해소: hash 재사용 + 배치 루프 백필 | Scheduler + route.ts 프록시 | 3600초 |

### 2.3 동시 실행 방지

Cloud Run Jobs는 기본적으로 `parallelism=1`, `taskCount=1`로 설정. 동시 실행 시나리오:

| 시나리오 | 대응 |
|----------|------|
| Scheduler + 체인이 동시에 트리거 | Cloud Run Jobs API는 이미 실행 중인 Job에 대해 새 Execution 생성. 두 Execution이 동시 실행될 수 있음 |
| 동시 실행 시 데이터 충돌 | Phase A: `UPDATE` 멱등 (동일 content_hash 복사는 같은 값). Phase B: `SELECT ... LIMIT 50`이 동일 row를 가져올 수 있으나, 한쪽이 먼저 UPDATE하면 다른 쪽의 WHERE 조건에서 제외됨 |
| 권장 방안 | Job 스크립트 시작 시 `embed_job_lock` 테이블로 advisory lock 확인. 이미 실행 중이면 즉시 종료 (exit 0) |

**Advisory Lock 구현:**
```javascript
async function acquireLock() {
  const result = await query(
    `SELECT pg_try_advisory_lock(hashtext('embed-creatives-job')) as acquired`
  );
  return result[0]?.acquired === true;
}

async function releaseLock() {
  await query(`SELECT pg_advisory_unlock(hashtext('embed-creatives-job'))`);
}
```

---

## 3. Job 스크립트 설계

### 3.1 파일 구조

```
scripts/
├── embed-creatives-job.mjs      ← 신규: Job 엔트리포인트
├── lib/
│   ├── cloud-sql.mjs            ← 기존: DB 연결
│   ├── env.mjs                  ← 기존: 환경변수
│   └── gemini-embed.mjs         ← 신규: Gemini 임베딩 API 호출
```

### 3.2 `scripts/lib/gemini-embed.mjs` — Gemini 임베딩 헬퍼

기존 `src/lib/gemini.ts`의 `generateEmbedding()`을 scripts 컨텍스트용 ESM으로 포팅.

**중요**: 실제 `src/lib/gemini.ts`는 이미지를 fetch → base64 → `inline_data`로 전송.
`fileUri`는 Gemini Files API에 업로드된 파일 전용이므로, 임의 URL에는 `inline_data` 방식 사용.

```javascript
// scripts/lib/gemini-embed.mjs
const MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview";
const DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS || "3072", 10);
const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`;

// 429 재시도 설정
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Gemini 임베딩 생성 (이미지 URL 또는 텍스트)
 * - string → 텍스트 임베딩
 * - { imageUrl } → 이미지를 fetch → base64 → inline_data 임베딩
 * @param {string|{imageUrl: string}} input
 * @returns {Promise<number[]>} 벡터
 */
export async function generateEmbedding(input) {
  if (!API_KEY) throw new Error("GEMINI_API_KEY 미설정");

  const parts = [];

  if (typeof input === "string") {
    parts.push({ text: input });
  } else if (input.imageUrl) {
    // src/lib/gemini.ts와 동일: fetch → base64 → inline_data
    const imgRes = await fetch(input.imageUrl);
    if (!imgRes.ok) {
      throw new Error(`이미지 fetch 실패: ${imgRes.status} ${input.imageUrl}`);
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const mimeType = contentType.startsWith("image/")
      ? contentType.split(";")[0]
      : "image/jpeg";
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString("base64");
    parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
  }

  if (parts.length === 0) {
    throw new Error("input에 text 또는 imageUrl 필요");
  }

  const body = {
    model: `models/${MODEL}`,
    content: { parts },
    taskType: "SEMANTIC_SIMILARITY",
    outputDimensionality: DIMENSIONS,
  };

  // Exponential backoff 재시도 (429 대응)
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(`[gemini-embed] 429 rate limit, ${backoff}ms 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return data.embedding?.values ?? [];
  }

  throw new Error(`Gemini API: ${MAX_RETRIES}회 재시도 후에도 429 지속`);
}
```

### 3.3 `scripts/embed-creatives-job.mjs` — 메인 Job 스크립트

```javascript
// scripts/embed-creatives-job.mjs
import { pool, query } from "./lib/cloud-sql.mjs";
import { generateEmbedding } from "./lib/gemini-embed.mjs";

const BATCH_SIZE = 50;
const DELAY_MS = 500;
const BATCH_DELAY_MS = 2000;
const MAX_ITERATIONS = 100;  // 안전장치: 50 × 100 = 5,000건 상한
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview";

async function main() {
  console.log("[embed-job] 시작");
  const startTime = Date.now();

  // ── Advisory Lock 획득 (동시 실행 방지) ──
  const locked = await acquireLock();
  if (!locked) {
    console.log("[embed-job] 다른 인스턴스 실행 중 — 즉시 종료");
    await pool.end();
    process.exit(0);
  }

  try {
    // ── Phase A: content_hash 기반 임베딩 재사용 ──
    const reuseCount = await phaseHashReuse();
    console.log(`[embed-job] Phase A 완료: hash 재사용 ${reuseCount}건`);

    // ── Phase B: 배치 루프 임베딩 ──
    const embedStats = await phaseBatchEmbed();
    console.log(`[embed-job] Phase B 완료: ${JSON.stringify(embedStats)}`);

    // ── 최종 리포트 ──
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const remaining = await countRemaining();

    console.log("──────────────────────────────────");
    console.log(`[embed-job] 완료 (${elapsed}초)`);
    console.log(`  hash 재사용: ${reuseCount}건`);
    console.log(`  신규 임베딩: ${embedStats.embedded}건`);
    console.log(`  오류: ${embedStats.errors}건`);
    console.log(`  잔여 미임베딩: ${remaining}건`);
    console.log("──────────────────────────────────");

    await releaseLock();
    await pool.end();
    process.exit(embedStats.errors > embedStats.embedded ? 1 : 0);
  } catch (err) {
    await releaseLock().catch(() => {});
    throw err;
  }
}

// ── Advisory Lock ──

async function acquireLock() {
  const result = await query(
    `SELECT pg_try_advisory_lock(hashtext('embed-creatives-job')) as acquired`
  );
  return result[0]?.acquired === true;
}

async function releaseLock() {
  await query(`SELECT pg_advisory_unlock(hashtext('embed-creatives-job'))`);
}

/**
 * Phase A: content_hash가 동일한 row에서 임베딩 복사
 * Gemini API 호출 없이 DB 복사만으로 해결 가능한 건 먼저 처리
 */
async function phaseHashReuse() {
  const missing = await query(`
    SELECT cm.id, cm.content_hash
    FROM creative_media cm
    WHERE cm.embedding IS NULL
      AND cm.content_hash IS NOT NULL
      AND cm.is_active = true
  `);

  let count = 0;
  for (const row of missing) {
    const donors = await query(`
      SELECT embedding, embedding_model, embedded_at
      FROM creative_media
      WHERE content_hash = $1
        AND embedding IS NOT NULL
        AND id != $2
      LIMIT 1
    `, [row.content_hash, row.id]);

    if (donors.length > 0) {
      await query(`
        UPDATE creative_media
        SET embedding = $1, embedding_model = $2, embedded_at = $3, updated_at = NOW()
        WHERE id = $4
      `, [donors[0].embedding, donors[0].embedding_model, donors[0].embedded_at, row.id]);
      count++;
    }
  }
  return count;
}

/**
 * Phase B: 배치 루프 — 미임베딩 row를 50개씩 처리, 전량 완료까지 반복
 */
async function phaseBatchEmbed() {
  const stats = { processed: 0, embedded: 0, errors: 0, iterations: 0 };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // 배치 조회: embedding 또는 text_embedding이 NULL인 row
    const batch = await query(`
      SELECT id, media_url, ad_copy, embedding, text_embedding
      FROM creative_media
      WHERE (embedding IS NULL OR text_embedding IS NULL)
        AND is_active = true
        AND media_url IS NOT NULL
      LIMIT $1
    `, [BATCH_SIZE]);

    if (batch.length === 0) {
      console.log(`[embed-job] 배치 ${iter + 1}: 처리할 항목 없음 — 루프 종료`);
      break;
    }

    console.log(`[embed-job] 배치 ${iter + 1}: ${batch.length}건 처리 시작`);

    for (const row of batch) {
      const updates = {};

      // 이미지 임베딩
      if (!row.embedding && row.media_url) {
        try {
          updates.embedding = await generateEmbedding({ imageUrl: row.media_url });
        } catch (err) {
          console.error(`[embed-job] 이미지 임베딩 실패 (id=${row.id}): ${err.message}`);
          stats.errors++;
        }
      }

      // 텍스트 임베딩
      if (!row.text_embedding && row.ad_copy && row.ad_copy.trim().length > 5) {
        try {
          updates.text_embedding = await generateEmbedding(row.ad_copy);
        } catch (err) {
          console.error(`[embed-job] 텍스트 임베딩 실패 (id=${row.id}): ${err.message}`);
          stats.errors++;
        }
      }

      // DB 업데이트
      if (updates.embedding || updates.text_embedding) {
        const setClauses = [];
        const params = [];
        let idx = 1;

        if (updates.embedding) {
          setClauses.push(`embedding = $${idx}::vector`);
          params.push(JSON.stringify(updates.embedding));
          idx++;
        }
        if (updates.text_embedding) {
          setClauses.push(`text_embedding = $${idx}::vector`);
          params.push(JSON.stringify(updates.text_embedding));
          idx++;
        }
        setClauses.push(`embedding_model = $${idx}`);
        params.push(EMBEDDING_MODEL);
        idx++;
        setClauses.push(`embedded_at = NOW()`);
        setClauses.push(`updated_at = NOW()`);

        params.push(row.id);
        await query(
          `UPDATE creative_media SET ${setClauses.join(", ")} WHERE id = $${idx}`,
          params
        );
        stats.embedded++;
      }

      stats.processed++;
      await sleep(DELAY_MS);
    }

    stats.iterations++;

    // 진행률 로깅
    const remaining = await countRemaining();
    console.log(`[embed-job] 배치 ${iter + 1} 완료: 누적 ${stats.embedded}건 임베딩, 잔여 ${remaining}건`);

    if (remaining === 0) break;
    await sleep(BATCH_DELAY_MS);
  }

  return stats;
}

async function countRemaining() {
  const result = await query(`
    SELECT COUNT(*) as cnt
    FROM creative_media
    WHERE (embedding IS NULL OR text_embedding IS NULL)
      AND is_active = true
      AND media_url IS NOT NULL
  `);
  return parseInt(result[0]?.cnt || "0", 10);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error("[embed-job] Fatal:", err);
  pool.end();
  process.exit(1);
});
```

### 3.4 진행률 로깅 포맷

Cloud Logging에서 필터링 가능한 구조화 로그:

```
[embed-job] 시작
[embed-job] Phase A 완료: hash 재사용 12건
[embed-job] 배치 1: 50건 처리 시작
[embed-job] 배치 1 완료: 누적 48건 임베딩, 잔여 361건
[embed-job] 배치 2: 50건 처리 시작
[embed-job] 배치 2 완료: 누적 95건 임베딩, 잔여 314건
...
[embed-job] 배치 9: 9건 처리 시작
[embed-job] 배치 9: 처리할 항목 없음 — 루프 종료
──────────────────────────────────
[embed-job] 완료 (342.5초)
  hash 재사용: 12건
  신규 임베딩: 397건
  오류: 0건
  잔여 미임베딩: 0건
──────────────────────────────────
```

---

## 4. HTTP 엔드포인트 변경 (route.ts)

### 4.1 변경 방침

기존 route.ts를 **경량화**:
- Phase 1-3 유지 (체인 후속: 신규 소재 즉시 임베딩)
- Phase 4-5 제거 (Job이 담당)
- Job 트리거 기능 추가 (선택적)

### 4.2 route.ts 수정 범위

```diff
 // Phase 1-3: 기존 로직 유지 (Meta API fetch + embed per ad)
 // ...

-    // 4. content_hash 기반 임베딩 재사용
-    try {
-      ... (약 40줄 삭제)
-    }
-
-    // 5. 임베딩 없는 기존 row 보충
-    try {
-      stats.embeddingResults = await embedMissingCreatives(50, 500);
-    }

+    // Phase 4-5는 Cloud Run Job (embed-creatives-job)이 담당
+    // 체인 트리거 시 Job도 실행
+    if (searchParams.get("chain") === "true") {
+      await triggerEmbedJob();
+    }
```

### 4.3 Job 트리거 함수

```typescript
// src/lib/trigger-job.ts
const PROJECT_ID = process.env.GCP_PROJECT_ID || "modified-shape-477110-h8";
const REGION = "asia-northeast3";

export async function triggerEmbedJob(): Promise<void> {
  const JOB_NAME = "embed-creatives-job";
  const url = `https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run`;

  try {
    // Cloud Run 인스턴스의 메타데이터 서버에서 토큰 획득
    const tokenRes = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-account/default/token",
      { headers: { "Metadata-Flavor": "Google" } }
    );
    const { access_token } = await tokenRes.json();

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!res.ok) {
      console.warn(`[trigger-job] embed-creatives-job 트리거 실패: ${res.status}`);
    } else {
      console.log("[trigger-job] embed-creatives-job 트리거 성공");
    }
  } catch (err) {
    // 로컬 개발 등 메타데이터 서버 없는 환경에서는 무시
    console.warn("[trigger-job] Job 트리거 스킵 (메타데이터 서버 없음):", err);
  }
}
```

---

## 5. Cloud Run Job 배포

### 5.1 Job 생성

```bash
# 1. Dockerfile.scripts로 이미지 빌드
gcloud builds submit \
  --tag asia-northeast3-docker.pkg.dev/modified-shape-477110-h8/bscamp/bscamp-scripts:latest \
  -f Dockerfile.scripts .

# 2. Cloud Run Job 생성
gcloud run jobs create embed-creatives-job \
  --image=asia-northeast3-docker.pkg.dev/modified-shape-477110-h8/bscamp/bscamp-scripts:latest \
  --region=asia-northeast3 \
  --args="scripts/embed-creatives-job.mjs" \
  --task-timeout=3600s \
  --max-retries=1 \
  --memory=1Gi \
  --cpu=1 \
  --set-cloudsql-instances=modified-shape-477110-h8:asia-northeast3:bscamp-db \
  --set-env-vars="GEMINI_API_KEY=${GEMINI_API_KEY},EMBEDDING_MODEL=gemini-embedding-2-preview,EMBEDDING_DIMENSIONS=3072" \
  --set-secrets="DATABASE_URL=bscamp-database-url:latest" \
  --service-account=bscamp-cron@modified-shape-477110-h8.iam.gserviceaccount.com
```

> **주의**: `--set-cloudsql-instances` 필수. 이 플래그 없으면 Unix socket(`/cloudsql/...`) 경로로 DB 연결 불가.
> DATABASE_URL은 Secret Manager에서 주입 (기존 Jobs와 동일 패턴).

### 5.2 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATABASE_URL` | O | Cloud SQL 연결 문자열 (Unix socket: `postgresql://...?host=/cloudsql/...`) |
| `GEMINI_API_KEY` | O | Gemini API 키 |
| `EMBEDDING_MODEL` | X | 기본값: `gemini-embedding-2-preview` |
| `EMBEDDING_DIMENSIONS` | X | 기본값: `3072` (gemini.ts와 동일) |

### 5.3 IAM 권한

```bash
# Job 실행을 위한 서비스 계정 권한
# 1. bscamp-cron Service → Job 트리거 권한
gcloud run jobs add-iam-policy-binding embed-creatives-job \
  --region=asia-northeast3 \
  --member="serviceAccount:bscamp-cron@modified-shape-477110-h8.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

# 2. Cloud Scheduler → Job 트리거 권한
gcloud run jobs add-iam-policy-binding embed-creatives-job \
  --region=asia-northeast3 \
  --member="serviceAccount:modified-shape-477110-h8@appspot.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## 6. Scheduler 설정 변경

### 6.1 기존 HTTP Scheduler 삭제/일시정지

```bash
# 기존 bscamp-embed-creatives (HTTP 트리거) → 일시정지
gcloud scheduler jobs pause bscamp-embed-creatives --location=asia-northeast3
```

### 6.2 신규 Job Scheduler 생성

```bash
gcloud scheduler jobs create http bscamp-job-embed-creatives \
  --location=asia-northeast3 \
  --schedule="0 11 * * *" \
  --time-zone="UTC" \
  --uri="https://asia-northeast3-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/modified-shape-477110-h8/jobs/embed-creatives-job:run" \
  --http-method=POST \
  --oauth-service-account-email="modified-shape-477110-h8@appspot.gserviceaccount.com" \
  --description="embed-creatives Cloud Run Job (매일 20:00 KST)"
```

### 6.3 트리거 구조 (최종)

```
[독립 스케줄 — 매일 20:00 KST]
Cloud Scheduler ──Job API──► embed-creatives-job (Phase A + B)

[체인 트리거 — collect-daily 후]
process-media ──HTTP──► route.ts (Phase 1-3: 신규 소재 임베딩)
                          └──Job API──► embed-creatives-job (Phase A + B: 백필)
```

---

## 7. Gemini Rate Limit 대응 전략

Gemini Embedding API는 분당 요청 수 제한이 있음. 409건 순차 호출 시 429 발생 필연적.

### 7.1 3단계 방어

| 단계 | 방법 | 구현 위치 |
|------|------|----------|
| 1차 | 호출 간 500ms 딜레이 (`DELAY_MS`) | `phaseBatchEmbed()` 루프 내 |
| 2차 | 배치 간 2000ms 딜레이 (`BATCH_DELAY_MS`) | 배치 완료 후 |
| 3차 | Exponential backoff (429 시 2s → 4s → 8s, 최대 3회) | `gemini-embed.mjs` |

### 7.2 429 지속 시 동작

3회 재시도 후에도 429 → 해당 row에 에러 기록 → 다음 row 계속 처리.
`errors > embedded`이면 `exit 1` → Cloud Run Job max-retries=1에 의해 1회 재실행.
재실행 시 이미 처리된 row는 WHERE 조건에서 제외되므로 멱등.

---

## 8. TDD 케이스

### 8.1 테스트 파일

`__tests__/jobs/embed-creatives-job.test.ts`

### 8.2 시나리오

| # | 시나리오 | 입력 조건 | 기대 결과 |
|---|---------|----------|----------|
| T1 | 배치 루프 정상 종료 | 미임베딩 120건 (BATCH_SIZE=50) | 3회 배치 실행 → 120건 처리 → 잔여 0건 → exit 0 |
| T2 | 미임베딩 0건 | 전량 임베딩 완료 상태 | 배치 1에서 즉시 종료 → "처리할 항목 없음" 로그 → exit 0 |
| T3 | 부분 실패 시 계속 진행 | 3번째 row에서 Gemini API 오류 | 해당 row 스킵, 나머지 계속 처리 → errors > 0 기록 → exit 0 |
| T4 | 전량 실패 시 exit 1 | Gemini API 전면 장애 | errors > embedded → exit 1 |
| T5 | content_hash 재사용 | 동일 hash의 기존 임베딩 존재 | Gemini API 호출 없이 DB 복사 → count 증가 |
| T6 | MAX_ITERATIONS 안전장치 | 미임베딩이 계속 생성되는 상황 | 100회 반복 후 강제 종료 → 로그에 잔여 건수 |
| T7 | 진행률 로깅 | 200건 처리 | 배치마다 "배치 N 완료: 누적 X건, 잔여 Y건" 로그 출력 |
| T8 | 429 exponential backoff | Gemini API 429 반환 | 2s → 4s → 8s 재시도 후 성공 (또는 3회 후 에러 기록) |
| T9 | 동시 실행 방지 | advisory lock 이미 획득 상태 | 즉시 exit 0, 로그에 "다른 인스턴스 실행 중" |
| T10 | 이미지 fetch 실패 | media_url이 404 반환 | 해당 row 이미지 임베딩 스킵, 텍스트 임베딩은 정상 처리 |

### 8.3 테스트 구현 방향

```typescript
// __tests__/jobs/embed-creatives-job.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB와 Gemini를 모킹하여 순수 로직 테스트
// 실제 API 호출은 통합 테스트에서

describe("embed-creatives-job", () => {
  describe("phaseBatchEmbed", () => {
    it("T1: 120건을 3배치로 처리하고 정상 종료", async () => {
      // query mock: 1차 50건, 2차 50건, 3차 20건, 4차 0건
      // generateEmbedding mock: 성공 반환
      // 기대: embedded === 120, iterations === 3
    });

    it("T3: 부분 실패 시 나머지 계속 처리", async () => {
      // generateEmbedding mock: 3번째 호출에서 throw
      // 기대: errors === 1, embedded === 49 (50건 중 1건 실패)
    });

    it("T6: MAX_ITERATIONS 초과 시 강제 종료", async () => {
      // query mock: 항상 50건 반환 (무한)
      // MAX_ITERATIONS = 3 (테스트용)
      // 기대: iterations === 3에서 종료
    });
  });

  describe("phaseHashReuse", () => {
    it("T5: 동일 hash의 donor가 있으면 복사", async () => {
      // donor 있는 row → 복사 확인
      // donor 없는 row → 스킵 확인
    });
  });

  describe("gemini-embed", () => {
    it("T8: 429 시 exponential backoff 후 성공", async () => {
      // fetch mock: 1차 429, 2차 429, 3차 200
      // 기대: 총 3회 호출, 최종 성공
    });

    it("T10: 이미지 fetch 404 시 에러 throw", async () => {
      // fetch mock: imgRes.ok = false, status 404
      // 기대: throw Error("이미지 fetch 실패: 404")
    });
  });

  describe("advisory lock", () => {
    it("T9: lock 획득 실패 시 즉시 종료", async () => {
      // pg_try_advisory_lock mock: false 반환
      // 기대: process.exit(0) 호출
    });
  });
});
```

---

## 9. 롤백 방안

### 9.1 단계별 롤백

| 단계 | 실패 시나리오 | 롤백 절차 |
|------|-------------|----------|
| Job 배포 | 이미지 빌드/배포 실패 | 기존 route.ts 유지 (변경 없음) |
| Scheduler 전환 | Job Scheduler 트리거 실패 | 기존 HTTP Scheduler 재개: `gcloud scheduler jobs resume bscamp-embed-creatives` |
| route.ts 수정 | Phase 4-5 제거 후 문제 | git revert로 원복 → 기존 route.ts로 복귀 |
| Job 실행 오류 | 임베딩 품질 문제 | `embedded_at` 기준으로 Job 실행 시간 이후 row만 `embedding = NULL`로 롤백 |

### 9.2 임베딩 데이터 롤백 쿼리

```sql
-- Job 실행 시각 이후 생성된 임베딩만 NULL로 복원
UPDATE creative_media
SET embedding = NULL,
    text_embedding = NULL,
    embedded_at = NULL,
    embedding_model = NULL
WHERE embedded_at >= '2026-03-31T00:00:00Z'
  AND embedding_model = 'gemini-embedding-2-preview';
```

### 9.3 전환 순서 (안전)

```
1. Job 스크립트 작성 + 테스트 ← 기존에 영향 없음
2. Dockerfile.scripts 재빌드 + Job 배포
3. Job 수동 실행 테스트 (gcloud run jobs execute)
4. 성공 확인 후:
   4a. route.ts에서 Phase 4-5 제거
   4b. 기존 HTTP Scheduler 일시정지
   4c. 신규 Job Scheduler 생성
5. 1주 모니터링 후 기존 HTTP Scheduler 삭제
```

---

## 10. 예상 소요 시간

409건 × (이미지 임베딩 + 텍스트 임베딩) × 500ms 딜레이:
- Gemini API 호출: ~1초/건
- 딜레이: 500ms/건
- 배치 간: 2000ms
- 429 backoff 예상: ~30초 (간헐적)
- **예상**: 409 × 1.5초 + 9배치 × 2초 + 30초 ≈ **662초 (~11분)**

Cloud Run Job timeout 3600초 (1시간)이면 충분.

---

## 11. 변경 파일 요약

| 구분 | 파일 | 변경 내용 |
|------|------|----------|
| 신규 | `scripts/lib/gemini-embed.mjs` | Gemini 임베딩 API 호출 헬퍼 (inline_data + backoff) |
| 신규 | `scripts/embed-creatives-job.mjs` | Job 메인 스크립트 (Phase A + B + advisory lock) |
| 수정 | `src/app/api/cron/embed-creatives/route.ts` | Phase 4-5 제거 + Job 트리거 추가 |
| 신규 | `src/lib/trigger-job.ts` | Cloud Run Job 실행 트리거 유틸 |
| 테스트 | `__tests__/jobs/embed-creatives-job.test.ts` | TDD 10 시나리오 |
| 인프라 | Cloud Run Job | `embed-creatives-job` 생성 (`--set-cloudsql-instances` 포함) |
| 인프라 | Cloud Scheduler | HTTP → Job 트리거 전환 |
| 인프라 | IAM | `roles/run.invoker` 바인딩 |

---

## 부록: 코드 검증에서 발견된 원본 설계 오류 (수정 완료)

| # | 원본 설계 오류 | 수정 내용 |
|---|--------------|----------|
| 1 | `gemini-embed.mjs`에서 `fileData: { fileUri }` 사용 | `inline_data: { mime_type, data: base64 }` — 실제 `src/lib/gemini.ts`와 동일 |
| 2 | `gcloud run jobs create`에 `--set-cloudsql-instances` 누락 | 추가 — Unix socket 연결 필수 |
| 3 | Gemini 429 재시도 로직 없음 | Exponential backoff (2s → 4s → 8s, 최대 3회) 추가 |
| 4 | 동시 실행 방지 미논의 | PostgreSQL advisory lock 도입 |
| 5 | `EMBEDDING_DIMENSIONS` 환경변수 미사용 (하드코딩 3072) | `process.env.EMBEDDING_DIMENSIONS` 적용 |
| 6 | `DATABASE_URL`을 `--set-env-vars`로 직접 전달 | `--set-secrets`로 Secret Manager 주입 (보안) |
| 7 | TDD 시나리오 7건 | 10건으로 보강 (T8 backoff, T9 lock, T10 fetch 실패) |
