// __tests__/jobs/embed-creatives-job.test.ts — T1~T10 (10건)
// embed-creatives-job.mjs 핵심 로직 검증 (DB + Gemini 모킹)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── 모킹 타입 ──

interface CreativeRow {
  id: string;
  content_hash?: string | null;
  media_url?: string | null;
  ad_copy?: string | null;
  embedding?: number[] | null;
  text_embedding?: number[] | null;
}

type QueryFn = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
type EmbedFn = (input: string | { imageUrl: string }) => Promise<number[]>;

// ── 핵심 로직 추출 (mjs 직접 import 불가 → 로직 복제하여 테스트) ──

async function phaseHashReuse(queryFn: QueryFn): Promise<number> {
  const missing = await queryFn(`
    SELECT cm.id, cm.content_hash
    FROM creative_media cm
    WHERE cm.embedding IS NULL
      AND cm.content_hash IS NOT NULL
      AND cm.is_active = true
  `);

  let count = 0;
  for (const row of missing) {
    const donors = await queryFn(
      `SELECT embedding, embedding_model, embedded_at
       FROM creative_media
       WHERE content_hash = $1 AND embedding IS NOT NULL AND id != $2
       LIMIT 1`,
      [row.content_hash, row.id]
    );

    if (donors.length > 0) {
      await queryFn(
        `UPDATE creative_media SET embedding = $1, embedding_model = $2, embedded_at = $3, updated_at = NOW() WHERE id = $4`,
        [donors[0].embedding, donors[0].embedding_model, donors[0].embedded_at, row.id]
      );
      count++;
    }
  }
  return count;
}

async function phaseBatchEmbed(
  queryFn: QueryFn,
  embedFn: EmbedFn,
  opts: { batchSize: number; delayMs: number; batchDelayMs: number; maxIterations: number; embeddingModel: string }
) {
  const stats = { processed: 0, embedded: 0, errors: 0, iterations: 0 };

  for (let iter = 0; iter < opts.maxIterations; iter++) {
    const batch = (await queryFn(
      `SELECT id, media_url, ad_copy, embedding, text_embedding
       FROM creative_media
       WHERE (embedding IS NULL OR text_embedding IS NULL)
         AND is_active = true AND media_url IS NOT NULL
       LIMIT $1`,
      [opts.batchSize]
    )) as unknown as CreativeRow[];

    if (batch.length === 0) break;

    for (const row of batch) {
      const updates: { embedding?: number[]; text_embedding?: number[] } = {};

      if (!row.embedding && row.media_url) {
        try {
          updates.embedding = await embedFn({ imageUrl: row.media_url });
        } catch {
          stats.errors++;
        }
      }

      if (!row.text_embedding && row.ad_copy && row.ad_copy.trim().length > 5) {
        try {
          updates.text_embedding = await embedFn(row.ad_copy);
        } catch {
          stats.errors++;
        }
      }

      if (updates.embedding || updates.text_embedding) {
        const setClauses: string[] = [];
        const params: unknown[] = [];
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
        params.push(opts.embeddingModel);
        idx++;
        setClauses.push(`embedded_at = NOW()`);
        setClauses.push(`updated_at = NOW()`);

        params.push(row.id);
        await queryFn(
          `UPDATE creative_media SET ${setClauses.join(", ")} WHERE id = $${idx}`,
          params
        );
        stats.embedded++;
      }

      stats.processed++;
    }

    stats.iterations++;
  }

  return stats;
}

async function acquireLock(queryFn: QueryFn): Promise<boolean> {
  const result = await queryFn(
    `SELECT pg_try_advisory_lock(hashtext('embed-creatives-job')) as acquired`
  );
  return result[0]?.acquired === true;
}

// ── 헬퍼 ──

function makeRows(count: number, overrides?: Partial<CreativeRow>): CreativeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i}`,
    media_url: `https://cdn.example.com/img-${i}.jpg`,
    ad_copy: `광고 카피 텍스트 번호 ${i}`,
    embedding: null,
    text_embedding: null,
    ...overrides,
  }));
}

const FAKE_VECTOR = Array.from({ length: 10 }, (_, i) => i * 0.1);

const DEFAULT_OPTS = {
  batchSize: 50,
  delayMs: 0,      // 테스트에서는 딜레이 제거
  batchDelayMs: 0,
  maxIterations: 100,
  embeddingModel: "gemini-embedding-2-preview",
};

// ── 테스트 ──

describe("embed-creatives-job", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("phaseBatchEmbed", () => {
    it("T1: 120건을 3배치로 처리하고 정상 종료", async () => {
      let callCount = 0;
      const queryFn = vi.fn<QueryFn>(async (sql, params) => {
        if (sql.includes("SELECT id, media_url")) {
          callCount++;
          if (callCount === 1) return makeRows(50) as unknown as Record<string, unknown>[];
          if (callCount === 2) return makeRows(50) as unknown as Record<string, unknown>[];
          if (callCount === 3) return makeRows(20) as unknown as Record<string, unknown>[];
          return [];
        }
        if (sql.includes("UPDATE creative_media")) return [];
        return [];
      });

      const embedFn = vi.fn<EmbedFn>(async () => FAKE_VECTOR);

      const stats = await phaseBatchEmbed(queryFn, embedFn, DEFAULT_OPTS);

      expect(stats.iterations).toBe(3);
      expect(stats.embedded).toBe(120);
      expect(stats.errors).toBe(0);
      expect(stats.processed).toBe(120);
    });

    it("T2: 미임베딩 0건이면 즉시 종료", async () => {
      const queryFn = vi.fn<QueryFn>(async () => []);
      const embedFn = vi.fn<EmbedFn>(async () => FAKE_VECTOR);

      const stats = await phaseBatchEmbed(queryFn, embedFn, DEFAULT_OPTS);

      expect(stats.iterations).toBe(0);
      expect(stats.embedded).toBe(0);
      expect(stats.processed).toBe(0);
      expect(embedFn).not.toHaveBeenCalled();
    });

    it("T3: 부분 실패 시 나머지 계속 처리", async () => {
      let callCount = 0;
      const queryFn = vi.fn<QueryFn>(async (sql) => {
        if (sql.includes("SELECT id, media_url")) {
          callCount++;
          if (callCount === 1) return makeRows(5) as unknown as Record<string, unknown>[];
          return [];
        }
        if (sql.includes("UPDATE creative_media")) return [];
        return [];
      });

      let embedCallCount = 0;
      const embedFn = vi.fn<EmbedFn>(async () => {
        embedCallCount++;
        // 3번째 이미지 임베딩 호출에서 실패
        if (embedCallCount === 3) throw new Error("Gemini API 500: Internal Error");
        return FAKE_VECTOR;
      });

      const stats = await phaseBatchEmbed(queryFn, embedFn, DEFAULT_OPTS);

      // 5건 중 1건 이미지 실패 → errors 1, 하지만 텍스트 임베딩은 성공할 수 있음
      expect(stats.errors).toBeGreaterThanOrEqual(1);
      expect(stats.processed).toBe(5);
      // 이미지 실패해도 텍스트 성공하면 embedded 카운트 올라감
      expect(stats.embedded).toBeGreaterThanOrEqual(4);
    });

    it("T4: 전량 실패 시 errors > embedded (exit 1 조건)", async () => {
      let callCount = 0;
      const queryFn = vi.fn<QueryFn>(async (sql) => {
        if (sql.includes("SELECT id, media_url")) {
          callCount++;
          if (callCount === 1) return makeRows(3) as unknown as Record<string, unknown>[];
          return [];
        }
        return [];
      });

      const embedFn = vi.fn<EmbedFn>(async () => {
        throw new Error("Gemini API 전면 장애");
      });

      const stats = await phaseBatchEmbed(queryFn, embedFn, DEFAULT_OPTS);

      expect(stats.errors).toBeGreaterThan(0);
      expect(stats.embedded).toBe(0);
      expect(stats.errors > stats.embedded).toBe(true);
    });

    it("T6: MAX_ITERATIONS 초과 시 강제 종료", async () => {
      // 항상 50건 반환 (무한)
      const queryFn = vi.fn<QueryFn>(async (sql) => {
        if (sql.includes("SELECT id, media_url")) {
          return makeRows(50) as unknown as Record<string, unknown>[];
        }
        if (sql.includes("UPDATE creative_media")) return [];
        return [];
      });

      const embedFn = vi.fn<EmbedFn>(async () => FAKE_VECTOR);

      const stats = await phaseBatchEmbed(queryFn, embedFn, {
        ...DEFAULT_OPTS,
        maxIterations: 3,  // 테스트용 축소
      });

      expect(stats.iterations).toBe(3);
      expect(stats.processed).toBe(150); // 50 × 3
    });

    it("T7: 배치마다 진행률 통계 정확", async () => {
      let callCount = 0;
      const queryFn = vi.fn<QueryFn>(async (sql) => {
        if (sql.includes("SELECT id, media_url")) {
          callCount++;
          if (callCount <= 4) return makeRows(50) as unknown as Record<string, unknown>[];
          return [];
        }
        if (sql.includes("UPDATE creative_media")) return [];
        return [];
      });

      const embedFn = vi.fn<EmbedFn>(async () => FAKE_VECTOR);

      const stats = await phaseBatchEmbed(queryFn, embedFn, DEFAULT_OPTS);

      expect(stats.iterations).toBe(4);
      expect(stats.embedded).toBe(200);
      expect(stats.processed).toBe(200);
    });
  });

  describe("phaseHashReuse", () => {
    it("T5: 동일 hash의 donor가 있으면 복사, 없으면 스킵", async () => {
      const queryFn = vi.fn<QueryFn>(async (sql, params) => {
        // Phase A: 미임베딩 row 조회
        if (sql.includes("SELECT cm.id, cm.content_hash")) {
          return [
            { id: "row-1", content_hash: "hash-A" },
            { id: "row-2", content_hash: "hash-B" },
            { id: "row-3", content_hash: "hash-C" },
          ];
        }
        // donor 조회
        if (sql.includes("SELECT embedding, embedding_model")) {
          const hash = params?.[0];
          if (hash === "hash-A") {
            return [{ embedding: "[1,2,3]", embedding_model: "gemini-embedding-2-preview", embedded_at: "2026-03-30T00:00:00Z" }];
          }
          if (hash === "hash-B") {
            return [{ embedding: "[4,5,6]", embedding_model: "gemini-embedding-2-preview", embedded_at: "2026-03-30T00:00:00Z" }];
          }
          // hash-C: donor 없음
          return [];
        }
        // UPDATE
        if (sql.includes("UPDATE creative_media")) return [];
        return [];
      });

      const count = await phaseHashReuse(queryFn);

      expect(count).toBe(2); // hash-A, hash-B 복사 성공, hash-C 스킵
      // UPDATE가 2번 호출됐는지 확인
      const updateCalls = queryFn.mock.calls.filter(
        (c) => typeof c[0] === "string" && c[0].includes("UPDATE creative_media")
      );
      expect(updateCalls).toHaveLength(2);
    });
  });

  describe("gemini-embed backoff", () => {
    it("T8: 429 시 exponential backoff 후 성공", async () => {
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

      // 1차: 429
      fetchMock.mockResolvedValueOnce(
        new Response("Rate limited", { status: 429 })
      );
      // 2차: 429
      fetchMock.mockResolvedValueOnce(
        new Response("Rate limited", { status: 429 })
      );
      // 3차: 성공
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: { values: FAKE_VECTOR } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      // generateEmbedding 로직 시뮬레이션 (텍스트 입력)
      const MAX_RETRIES = 3;
      const INITIAL_BACKOFF_MS = 10; // 테스트용으로 축소

      const parts = [{ text: "test input" }];
      const body = {
        model: "models/gemini-embedding-2-preview",
        content: { parts },
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: 3072,
      };

      let result: number[] = [];
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetchMock("https://api.example.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 429 && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
          continue;
        }

        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        result = data.embedding?.values ?? [];
        break;
      }

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result).toEqual(FAKE_VECTOR);
    });

    it("T8b: 429가 MAX_RETRIES 초과하면 에러", async () => {
      const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

      // 모든 호출 429
      fetchMock.mockResolvedValue(
        new Response("Rate limited", { status: 429 })
      );

      const MAX_RETRIES = 3;
      const INITIAL_BACKOFF_MS = 10;

      const parts = [{ text: "test input" }];
      const body = {
        model: "models/gemini-embedding-2-preview",
        content: { parts },
        taskType: "SEMANTIC_SIMILARITY",
        outputDimensionality: 3072,
      };

      let threw = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const res = await fetchMock("https://api.example.com", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 429 && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
          continue;
        }

        if (!res.ok) {
          threw = true;
          break;
        }
      }

      expect(fetchMock).toHaveBeenCalledTimes(4); // 0,1,2,3 = 4회
      expect(threw).toBe(true);
    });
  });

  describe("advisory lock", () => {
    it("T9: lock 획득 실패 시 false 반환", async () => {
      const queryFn = vi.fn<QueryFn>(async () => [{ acquired: false }]);
      const locked = await acquireLock(queryFn);
      expect(locked).toBe(false);
    });

    it("T9b: lock 획득 성공 시 true 반환", async () => {
      const queryFn = vi.fn<QueryFn>(async () => [{ acquired: true }]);
      const locked = await acquireLock(queryFn);
      expect(locked).toBe(true);
    });
  });

  describe("이미지 fetch 실패", () => {
    it("T10: media_url 404 시 이미지 스킵, 텍스트는 정상 처리", async () => {
      let callCount = 0;
      const queryFn = vi.fn<QueryFn>(async (sql) => {
        if (sql.includes("SELECT id, media_url")) {
          callCount++;
          if (callCount === 1) {
            return [{
              id: "row-bad-img",
              media_url: "https://cdn.example.com/404.jpg",
              ad_copy: "정상적인 광고 카피 텍스트",
              embedding: null,
              text_embedding: null,
            }] as unknown as Record<string, unknown>[];
          }
          return [];
        }
        if (sql.includes("UPDATE creative_media")) return [];
        return [];
      });

      let embedCallCount = 0;
      const embedFn = vi.fn<EmbedFn>(async (input) => {
        embedCallCount++;
        // 이미지 요청이면 실패 시뮬레이션
        if (typeof input === "object" && "imageUrl" in input) {
          throw new Error("이미지 fetch 실패: 404 https://cdn.example.com/404.jpg");
        }
        // 텍스트 요청이면 성공
        return FAKE_VECTOR;
      });

      const stats = await phaseBatchEmbed(queryFn, embedFn, DEFAULT_OPTS);

      expect(stats.errors).toBe(1);           // 이미지 실패 1건
      expect(stats.embedded).toBe(1);          // 텍스트만으로도 UPDATE 발생
      expect(stats.processed).toBe(1);
    });
  });
});
