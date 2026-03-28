# 큐레이션 잔여 버그 수정 설계서

> Plan: `docs/01-plan/features/curation-residual-bugs.plan.md`
> TASK: `TASK-큐레이션-잔여버그.md`
> 선행 Design: `docs/02-design/features/curation-v2-bugfix.design.md`

---

## 1. 데이터 모델

DB 변경 없음. 모든 수정은 프론트엔드 레벨.

---

## 2. API 설계

API 변경 없음. 이번 범위는 프론트엔드 유틸/컴포넌트 수정만 포함.

---

## 3. 컴포넌트 구조

### 3.1 T1: isMetadataKey 패턴 보강 (`src/lib/topic-utils.ts`)

#### 현재 코드 (27줄)

```typescript
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
const COLON_KV_PATTERN = /^[a-z_]+:/i;    // key:value 형태
const PURE_NUMBER = /^\d+$/;
const SNAKE_CASE_ONLY = /^[a-z][a-z0-9_]*$/;  // 순수 영문 소문자 snake_case

export function isMetadataKey(topic: string): boolean {
  const t = topic.trim();
  if (!t) return true;
  if (UUID_PATTERN.test(t)) return true;
  if (COLON_KV_PATTERN.test(t)) return true;
  if (PURE_NUMBER.test(t)) return true;
  if (SNAKE_CASE_ONLY.test(t)) return true;
  return false;
}
```

#### 문제 분석

TASK에서 보고된 노출 패턴:
- `guide_type:학습가이드` — `COLON_KV_PATTERN = /^[a-z_]+:/i`에 매칭되어야 함
- `section_index:0` — 역시 매칭되어야 함

현재 `COLON_KV_PATTERN`은 `/^[a-z_]+:/i`로, `guide_type:` 같은 패턴을 **이미 매칭**한다.
따라서 두 가지 가능성:

**가능성 A**: `filterValidTopics`가 호출되지 않는 코드 경로가 있음
**가능성 B**: DB에 패턴이 다른 형태로 저장됨 (예: 공백 포함 `guide_type : 학습가이드`, 대문자 `Guide_Type:...`)

#### 수정 방안

구현 시 DB 실제 데이터를 확인하여 정확한 패턴을 파악한 뒤 보강한다.
아래는 예상되는 추가 패턴과 대응:

```typescript
// src/lib/topic-utils.ts

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
const COLON_KV_PATTERN = /^[a-zA-Z_]+\s*:/;  // key:value 형태 (공백 허용, 대소문자 무관)
const PURE_NUMBER = /^\d+$/;
const SNAKE_CASE_ONLY = /^[a-z][a-z0-9_]*$/;  // 순수 영문 소문자 snake_case
const NUMERIC_SUFFIX = /^.*_\d+$/;             // something_0, chunk_3 등

export function isMetadataKey(topic: string): boolean {
  const t = topic.trim();
  if (!t) return true;
  if (UUID_PATTERN.test(t)) return true;
  if (COLON_KV_PATTERN.test(t)) return true;
  if (PURE_NUMBER.test(t)) return true;
  if (SNAKE_CASE_ONLY.test(t)) return true;
  if (NUMERIC_SUFFIX.test(t)) return true;
  return false;
}
```

변경 포인트:
1. `COLON_KV_PATTERN`: `/^[a-z_]+:/i` → `/^[a-zA-Z_]+\s*:/` — 콜론 앞 공백 허용, 대소문자 명시적 매칭
2. `NUMERIC_SUFFIX` 추가: `_숫자`로 끝나는 패턴 (예: `section_index_0`)

> **중요**: 구현 시 DB 쿼리 결과를 보고 실제 누락 패턴에 맞춰 최종 조정할 것.
> 한국어가 포함된 토픽 (예: `광고 최적화`, `메타 광고`)은 절대 필터링하면 안 됨.

#### curation-card.tsx, topic-map-view.tsx

두 파일 모두 이미 `import { filterValidTopics } from "@/lib/topic-utils"`를 사용 중이므로 **코드 변경 불필요**. topic-utils.ts 수정만으로 자동 반영.

---

### 3.2 T2: formatSummary JSON 배열 엣지케이스 (`src/components/curation/curation-card.tsx`)

#### 현재 코드

```typescript
// JSON 배열 처리 (lines 104-117)
if (trimmed.startsWith("[")) {
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map((item) => stripJsonChars(item.trim()))
        .slice(0, 3);
    }
  } catch {
    // fallthrough
  }
}
```

#### 문제 분석

로직 자체는 올바르다. 1건이 여전히 실패하는 가능한 원인:

1. **줄바꿈/특수문자로 `JSON.parse` 실패**: DB 값에 이스케이프되지 않은 줄바꿈(`\n`)이나 탭이 포함
2. **`trimmed.startsWith("[")` 미매칭**: 앞에 BOM이나 보이지 않는 유니코드 문자
3. **배열 요소가 string이 아님**: 숫자나 객체가 섞여 있어 `.filter` 후 빈 배열
4. **대괄호로 시작하지만 JSON이 아닌 텍스트**: `[참고] 타겟팅 제한은...` 같은 패턴

#### 수정 방안

```typescript
/** JSON 문법 문자 제거 */
function stripJsonChars(text: string): string {
  return text
    .replace(/^\["|"\]$/g, "")           // 양끝 [" "]
    .replace(/^["'\[{}\]]+|["'\[{}\]]+$/g, "")  // 양끝 JSON 문자
    .replace(/",\s*"/g, ", ")            // "," 패턴 -> 쉼표
    .replace(/\\n/g, " ")               // 이스케이프된 줄바꿈 -> 공백
    .trim();
}

function formatSummary(aiSummary: string | null): string[] {
  if (!aiSummary) return [];

  // BOM 및 비표시 유니코드 제거
  const trimmed = aiSummary.replace(/^\uFEFF/, "").trim();

  // JSON 객체 처리
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const values: string[] = [];
      for (const [, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.trim()) {
          values.push(stripJsonChars(v.trim()));
        } else if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === "string" && item.trim()) values.push(stripJsonChars(item.trim()));
          }
        }
      }
      return values.slice(0, 3);
    } catch {
      // fallthrough
    }
  }

  // JSON 배열 처리
  if (trimmed.startsWith("[")) {
    try {
      // 줄바꿈을 이스케이프 처리 후 파싱 시도
      const sanitized = trimmed.replace(/\n/g, "\\n").replace(/\t/g, "\\t");
      const parsed = JSON.parse(sanitized);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string" && item.trim() !== "")
          .map((item) => stripJsonChars(item.trim()))
          .slice(0, 3);
      }
    } catch {
      // JSON 파싱 실패 시 수동 strip 후 텍스트 처리
      const manualStrip = stripJsonChars(trimmed);
      if (manualStrip) {
        return [manualStrip];
      }
      // fallthrough
    }
  }

  const lines = trimmed.split("\n").filter((l) => l.trim());

  if (lines.length >= 2) {
    return lines.slice(0, 3).map((l) =>
      stripJsonChars(l.replace(/^[\s]*(?:\d+[.)]\s*|[-\u2022\u25E6]\s*)/, "").trim())
    );
  }

  return [stripJsonChars(trimmed)];
}
```

변경 포인트:
1. **BOM 제거**: `aiSummary.replace(/^\uFEFF/, "")` 추가
2. **줄바꿈 sanitize**: `JSON.parse` 전에 raw 줄바꿈을 이스케이프 처리
3. **fallback 강화**: JSON 파싱 실패 시 `stripJsonChars`로 수동 strip 후 단일 텍스트로 반환
4. **`stripJsonChars`에 `\\n` 처리 추가**

> **중요**: 구현 시 DB에서 해당 1건의 실제 `ai_summary` 값을 조회하여 정확한 실패 원인을 파악한 뒤, 위 수정 방안을 검증/조정할 것.

---

### 3.3 T3: 불릿 스트리핑 regex 수정 (`src/components/curation/curation-card.tsx`)

#### 현재 코드 (line 123)

```typescript
// formatSummary 내 줄 분리 처리 (lines 121-125)
if (lines.length >= 2) {
  return lines.slice(0, 3).map((l) =>
    stripJsonChars(l.replace(/^[\s]*[*\-\u2022\u25E6\d.]+[\s]*/, "").trim())
  );
}
```

#### 문제 원인

regex `/^[\s]*[*\-\u2022\u25E6\d.]+[\s]*/` 분석:
- `[*\-\u2022\u25E6\d.]+` — character class에서 `*`는 리터럴 별표 문자
- `+` — 1개 이상 반복
- 입력 `**핵심 포인트** 어쩌구` → `*`가 2개 연속 매칭 → `**` 제거 → `핵심 포인트** 어쩌구`
- `renderInlineMarkdown`은 `**...**` 쌍이 필요 → 앞쪽 `**`가 없으므로 매칭 실패

#### 수정 방안

**전략**: 불릿 마커 `*`, `-` 뒤에 공백이 있는 경우만 불릿으로 인식. `**`(연속 별표)는 마크다운 볼드이므로 보존.

```typescript
if (lines.length >= 2) {
  return lines.slice(0, 3).map((l) =>
    stripJsonChars(
      l.replace(
        /^[\s]*(?:[-\u2022\u25E6]\s+|\d+[.)]\s+|\*(?!\*)\s+)/,
        ""
      ).trim()
    )
  );
}
```

regex 설명:
```
^[\s]*                      — 선행 공백
(?:                          — non-capturing group (3가지 불릿 패턴)
  [-\u2022\u25E6]\s+         — 대시/불릿 + 공백 (필수)
  |
  \d+[.)]\s+                — 숫자불릿 (1. 또는 1)) + 공백 (필수)
  |
  \*(?!\*)\s+               — 단일 별표 + negative lookahead(**이 아님) + 공백 (필수)
)
```

핵심:
- `\*(?!\*)` — `*` 1개 뒤에 `*`가 아닌 것 → 단일 `*` 불릿만 매칭
- `**`로 시작하는 볼드 마크다운은 매칭하지 않음 → 보존됨
- 모든 불릿 패턴에 `\s+` (공백 필수) 추가 → `*text`(공백 없음)는 불릿으로 처리 안 함

#### 검증 케이스

| 입력 | 기존 결과 | 수정 후 결과 |
|------|----------|-------------|
| `* 불릿 항목` | `불릿 항목` (정상) | `불릿 항목` (정상) |
| `- 대시 항목` | `대시 항목` (정상) | `대시 항목` (정상) |
| `1. 숫자 항목` | `숫자 항목` (정상) | `숫자 항목` (정상) |
| `**핵심** 내용` | `핵심** 내용` (버그) | `**핵심** 내용` (보존 -> bold 렌더링) |
| `  * 들여쓰기 불릿` | `들여쓰기 불릿` (정상) | `들여쓰기 불릿` (정상) |
| `**전부 볼드**` | `전부 볼드**` (버그) | `**전부 볼드**` (보존 -> bold 렌더링) |
| `* **혼합** 불릿` | `혼합** 불릿` (버그) | `**혼합** 불릿` (불릿 제거 + 볼드 보존) |

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| T1: 모든 토픽이 메타데이터 | 태그 영역 숨김 (기존 로직 유지), 토픽맵에서 "미분류" |
| T2: JSON 배열 파싱 실패 (sanitize 후에도) | `stripJsonChars`로 수동 strip 후 단일 텍스트 반환 |
| T2: 빈 배열 `[]` | 빈 요약 → "AI 분석 대기중" 표시 (기존 로직) |
| T3: 마크다운 파서 매칭 실패 | 원문 텍스트 그대로 표시 (graceful degradation, 기존 로직) |

---

## 5. 구현 순서 — 체크리스트

### 사전 작업: DB 데이터 확인 (필수)

- [ ] T1용: `SELECT DISTINCT unnest(key_topics) FROM contents WHERE key_topics IS NOT NULL` 실행 → 현재 `isMetadataKey`로 걸러지지 않는 패턴 목록 확보
- [ ] T2용: `SELECT id, ai_summary FROM contents WHERE ai_summary LIKE '[%'` 실행 → 미파싱 1건의 실제 값 확인
- [ ] T3용: `SELECT id, ai_summary FROM contents WHERE ai_summary LIKE '%**%'` 실행 → 볼드 마크다운 포함 건 확인

### T1: 메타데이터 필터 보강 (의존성: 없음)

- [ ] `src/lib/topic-utils.ts`: DB 데이터 기반으로 누락 패턴 추가
- [ ] `src/lib/topic-utils.ts`: 기존 정규식 수정 시 한국어 포함 토픽이 오탐되지 않는지 검증
- [ ] 빌드 확인

### T2: JSON 배열 파싱 엣지케이스 (의존성: 없음)

- [ ] `curation-card.tsx`: `formatSummary()` 상단에 BOM 제거 추가
- [ ] `curation-card.tsx`: JSON 배열 분기에서 raw 줄바꿈 sanitize 추가
- [ ] `curation-card.tsx`: JSON 파싱 실패 시 수동 strip fallback 추가
- [ ] `curation-card.tsx`: `stripJsonChars()`에 `\\n` 치환 추가
- [ ] 해당 1건이 정상 파싱되는지 확인
- [ ] 기존 정상 요약 포맷이 깨지지 않는지 확인
- [ ] 빌드 확인

### T3: 불릿 스트리핑 regex 수정 (의존성: 없음)

- [ ] `curation-card.tsx`: `formatSummary()` 내 불릿 스트리핑 regex 변경
  - Before: `/^[\s]*[*\-\u2022\u25E6\d.]+[\s]*/`
  - After: `/^[\s]*(?:[-\u2022\u25E6]\s+|\d+[.)]\s+|\*(?!\*)\s+)/`
- [ ] 검증: `* 불릿`, `- 대시`, `1. 숫자` 불릿이 정상 제거됨
- [ ] 검증: `**볼드**` 마크다운이 보존됨
- [ ] 검증: `* **혼합** 불릿` 패턴에서 불릿 제거 + 볼드 보존
- [ ] 빌드 확인

### 최종 확인

- [ ] `npm run build` 성공
- [ ] 브라우저 QA: 토픽맵 뷰에서 메타데이터 미노출 확인
- [ ] 브라우저 QA: 인박스 뷰 카드 요약에서 JSON 문자 미노출 확인
- [ ] 브라우저 QA: 카드 요약에서 `**볼드**` 정상 렌더링 확인
