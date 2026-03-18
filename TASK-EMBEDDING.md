# TASK: Phase 1 임베딩 v2 배포 + 소재 seed

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
- `feat/embedding-v2-migration` 브랜치에 Phase 1 코드 완료 (`3edccf9`)
- Supabase migration SQL 준비됨
- Vercel 환경변수 설정됨 (EMBEDDING_MODEL, EMBEDDING_DIMENSIONS)
- ad_creative_embeddings 테이블: 0건 (seed 필요)

## 작업 순서 (반드시 이 순서)

### Step 1: Supabase Migration SQL 실행
Supabase Management API로 3개 SQL 파일 실행:

```bash
# 프로젝트 ref: symvlrsmkjlztoopbnht
# 토큰: $SUPABASE_ACCESS_TOKEN 환경변수 사용

# 1. 임베딩 v2 컬럼 + RPC
curl -X POST "https://api.supabase.com/v1/projects/symvlrsmkjlztoopbnht/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL내용>"}'
```

실행할 파일:
1. `supabase/migrations/20260316_embedding_v2.sql`
2. `supabase/migrations/20260316_ad_creative_embeddings.sql` (이미 실행됐을 수 있음 — 에러나면 skip)
3. `supabase/migrations/20260316_search_similar_creatives.sql`
4. `supabase/migrations/20260317_creative_screenshot_hash.sql`

**주의**: 이미 존재하는 테이블/함수면 `IF NOT EXISTS` 또는 `CREATE OR REPLACE`로 안전. 에러나면 무시하고 다음으로.

### Step 2: feature 브랜치 → main merge
```bash
git checkout main
git merge feat/embedding-v2-migration --no-ff -m "merge: Phase 1 임베딩 v2 교체"
# tsc + build 확인
npx tsc --noEmit
npm run build
# 성공하면 push
git push origin main
```

### Step 3: Vercel 배포 확인
- `git push` 후 Vercel 자동 배포 대기
- 배포 완료 확인: `curl -s -o /dev/null -w "%{http_code}" https://bscamp.vercel.app`

### Step 4: 재임베딩 실행
knowledge_chunks 3,488건의 embedding_v2 생성:

```bash
# admin 계정으로 로그인 후 쿠키 필요
# 또는 service_role_key로 직접 Supabase 호출

# 방법 1: reembed API 반복 호출 (Vercel 배포 후)
# POST https://bscamp.vercel.app/api/admin/reembed
# Body: {"batchSize": 100, "delayMs": 500}
# → remaining이 0이 될 때까지 반복

# 방법 2: 로컬에서 실행 (더 빠름)
# .env.local에 GEMINI_API_KEY 있으니까
npm run dev &
# 로컬에서 반복 호출
for i in $(seq 1 40); do
  echo "Batch $i..."
  curl -s -X POST http://localhost:3000/api/admin/reembed \
    -H "Content-Type: application/json" \
    -H "Cookie: <admin-cookie>" \
    -d '{"batchSize": 100, "delayMs": 300}'
  sleep 2
done
```

**주의**: reembed API는 admin 인증 필요. 로컬 dev server에서도 Supabase auth로 로그인해야 함.
→ 대안: Supabase service_role_key로 직접 UPDATE 쿼리 + Gemini API 호출하는 스크립트 작성이 더 현실적.

### Step 5: 소재 Seed
ad_creative_embeddings에 349개 광고 소재 데이터 수집:

```bash
# POST https://bscamp.vercel.app/api/admin/seed-creatives
# 또는 로컬에서:
curl -X POST http://localhost:3000/api/admin/seed-creatives \
  -H "Cookie: <admin-cookie>"
```

이것도 admin 인증 필요. Step 4와 같은 방법으로.

## 검증
- [ ] knowledge_chunks.embedding_v2 NOT NULL 건수 확인 (3,488 목표)
- [ ] ad_creative_embeddings 건수 확인 (300+ 목표)
- [ ] search_knowledge RPC v2 동작 확인
- [ ] `tsc --noEmit` + `next build` 통과
- [ ] bscamp.vercel.app 정상 접근

## 금지사항
- .env.local 수정 금지
- Vercel 환경변수 변경 금지 (이미 설정됨)
- main 브랜치 force push 금지
