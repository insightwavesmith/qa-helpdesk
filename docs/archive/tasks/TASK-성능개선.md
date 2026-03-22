# TASK: 수강생 체감 서비스 로딩 속도 개선

## 배경
서비스 전체가 느리다. 페이지 전환할 때마다 로딩이 걸리고, 경쟁사 검색도 느리다.
수강생이 매일 쓰는 서비스인데 이 속도면 이탈한다.

## 왜 필요한가
오늘 서비스 오픈인데 첫인상이 "느리다"면 끝이다.
로그인 후 첫 화면부터 빠르게 뜨고, 페이지 이동 시 데이터가 즉시 나와야 한다.

## T1: 로그인 시 데이터 프리페치 + 캐싱

### 이게 뭔지
로그인 성공 후 대시보드에 도달하기 전에, 수강생이 자주 쓰는 데이터를 미리 가져와서 캐싱해두는 것.

### 왜 필요한지
지금은 각 페이지에 들어갈 때마다 API를 호출한다. 페이지 전환할 때마다 로딩 스피너가 뜨고, 데이터가 느리게 나온다.
로그인할 때 미리 받아두면 이후 페이지 전환이 즉시 느껴진다.

### 구현 내용
- 로그인 직후 (또는 대시보드 layout 마운트 시) SWR prefetch 실행
  - 총가치각도기 데이터 (계정 목록, 최근 인사이트)
  - 질문 목록 (최근 10개)
  - 콘텐츠/공지 목록
- `SWRConfig` provider에 `fallback` 데이터로 주입하거나, `mutate`로 캐시 워밍
- 이후 각 페이지에서 SWR가 캐시 히트 → 로딩 없이 즉시 렌더링
- `revalidateOnFocus: false`, `dedupingInterval: 60000` 등 SWR 옵션 최적화

## T2: DB 인덱스 일괄 생성

### 이게 뭔지
자주 조회하는 테이블에 인덱스가 없어서 매번 전체 테이블을 스캔한다. 인덱스를 만들면 쿼리가 빨라진다.

### 왜 필요한지
현재 주요 테이블 9개에 인덱스가 없다. 데이터가 늘어날수록 점점 느려진다.

### 구현 내용
Supabase SQL Editor에서 아래 인덱스 생성 (코드 수정 X, DB만):
```sql
-- 질문/답변
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_is_approved ON answers(is_approved);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_category_id ON questions(category_id);

-- 광고 인사이트
CREATE INDEX IF NOT EXISTS idx_daily_ad_insights_account_date ON daily_ad_insights(account_id, date);

-- 콘텐츠
CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_category ON contents(category);

-- 지식 베이스
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_content_id ON knowledge_chunks(content_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_source_type ON knowledge_chunks(source_type, lecture_name);

-- 사용자
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_user_id ON ad_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_ad_accounts_account_id ON ad_accounts(account_id);
```
인덱스 생성 후 느린 쿼리가 개선되는지 확인.

## T3: 질문 목록 N+1 쿼리 제거

### 이게 뭔지
질문 목록 페이지에서 질문 10개를 가져온 후, 각 질문의 답변 수를 개별로 10번 더 조회한다 (N+1 패턴).

### 왜 필요한지
질문 페이지 로드가 느린 직접적인 원인. 1번 쿼리로 끝낼 수 있는 걸 11번 하고 있다.

### 구현 내용
- `src/actions/questions.ts` — 질문 조회 시 답변 count를 한번에 가져오도록 수정
- 방법 1: Supabase `.select("*, answers(count)")` 사용
- 방법 2: 질문 ID 배열로 `.in("question_id", ids)` 일괄 조회
- 기존 개별 조회 코드 제거

## T4: 경쟁사 한글 검색 캐시

### 이게 뭔지
한글 브랜드명 → 영문 변환 → SearchAPI 검색 과정이 매번 외부 API 3-hop을 순차 호출해서 7초 걸린다.

### 왜 필요한지
수강생이 경쟁사 검색할 때 7초 기다리는 건 너무 느리다. 한번 검색한 브랜드는 캐시해서 2초 안에 나와야 한다.

### 구현 내용
- `src/app/api/competitor/search/route.ts` — suggestEnglishName 결과를 메모리 또는 DB 캐시
- 캐시 키: 한글 브랜드명 → 값: { englishName, pageId, TTL }
- 첫 검색: 기존대로 3-hop (7초) → 결과 캐시 저장
- 재검색: 캐시 히트 → SearchAPI만 호출 (2초)
- TTL: 24시간 (브랜드명-영문 매핑은 잘 안 바뀜)
- 구현 옵션: Supabase 테이블 `brand_name_cache` or 서버 Map (Vercel serverless = 인스턴스 재활용 시만 유효)
  → Supabase 테이블 추천 (영구 캐시)

## T5: recharts lazy loading

### 이게 뭔지
차트 라이브러리(recharts, ~200KB)가 페이지 초기 로드에 포함되어 있어서 첫 화면이 느리다.

### 왜 필요한지
총가치각도기 진입 시 차트가 안 보이는 상태에서도 200KB를 다운받는다. lazy loading하면 필요할 때만 불러온다.

### 구현 내용
- recharts 사용하는 컴포넌트들을 `next/dynamic`으로 감싸기:
  - `OverlapAnalysis.tsx`
  - `PerformanceTrendChart.tsx`
  - `PerformanceChart.tsx`
  - `WeeklyChart.tsx`
- 예시: `const OverlapAnalysis = dynamic(() => import("./OverlapAnalysis"), { ssr: false })`
- loading placeholder 추가 (스켈레톤 or 빈 div)

## 산출물
- T1: SWR prefetch 코드 + SWRConfig 최적화
- T2: SQL 실행 결과 (인덱스 생성 확인)
- T3: questions.ts 수정
- T4: brand_name_cache 테이블 + 캐시 로직
- T5: dynamic import 적용

## 제약
- 수강생 화면 우선. 관리자 페이지는 건드리지 마라.
- T2 인덱스는 Supabase Management API로 실행 (`$SUPABASE_ACCESS_TOKEN` 사용)
- 빌드 깨지면 안 된다 (tsc + lint + build 검증 필수)
