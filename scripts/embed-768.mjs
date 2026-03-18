#!/usr/bin/env node
/**
 * 768차원 임베딩 배치 스크립트
 * Supabase Management API + Gemini Embedding API 직접 호출
 * 사용법: SUPABASE_ACCESS_TOKEN=xxx GEMINI_API_KEY=xxx node scripts/embed-768.mjs
 */

const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const PROJECT_REF = "symvlrsmkjlztoopbnht";
const EMBEDDING_MODEL = "gemini-embedding-2-preview";
const BATCH_SIZE = 20;
const DELAY_MS = 500;

if (!SUPABASE_TOKEN || !GEMINI_KEY) {
  console.error("SUPABASE_ACCESS_TOKEN와 GEMINI_API_KEY 필요");
  process.exit(1);
}

async function supaQuery(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase query failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function embedText(text, dimensions = 768) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: dimensions,
        taskType: "SEMANTIC_SIMILARITY",
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini embedding failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

async function embedImage(imageUrl, dimensions = 768) {
  // fetch image → base64
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.startsWith("image/")
    ? contentType.split(";")[0]
    : "image/jpeg";
  const buffer = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: {
          parts: [{ inline_data: { mime_type: mimeType, data: base64 } }],
        },
        outputDimensionality: dimensions,
        taskType: "SEMANTIC_SIMILARITY",
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini image embedding failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

function vecToSql(vec) {
  return `'[${vec.join(",")}]'::vector(768)`;
}

async function main() {
  // 처리할 건수 확인
  const countResult = await supaQuery(
    "SELECT count(*) as cnt FROM ad_creative_embeddings WHERE embedding_768 IS NULL AND is_active = true"
  );
  let remaining = countResult[0].cnt;
  console.log(`처리 대상: ${remaining}건`);

  let totalProcessed = 0;
  let totalEmbedded = 0;
  let totalErrors = 0;

  while (remaining > 0) {
    // 배치 조회
    const rows = await supaQuery(`
      SELECT id, ad_id, media_url, ad_copy
      FROM ad_creative_embeddings
      WHERE embedding_768 IS NULL AND is_active = true
      ORDER BY created_at
      LIMIT ${BATCH_SIZE}
    `);

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      let imgVec = null;
      let txtVec = null;

      // 이미지 임베딩
      if (row.media_url) {
        try {
          imgVec = await embedImage(row.media_url);
        } catch (err) {
          console.error(`[IMG FAIL] ${row.ad_id}: ${err.message}`);
          totalErrors++;
        }
      }

      // 텍스트 임베딩
      if (row.ad_copy && row.ad_copy.trim().length > 3) {
        try {
          txtVec = await embedText(row.ad_copy);
        } catch (err) {
          console.error(`[TXT FAIL] ${row.ad_id}: ${err.message}`);
          totalErrors++;
        }
      }

      // UPDATE
      if (imgVec || txtVec) {
        const sets = [];
        if (imgVec) sets.push(`embedding_768 = ${vecToSql(imgVec)}`);
        if (txtVec) sets.push(`text_embedding_768 = ${vecToSql(txtVec)}`);
        sets.push(`embedded_at = now()`);

        try {
          await supaQuery(
            `UPDATE ad_creative_embeddings SET ${sets.join(", ")} WHERE id = '${row.id}'`
          );
          totalEmbedded++;
          process.stdout.write(".");
        } catch (err) {
          console.error(`\n[UPDATE FAIL] ${row.ad_id}: ${err.message}`);
          totalErrors++;
        }
      }

      // rate limit 대기
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    totalProcessed += rows.length;
    remaining -= rows.length;
    console.log(
      `\n배치 완료: ${totalProcessed}/${totalProcessed + remaining} (임베딩: ${totalEmbedded}, 에러: ${totalErrors})`
    );
  }

  console.log("\n=== 완료 ===");
  console.log(`처리: ${totalProcessed}, 임베딩: ${totalEmbedded}, 에러: ${totalErrors}`);

  // 최종 확인
  const final = await supaQuery(
    "SELECT count(*) as total, count(embedding_768) as has_768, count(text_embedding_768) as has_txt_768 FROM ad_creative_embeddings"
  );
  console.log("최종 결과:", JSON.stringify(final[0]));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
