// 전체 콘텐츠 임베딩 스크립트
// lecture_chunks 테이블의 모든 행을 Gemini text-embedding-004로 임베딩
// 실행: npx dotenv -e .env.local -- node scripts/embed-all.mjs
import "dotenv/config";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY 환경변수가 필요합니다.");
if (!SUPABASE_URL) throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 필요합니다.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");

async function generateEmbedding(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.embedding.values;
}

async function main() {
  // 1. lecture_chunks 가져오기
  console.log("lecture_chunks 조회 중...");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/lecture_chunks?select=id,content&order=id`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const chunks = await res.json();
  console.log(`총 ${chunks.length}개 청크 발견\n`);

  let success = 0;
  let fail = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      // rate limit: 1500/day, ~100/min safe
      if (i > 0 && i % 50 === 0) {
        console.log(`  ... ${i}/${chunks.length} 완료, 10초 대기`);
        await new Promise(r => setTimeout(r, 10000));
      }

      const embedding = await generateEmbedding(chunk.content);
      
      // Supabase에 업데이트
      const upRes = await fetch(
        `${SUPABASE_URL}/rest/v1/lecture_chunks?id=eq.${chunk.id}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ embedding }),
        }
      );
      
      if (!upRes.ok) throw new Error(`Update failed: ${upRes.status}`);
      success++;
      
      if ((i + 1) % 100 === 0) {
        console.log(`[${i + 1}/${chunks.length}] ${success} 성공, ${fail} 실패`);
      }
    } catch (e) {
      fail++;
      console.error(`[${i + 1}] ID ${chunk.id} 실패: ${e.message}`);
    }
  }

  console.log(`\n완료: ${success} 성공, ${fail} 실패 (총 ${chunks.length})`);
}

main().catch(console.error);
