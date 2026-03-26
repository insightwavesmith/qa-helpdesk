# Cloud SQL 쿼리 빌더 전수 감사 보고서

> 작성일: 2026-03-26
> 감사자: code-reviewer
> 감사 범위: `src/lib/db/query-builder.ts` 사용처 전체 (`src/` 하위)

---

## 감사 범위

- 88개 파일이 `@/lib/db`에서 `createServiceClient()` import → 전부 `PostgresQueryBuilder` 경유
- `@/lib/supabase/server` 직접 import: **0개** (전환 완료 확인)

---

## 1. 이미 발견된 버그 (BUG 1-4) — backend-dev 수정 중

| # | 버그 | 상태 |
|---|------|------|
| BUG-1 | `alias:table(cols)` FK 없는 패턴 → regex 미매칭 | 수정 중 |
| BUG-2 | `answers(count)` 집계 패턴 미지원 | 수정 중 |
| BUG-3 | `.insert().select()` → `_operation` 덮어쓰기 | 수정 중 |
| BUG-4 | proxy 정적파일 미스킵 | 수정 중 |

---

## 2. 추가 발견 버그

| # | 파일:라인 | 패턴 | 문제 | 심각도 |
|---|----------|------|------|--------|
| BUG-5 | `src/app/api/cron/competitor-check/route.ts:158` | `.upsert(rows, { ignoreDuplicates: true })` | `ignoreDuplicates` 옵션 완전 미구현. `DO NOTHING` 대신 `DO UPDATE SET` 생성 → 기존 pending 행이 덮어씌워짐 | **critical** |
| BUG-5 | `src/app/api/competitor/monitors/route.ts:220` | 동일 | 동일 | **critical** |
| BUG-6 | `src/lib/qa-embedder.ts:26,140` | `.select("..., category:qa_categories(slug)")` | FK 없는 embedded 패턴(`alias:table(cols)`, `!fk` 미포함) → regex 미매칭 → `category:qa_categories(slug)`가 SELECT 컬럼명으로 그대로 전달 → **PostgreSQL 문법 오류** | **critical** |
| BUG-6 | `src/lib/creative-analyzer.ts:78,128` | `.select("..., creatives!inner(ad_id, account_id)")` | `!inner` join 패턴 미지원 → `creatives!inner(ad_id, account_id)` 컬럼명 그대로 → **SQL 문법 오류** | **critical** |
| BUG-7 | `src/lib/creative-analyzer.ts:79,80` | `.eq("creatives.account_id", accountId)` `.eq("creatives.is_active", true)` | BUG-6으로 join이 깨진 상태에서 joined table 컬럼 필터 참조 → `creatives` 테이블이 FROM에 없음 → **runtime 오류** | **critical** |
| BUG-3 확장 | 아래 20+ 파일 | insert/update/upsert 뒤 `.select()` 체이닝 | `select()` 메서드가 항상 `_operation = "select"` 로 덮어씀. 쓰기 작업 무효화, SELECT만 실행됨 | **critical** |

### BUG-3 영향 파일 전체 목록

**insert().select() 체인 (쓰기 유실):**

| 파일 | 라인 | 결과 |
|------|------|------|
| `src/lib/cron-logger.ts` | 9-11 | INSERT 미실행, cron_runs 행 미생성, id=null 반환 |
| `src/actions/organic.ts` | 107-109 | INSERT 미실행, organic_posts 생성 실패 |
| `src/actions/posts.ts` | 163-172 | INSERT 미실행, contents 생성 실패 |
| `src/actions/questions.ts` | 120-133 | INSERT 미실행, questions 생성 실패 |
| `src/actions/contents.ts` | 255-257 | INSERT 미실행, contents 생성 실패 |
| `src/actions/reviews.ts` | 113-122 | INSERT 미실행 |
| `src/actions/reviews.ts` | 164-173 | INSERT 미실행 |
| `src/actions/curation.ts` | 277-288 | INSERT 미실행 |
| `src/actions/qa-reports.ts` | 51-61 | INSERT 미실행 |
| `src/actions/recipients.ts` | 301-308 | INSERT 미실행 |
| `src/actions/recipients.ts` | 369-376 | INSERT 미실행 |
| `src/actions/answers.ts` | 84-92 | INSERT 미실행, answers 생성 실패 |
| `src/lib/channel-api/newsletter.ts` | 181-182 | INSERT 미실행 |
| `src/app/api/internal/add-webinar/route.ts` | 49-59 | INSERT 미실행 |
| `src/app/api/competitor/monitors/route.ts` | 166-175 | INSERT 미실행 |
| `src/app/api/posts/route.ts` | 32-38 | INSERT 미실행 |

**update().select() 체인 (업데이트 유실):**

| 파일 | 라인 | 결과 |
|------|------|------|
| `src/actions/contents.ts` | 341-343 | UPDATE 미실행, 수정 내용 유실 |
| `src/actions/organic.ts` | ~137, ~170 | UPDATE 미실행 |
| `src/actions/posts.ts` | ~220, ~270 | UPDATE 미실행 |
| `src/actions/questions.ts` | ~277 | UPDATE 미실행 |
| `src/actions/leads.ts` | 확인 필요 | UPDATE 미실행 |
| (기타 27개 파일 중 update().select() 체인 포함 분) | — | 개별 확인 필요 |

**upsert().select() 체인 (업서트 유실):**

| 파일 | 라인 | 결과 |
|------|------|------|
| `src/actions/distribution.ts` | 148-152 | UPSERT 미실행, channel_distributions 갱신 실패 |

---

## 3. 정상 동작 확인 항목

| 패턴 | 사용 횟수 | 상태 |
|------|----------|------|
| `.or()` — ilike/is/lt 조합 | 8곳 | ✅ 파서 정상 처리 (값 파라미터화) |
| `.not("col", "is", null)` | 30+ 곳 | ✅ `IS NOT NULL` 정상 변환 |
| `.not("col", "in", '(...)')` | 1곳 (`contents.ts:167`) | ✅ `_parseNotInValue` 정상 처리 |
| `.not("col", "eq", val)` | 0곳 | — |
| `alias:table!fk_name(cols)` FK 포함 패턴 | 3곳 (reviews/questions/answers) | ✅ regex 매칭 및 서브쿼리 생성 정상 |
| `.upsert()` 복합 onConflict | 여러 곳 (`account_id,date,ad_id` 등) | ✅ split로 수정됨 (BUG-4 선행 수정 반영) |
| `.in(col, [])` 빈 배열 | 여러 곳 | ✅ `FALSE` 정상 변환 |
| `.in("metadata->>question_id", ids)` JSONB 경로 | 1곳 | ✅ `_quoteCol` 미가공 통과, PostgreSQL 유효 |
| `.rpc("func", params)` | 3곳 | ✅ named parameter 방식 정상 |
| `{ count: "exact", head: true }` | 2곳 (`curation.ts`) | ✅ COUNT(*) 쿼리 정상 생성 |
| 임베딩 배열 `::vector` 캐스팅 | insert/update 공통 | ✅ `col === "embedding"` 또는 `endsWith("_embedding")` 분기 |
| JSONB 객체 `::jsonb` 캐스팅 | insert/update 공통 | ✅ |
| `.order(col, { ascending, nullsFirst })` | 여러 곳 | ✅ `NULLS FIRST` 정상 포함 |
| `ignoreDuplicates: false` (기본값) | `distribution.ts:150` | ✅ 기본 DO UPDATE SET 동작과 일치 |

---

## 4. 경고 (warning)

| # | 파일 | 패턴 | 문제 |
|---|------|------|------|
| W-1 | `src/actions/posts.ts:59`, `src/actions/search.ts:17`, etc. | `.or(\`col.ilike.%${search}%\`)` | `search`에 `,` 포함 시 `_splitOrConditions`가 잘못 분리 → OR 조건 일부 누락 또는 파서 오류. SQL injection은 아니지만 기능적 오동작 가능 |
| W-2 | `src/app/api/creative/search/route.ts:45`, `src/app/api/admin/knowledge/stats/route.ts:27` | `(svc as any).rpc(...)` | DbClient에 `rpc` 메서드가 있는데 `as any` 캐스팅. 불필요한 타입 우회 |
| W-3 | `src/actions/curation.ts:507` 등 | `(supabase as any).from(...)` | 일부 파일에서 DB 클라이언트를 `as any`로 캐스팅. 타입 안전성 약화 |

---

## 5. 권장 사항

### 긴급 (critical 수정 전 배포 금지)

1. **BUG-3 수정 우선**: `query-builder.ts`의 `select()` 메서드를 `_operation`이 `insert/update/delete/upsert`일 때는 `_applyReturning(columns)` 경로로 분기해야 함
   ```typescript
   select(columns?: string, options?: SelectOptions): this {
     if (this._operation === "insert" || this._operation === "update" ||
         this._operation === "upsert" || this._operation === "delete") {
       this._applyReturning(columns);
     } else {
       this._operation = "select";
       if (columns) this._parseSelectColumns(columns);
       else this._selectColumns = "*";
     }
     ...
   }
   ```

2. **BUG-5 수정**: `upsert()` 메서드에 `_ignoreDuplicates` 필드 추가, `_executeUpsert()`에서 분기
   ```typescript
   const doClause = this._ignoreDuplicates
     ? "DO NOTHING"
     : `DO UPDATE SET ${updateCols}`;
   ```

3. **BUG-6 수정**: `_parseSelectColumns`에 FK-less 패턴 및 `!inner`/`!left` join 패턴 추가
   ```typescript
   // FK-less: alias:table(cols)
   const embedRegexNoFk = /(\w+):(\w+)\(([^)]+)\)/g;
   // inner/left join: table!inner(cols) or table!left(cols)
   const innerJoinRegex = /(\w+)!(inner|left|right)\(([^)]+)\)/g;
   ```

### 중기

4. `.or()` 호출 시 사용자 입력값 검증 — 특수문자(`,`, `.`)가 있을 경우 ilike 패턴을 직접 `.ilike()` 메서드 체인으로 대체하는 것이 안전

5. `ignoreDuplicates` 외 `onConflict: undefined` 케이스에서도 `id`를 기본 conflict 컬럼으로 가정하는 로직 검토 — 일부 테이블은 id가 PK가 아닐 수 있음

---

## 요약

| 분류 | 건수 |
|------|------|
| Critical (즉시 수정 필요) | **BUG-3(20+파일), BUG-5(2파일), BUG-6/7(4파일)** |
| Warning | 3건 |
| 정상 확인 | 15+ 패턴 |

**BUG-3**이 가장 심각 — 사실상 모든 쓰기 작업(insert/update/upsert)에 `.select()` 체이닝이 있는 파일에서 데이터가 저장되지 않음. Cloud SQL 전환 이후 서비스 전체의 데이터 쓰기가 부분적으로 무효화된 상태.

---

## 수정 완료 검증 (2026-03-26)

### Match Rate: 100% (9/9건 수정)

| # | 버그 | 수정 내용 | 검증 |
|---|------|-----------|------|
| BUG-1 | alias:table(cols) FK없는 패턴 | Step 3 regex 추가 | ✅ d6e9daf |
| BUG-2 | table(count) 집계 | Step 2 countRegex 추가 | ✅ d6e9daf |
| BUG-3 | .insert().select() operation 덮어쓰기 | select()에 operation 보호 조건 | ✅ 로컬 검증 |
| BUG-4 | proxy 정적파일 스킵 | updateSession() 상단 필터 | ✅ c4e0689 |
| BUG-5 | ignoreDuplicates DO NOTHING | _ignoreDuplicates 필드 + SQL 분기 | ✅ 로컬 검증 |
| BUG-6 | table!inner() 패턴 | Step 1 inner 체크 + Step 2.5 | ✅ 로컬 검증 |
| BUG-7 | dot-notation 필터 | _quoteCol split + _quoteColPart | ✅ 로컬 검증 |
| Proxy | middleware→proxy 컨벤션 | proxy.ts export function proxy | ✅ dbfdb29 |
| Speed | verifySessionCookie(true→false) | JWT 로컬 검증 전환 | ✅ 로컬 검증 |

### 빌드 검증
- `npx tsc --noEmit`: 에러 0개 ✅
- `npm run build`: 성공 ✅
