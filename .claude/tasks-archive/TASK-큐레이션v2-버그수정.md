# TASK: 큐레이션 v2 Phase 2 — 버그 수정

## 목표
큐레이션 탭에서 관리자가 콘텐츠를 탐색할 때 내부 메타데이터나 깨진 포맷 없이 깔끔한 정보만 보이게 한다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

---

## T1. 토픽맵 그룹명 + 카드 태그에 내부 메타데이터 노출

### 파일
- `src/components/curation/curation-card.tsx`
- `src/components/curation/topic-map-view.tsx`

### 현재 동작
카드 태그 뱃지에 `guide_type:학습가이드`, `section_index:0`, `section_title:1 Core campaign elements` 등 내부 메타데이터가 그대로 보인다.
토픽맵에서도 이런 메타데이터가 그룹명으로 사용된다.
현재 필터(`isMetadataKey`)가 일부 패턴만 걸러내고 있어서 `guide_type`, `section_index`, `section_title` 등 56종류가 빠져나간다.

### 기대 동작
- 카드 태그와 토픽맵 그룹명에 내부 메타데이터가 절대 노출되지 않는다
- 유효 토픽이 없는 콘텐츠는 토픽맵에서 "미분류"로 분류된다
- 유효 토픽이 없으면 태그 영역을 숨긴다
- 필터 로직이 두 파일에 중복되어 있으므로 한 곳으로 통합한다

### 하지 말 것
- key_topics DB 데이터를 수정하지 마라

---

## T2. AI 요약 불릿에 JSON 배열 문자열 노출

### 파일
- `src/components/curation/curation-card.tsx`

### 현재 동작
일부 카드의 AI 요약 불릿에 `["타겟팅 제한은...", "데이터 기반 분석을..."]` 형태의 JSON 배열 문자열이 그대로 보인다.

### 기대 동작
- 어떤 포맷의 AI 요약이든 (JSON 객체, JSON 배열, 불릿 안 배열 문자열) 순수 텍스트 불릿으로 표시된다
- JSON 문법 문자(`[`, `]`, `"`, `{`, `}`)가 사용자에게 보이지 않는다

### 하지 말 것
- DB 데이터를 직접 수정하는 코드를 넣지 마라

---

## T3. AI 요약 불릿에 마크다운 별표 노출

### 파일
- `src/components/curation/curation-card.tsx`

### 현재 동작
일부 AI 요약에 `**성공적인 메시지 전략 구축**` 같은 마크다운 볼드가 별표 그대로 텍스트로 노출된다.

### 기대 동작
- `**텍스트**`는 볼드로, `*텍스트*`는 이탤릭으로 렌더링된다
- 별표가 사용자에게 보이지 않는다

### 하지 말 것
- `react-markdown` 같은 라이브러리 추가하지 마라
- `dangerouslySetInnerHTML` 사용 금지

---

## T4. 정보공유 생성 AI 타임아웃

### 파일
- `src/app/api/admin/curation/generate/route.ts`
- `src/components/curation/curation-view.tsx`

### 현재 동작
"정보공유 생성" 클릭 후 60초 이상 로딩만 돌다가 응답 없이 끝난다.
Vercel serverless 함수 타임아웃이 원인으로 추정된다.

### 기대 동작
- Vercel 함수 타임아웃을 충분히 늘려서 Opus 생성이 완료될 때까지 기다린다
- 프론트에서 경과 시간을 표시하여 사용자가 진행 상태를 알 수 있다
- 최종 타임아웃 시 명확한 에러 메시지를 보여준다

### 하지 말 것
- **모델 변경 금지** — Opus 유지
- `max_tokens`, `thinking.budget_tokens` 줄이지 마라

---

## 리뷰 결과

### T1. 토픽맵 그룹명 + 카드 태그에 내부 메타데이터 노출

**현재 코드 문제점:**

1. **블랙리스트 방식의 한계** (`curation-card.tsx:104`, `topic-map-view.tsx:23`)
   - 현재 `METADATA_PATTERNS`는 7개 접두사(`ep_number`, `parent_id`, `level`, `section_title`, `chunk_index`, `source_ref`, `content_id`)만 필터링
   - `guide_type:학습가이드`, `section_index:0` 등 56종 패턴이 빠져나감
   - 블랙리스트를 계속 추가하는 방식은 새 메타데이터 패턴이 생길 때마다 누락 발생 — 근본적으로 **화이트리스트(유효 토픽만 허용)** 또는 **구조 패턴 기반 필터(key:value 형태 전체 제거)**로 전환해야 함

2. **필터 로직 중복** (`curation-card.tsx:103-108` = `topic-map-view.tsx:23-27`)
   - `isMetadataKey`, `METADATA_PATTERNS`, `UUID_PATTERN`이 두 파일에 완전 동일하게 복사됨
   - 한 곳만 수정하면 다른 곳에서 불일치 발생 — 공통 유틸로 추출 필요 (예: `src/lib/topic-utils.ts`)

3. **빈 토픽 시 빈 영역 렌더링** (`curation-card.tsx:218-232`)
   - `keyTopics.length > 0` 체크 후 필터링하므로, 모든 토픽이 메타데이터여도 빈 `<div className="flex flex-wrap gap-1 mb-2">` 렌더됨
   - 필터링 후 유효 토픽 개수로 조건 분기해야 함

4. **토픽맵 그룹명** (`topic-map-view.tsx:34`)
   - `groupByTopic`에서 `isMetadataKey`로 첫 번째 유효 토픽을 찾지만, 필터 누락 패턴이 있으므로 메타데이터가 그룹명으로 노출됨

**수정 방향:**
- `src/lib/topic-utils.ts` 신규 파일에 `filterValidTopics(topics: string[]): string[]` 추출
- 블랙리스트 → **구조 패턴 기반 제거**: `key:value` 형태(콜론/언더스코어로 시작하는 메타데이터), UUID, 순수 숫자, 영문 snake_case 패턴 등 일괄 제거
- 카드: 필터링 후 빈 배열이면 태그 영역 자체를 숨김
- 토픽맵: 유효 토픽이 없으면 "미분류"로 분류

---

### T2. AI 요약 불릿에 JSON 배열 문자열 노출

**현재 코드 문제점:**

1. **JSON 배열 미처리** (`curation-card.tsx:66-101`)
   - `formatSummary`는 `{`로 시작하는 JSON 객체만 파싱 (`line 72`)
   - `[`로 시작하는 JSON 배열(`["타겟팅 제한은...", "데이터 기반 분석을..."]`)은 파싱되지 않고 그대로 텍스트로 출력
   - `trimmed.startsWith("[")` 분기가 없음

2. **불릿 내부 JSON 배열 문자열 미처리**
   - 불릿 텍스트 안에 `["항목1", "항목2"]` 형태가 포함된 경우, 줄 분리 후에도 JSON 문법 문자가 그대로 노출
   - 개별 라인에서 `[`, `]`, `"` 등 JSON 문법 문자를 정리하는 후처리가 없음

3. **중첩 JSON 미처리**
   - JSON 객체의 value가 배열인 경우(`Array.isArray(v)` 분기 — `line 79`)는 처리하지만, 최상위 배열은 놓침

**수정 방향:**
- `formatSummary` 시작 부분에 `trimmed.startsWith("[")` 분기 추가 → JSON 배열 파싱 → 문자열 요소만 추출
- 모든 라인에 대해 후처리: JSON 문법 문자(`[`, `]`, `"`, `{`, `}`) strip 함수 적용
- 빈 문자열이 되는 라인은 필터링

---

### T3. AI 요약 불릿에 마크다운 별표 노출

**현재 코드 문제점:**

1. **순수 텍스트 렌더링** (`curation-card.tsx:193-196`)
   - `<span>{line}</span>`으로 렌더링 → `**텍스트**`가 별표 그대로 표시됨
   - 인라인 마크다운 파싱 없음

2. **제약 조건**
   - TASK에서 `react-markdown` 라이브러리 추가 금지, `dangerouslySetInnerHTML` 사용 금지
   - 따라서 React 엘리먼트 기반의 간단한 인라인 파서가 필요

**수정 방향:**
- 간단한 `renderInlineMarkdown(text: string): ReactNode[]` 유틸 함수 작성
- 정규식으로 `**텍스트**` → `<strong>`, `*텍스트*` → `<em>` 변환
- `<span>{line}</span>` → `<span>{renderInlineMarkdown(line)}</span>`으로 교체
- 볼드와 이탤릭만 처리 (최소 범위)

---

### T4. 정보공유 생성 AI 타임아웃

**현재 코드 문제점:**

1. **서버 타임아웃 설정** (`route.ts:5`)
   - `maxDuration = 300` (5분)으로 설정됨 — Vercel Pro 기준 충분하지만 **Hobby 플랜은 60초 제한**
   - 현재 배포 환경의 플랜 확인 필요 (Hobby면 300초 설정은 무시됨)

2. **프록시 타임아웃 부족** (`route.ts:22`)
   - `callViaProxy`에 120초 AbortController 타임아웃 설정
   - Opus + thinking(budget_tokens: 10000) + max_tokens: 16000 → 실제 응답에 120초 이상 소요 가능
   - 120초 초과 시 abort → 직접 호출 폴백으로 넘어가지만, 직접 호출에도 시간이 필요하여 총 합산 시 maxDuration 초과 가능

3. **직접 호출 타임아웃 없음** (`route.ts:47-67`)
   - `callAnthropicDirect`에는 AbortController가 없음 — 무한 대기 가능
   - Vercel의 maxDuration에 의존하여 잘리면 클라이언트에 불명확한 에러 발생

4. **프론트엔드 UX** (`generate-preview-modal.tsx:104-109`)
   - 로딩 중 "AI가 글을 생성중입니다." 텍스트와 스피너만 표시
   - **경과 시간 미표시** — 사용자가 정상 진행 중인지 멈춘 건지 구분 불가
   - fetch에 타임아웃이 없어 서버가 끊기기 전까지 무한 대기

5. **에러 메시지 불명확**
   - 타임아웃 시 generic 에러("정보공유 생성에 실패했습니다.")만 표시
   - 타임아웃인지 API 에러인지 구분 불가

**수정 방향:**
- `route.ts`: 프록시 타임아웃 120초 → 240초 확대, 직접 호출에도 240초 AbortController 추가
- `route.ts`: 프록시 실패 시 폴백하지 말고 프록시만 시도 (시간 절약) — 또는 폴백 시 남은 시간 계산
- `generate-preview-modal.tsx`: `useEffect` 내 `setInterval`로 경과 시간 카운터 표시 ("AI가 글을 생성중입니다. (1분 23초 경과)")
- `generate-preview-modal.tsx`: fetch에 AbortController + 적절한 클라이언트 타임아웃 (예: 270초) 추가
- 타임아웃 시 "생성 시간이 초과되었습니다. 다시 시도해주세요." 명확한 메시지 표시
