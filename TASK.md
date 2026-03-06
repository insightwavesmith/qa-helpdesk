# TASK: 광고 계정 카테고리 자동 분류 시스템

## 배경
- `collect-benchmarks` 크론이 7일 주기로 광고 성과 데이터 수집 중
- 현재 benchmarks에 `category` 없이 전체 평균만 제공 → 카테고리별 비교 불가
- BM 계정 45개 중 카테고리 분류된 건 0개
- 수강생은 `profiles.category`에 가입 시 등록

## 목표
`collect-benchmarks` 실행 시 카테고리 미분류 계정을 자동 분류하고, benchmarks에 category별로 집계

## T1. 계정 카테고리 자동 분류 + 벤치마크 카테고리별 집계

### 현재 동작
- benchmarks에 category 없이 전체 평균만 제공
- 계정 45개 모두 카테고리 미분류
- 수강생은 같은 업종끼리 비교 불가

### 기대 동작
- collect-benchmarks 실행 시 미분류 계정이 AI로 자동 분류됨
- benchmarks가 카테고리별로 집계되어 같은 업종끼리 비교 가능

### 하지 말 것
- 기존 collect-benchmarks 로직 (STEP 1~3)의 동작 변경 금지
- profiles 테이블 직접 수정 금지
- 프론트엔드 UI 변경 없음 (이 태스크는 백엔드만)

## 실행 순서
1. migration SQL 확인 (이미 존재)
2. `src/lib/classify-account.ts` 신규 생성
3. `src/app/api/cron/collect-benchmarks/route.ts`에 STEP 0 삽입 + benchmarks 집계에 category 반영
4. `npm run build` 성공 확인

## 리뷰 결과
- TASK.md 확인 완료, 구현 진행

## 구현 사항

### 1. DB 테이블 생성 (migration 파일은 이미 있음)
- `supabase/migrations/20260306115615_add_account_categories.sql` 참조
- `account_categories` 테이블: account_id(PK), category, confidence, signals(jsonb), classified_at, classified_by
- `benchmarks` 테이블에 `category text` 컬럼 추가

### 2. 계정 분류 함수 구현
**파일**: `src/lib/classify-account.ts` (신규)

```typescript
export async function classifyAccount(accountId: string): Promise<{
  category: string;
  confidence: number;
  signals: Record<string, unknown>;
}>
```

**멀티시그널 수집 (순서 = 신뢰도)**:
1. **랜딩 URL 크롤링** — 광고의 `website_url` 필드에서 URL 추출 → fetch로 HTML 가져옴 → `<title>`, `<meta name="description">`, OG tags 추출
2. **광고 소재 텍스트** — 최근 광고 3~5개의 `ad_creative.body`, `ad_creative.title` 수집
3. **계정 이름** — account_name에서 키워드 추출
4. **FB 페이지 카테고리** — 광고 계정의 연결 페이지 → `page.category` (참고용, 정답 아님)

**AI 종합 판단**:
- 수집한 시그널 4개를 모아서 Anthropic Claude Sonnet에 전달
- 프롬프트: "다음 시그널을 종합해서 이 광고 계정의 업종 카테고리를 판단해주세요. 반드시 아래 목록 중 하나로 답해주세요: beauty, fashion, food, health, education, home, pet, kids, sports, digital, finance, travel, etc"
- 응답: `{ category: "beauty", confidence: 0.92 }`

**Meta API 호출**:
- 광고 크리에이티브: `GET /{account_id}/ads?fields=creative{body,title,url_tags},effective_status&effective_status=["ACTIVE","PAUSED"]&limit=5`
- 랜딩 URL: `GET /{ad_id}?fields=creative{asset_feed_spec,object_story_spec}` 또는 `adcreatives` 엔드포인트
- 연결 페이지: `GET /act_{account_id}?fields=business,name` → 페이지 조회

**환경변수**: `META_ACCESS_TOKEN` (.env.local), `ANTHROPIC_API_KEY` (.env.local)

### 3. collect-benchmarks에 STEP 0 삽입
**파일**: `src/app/api/cron/collect-benchmarks/route.ts`

**현재 흐름**:
```
1. Meta API → 활성 계정 목록
2. 각 계정 → 광고 데이터 수집 (노출 3500+ 필터)
3. ad_insights_classified upsert
4. benchmarks 집계
```

**변경 후**:
```
0. [NEW] 각 활성 계정 → 카테고리 체크
   ├─ profiles.meta_account_id 매칭 → profiles.category 사용
   ├─ account_categories 테이블에 있음 → 그대로 사용
   └─ 없음 → classifyAccount() 실행 → account_categories 저장
1. Meta API → 활성 계정 목록 (기존)
2. 각 계정 → 광고 데이터 수집 (기존)
3. ad_insights_classified upsert (기존)
4. benchmarks 집계 → **category 포함** (변경)
```

**주의**: STEP 0에서 분류 실패해도 나머지 흐름은 계속 진행 (category = null)

### 4. benchmarks 집계에 category 반영
- 기존: `creative_type × ranking_type × ranking_group`
- 변경: `creative_type × ranking_type × ranking_group × category`
- category가 null인 계정은 "uncategorized"로 집계

### 5. 타입 업데이트
**파일**: `src/types/database.ts` (또는 해당 타입 파일)
- AccountCategory 인터페이스 추가
- Benchmark 타입에 category 필드 추가

## 참조 코드
- `src/app/api/cron/collect-benchmarks/route.ts` — 현재 크론 로직 (전체 읽을 것)
- `.env.local` — META_ACCESS_TOKEN, ANTHROPIC_API_KEY 위치
- `supabase/migrations/20260306115615_add_account_categories.sql` — DDL

## 제약
- `maxDuration = 300` (Vercel 5분 제한) — 분류 1건당 2~3초면 45건 = ~2분. 여유 있음
- Meta API rate limit 주의 — 200ms 딜레이
- 분류 결과 한 번 저장하면 다시 안 돌림 (classified_by = 'auto'인 건만 재분류 가능)
- AI 호출 비용: Sonnet 기준 건당 ~$0.01 이하. 45건 = ~$0.5

## 테스트
- `classifyAccount` 단독 테스트: 계정 1개로 시그널 수집 + AI 판단 결과 확인
- collect-benchmarks 전체 실행: STEP 0 → 분류 → 집계 → category 포함 확인
