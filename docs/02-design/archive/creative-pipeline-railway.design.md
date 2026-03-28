# Creative Intelligence 파이프라인 Railway 배포 — Design

## 1. 서비스 구조

```
services/creative-pipeline/
├── Dockerfile          # node:20-slim 기반
├── package.json        # express + 기본 의존성
├── server.js           # Express 엔트리포인트 + 라우팅
├── lib/
│   └── supabase.js     # Supabase REST 헬퍼 (공용)
├── analyze.mjs         # L1: 소재 요소 태깅 (Gemini Vision)
├── benchmark.mjs       # L3: 요소별 성과 벤치마크
└── score.mjs           # L4: 종합 점수 + 제안
```

## 2. API 설계

| Method | Endpoint | Body | 설명 |
|--------|----------|------|------|
| POST | /analyze | `{ limit?, accountId? }` | 소재 요소 태깅 |
| POST | /benchmark | `{ dryRun? }` | 벤치마크 계산 |
| POST | /score | `{ limit?, accountId? }` | 종합 점수 + 제안 |
| POST | /pipeline | `{ limit?, accountId? }` | L1→L3→L4 순차 실행 |
| GET | /health | - | `{ status: "ok", timestamp }` |

## 3. 인증 미들웨어

```js
// bscamp-crawler와 동일 패턴
function auth(req, res, next) {
  const secret = process.env.API_SECRET;
  if (secret && req.headers['x-api-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

- health 엔드포인트는 인증 없음
- 나머지 모든 엔드포인트에 auth 미들웨어 적용

## 4. 모듈 설계

### analyze.mjs
- **export**: `runAnalyze({ limit, accountId })` → `{ analyzed, errors, skipped }`
- 기존 스크립트의 .env.local 파싱 제거 → process.env 사용
- CLI 파싱 제거 → 함수 파라미터로 전환
- Supabase REST 헬퍼를 lib/supabase.js에서 import

### benchmark.mjs
- **export**: `runBenchmark({ dryRun })` → `{ computed, success, errors }`
- 동일하게 .env.local → process.env, CLI → 파라미터

### score.mjs
- **export**: `runScore({ limit, accountId })` → `{ scored, errors, skipped }`
- 동일 패턴

### lib/supabase.js
- `sbGet(path)`, `sbPost(table, row, onConflict?)` 공용 헬퍼
- SB_URL, SB_KEY는 process.env에서 가져옴

## 5. collect-daily 연동

`src/app/api/cron/collect-daily/route.ts`의 `runCollectDaily()` 함수에서:
- 사전계산(precompute) 실행 후, creative pipeline 호출 추가
- 환경변수: `CREATIVE_PIPELINE_URL`, `CREATIVE_PIPELINE_SECRET`
- fetch로 `POST {CREATIVE_PIPELINE_URL}/pipeline` 호출
- 실패해도 collect-daily 결과에는 영향 없음 (catch로 무시)

```ts
// 사전계산 후 추가
let pipelineResult = null;
try {
  const pipelineUrl = process.env.CREATIVE_PIPELINE_URL;
  const pipelineSecret = process.env.CREATIVE_PIPELINE_SECRET;
  if (pipelineUrl) {
    const res = await fetch(`${pipelineUrl}/pipeline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-SECRET': pipelineSecret || '',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(300_000), // 5분
    });
    pipelineResult = await res.json();
  }
} catch (e) {
  console.error('[collect-daily] creative pipeline 호출 실패:', e);
}
```

## 6. 환경변수

### Railway 서비스
| 변수 | 설명 |
|------|------|
| GEMINI_API_KEY | Gemini API 키 |
| NEXT_PUBLIC_SUPABASE_URL | Supabase URL |
| SUPABASE_SERVICE_ROLE_KEY | Supabase 서비스 키 |
| API_SECRET | 인증 시크릿 |
| PORT | 서버 포트 (기본 3000) |

### Vercel (bscamp)
| 변수 | 설명 |
|------|------|
| CREATIVE_PIPELINE_URL | Railway 서비스 URL |
| CREATIVE_PIPELINE_SECRET | Railway API 시크릿 |

## 7. Dockerfile

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## 8. 구현 순서

- [x] 1. Plan 문서 작성
- [x] 2. Design 문서 작성
- [ ] 3. `services/creative-pipeline/lib/supabase.js` — 공용 헬퍼
- [ ] 4. `services/creative-pipeline/analyze.mjs` — L1 모듈화
- [ ] 5. `services/creative-pipeline/benchmark.mjs` — L3 모듈화
- [ ] 6. `services/creative-pipeline/score.mjs` — L4 모듈화
- [ ] 7. `services/creative-pipeline/server.js` — Express 서버
- [ ] 8. `services/creative-pipeline/package.json` — 의존성
- [ ] 9. `services/creative-pipeline/Dockerfile` — 컨테이너
- [ ] 10. `src/app/api/cron/collect-daily/route.ts` — 파이프라인 호출 추가
- [ ] 11. tsc + build 검증
