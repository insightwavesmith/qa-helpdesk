# 수집 구조 리팩토링 설계서

## 1. 데이터 모델

### creatives 테이블 변경
```sql
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT false;
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS is_benchmark BOOLEAN DEFAULT false;
```
- `is_member`: 수강생 계정 소재 (collect-daily source='member')
- `is_benchmark`: 벤치마크 기준 초과 소재 (collect-benchmark source='benchmark')
- 둘 다 true 가능 (수강생이면서 벤치마크 기준 초과)
- 기존 `source` 컬럼 유지 (하위 호환)

### creative_media 테이블 변경
```sql
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS raw_creative JSONB;
```
- Meta Creative API 응답 원본 저장
- 기존 media_type, media_url 등 컬럼 유지

### 기존 데이터 태깅
```sql
UPDATE creatives SET is_member = true WHERE source = 'member';
UPDATE creatives SET is_benchmark = true WHERE source = 'benchmark';
```

## 2. API 설계

### collect-daily route 변경
- creatives upsert 시 `is_member: true` 추가
- creative_media upsert 시 `raw_creative: ad.creative` 추가

### collect-benchmark-creatives.mjs 변경
- creatives upsert 시 `is_benchmark: true` 추가
- creative_media upsert 시 `raw_creative: creative` 추가

## 3. 컴포넌트 구조
변경 파일:
- `supabase/migrations/20260324_collection_refactor.sql` — 스키마 변경
- `src/app/api/cron/collect-daily/route.ts` — is_member + raw_creative
- `scripts/collect-benchmark-creatives.mjs` — is_benchmark + raw_creative
- `src/types/database.ts` — 타입 추가

## 4. 에러 처리
- is_member/is_benchmark DEFAULT false — 기존 레코드 영향 없음
- raw_creative NULL 허용 — 기존 데이터 보존

## 5. 구현 순서
1. [ ] 마이그레이션 SQL 작성
2. [ ] collect-daily route 수정 (is_member + raw_creative on creative_media)
3. [ ] collect-benchmark-creatives 수정 (is_benchmark + raw_creative on creative_media)
4. [ ] database.ts 타입 업데이트
5. [ ] 빌드 검증 + 커밋
