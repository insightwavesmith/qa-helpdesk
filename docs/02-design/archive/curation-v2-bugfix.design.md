# 큐레이션 v2 버그수정 설계서

> Plan: `docs/01-plan/features/curation-v2-bugfix.plan.md`
> TASK: `TASK-큐레이션v2-버그수정.md`

---

## 1. 데이터 모델

DB 변경 없음. 모든 수정은 프론트엔드/API 레벨.

---

## 2. API 설계

### 2.1 route.ts 타임아웃 조정 (T4)

#### callViaProxy 변경

```typescript
// Before: 120초 타임아웃
const timer = setTimeout(() => controller.abort(), 120_000);

// After: 240초 타임아웃
const timer = setTimeout(() => controller.abort(), 240_000);
```

#### callAnthropicDirect에 AbortController 추가

```typescript
async function callAnthropicDirect(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<AnthropicResponseData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText.substring(0, 200)}`);
    }

    return (await res.json()) as AnthropicResponseData;
  } finally {
    clearTimeout(timer);
  }
}
```

#### 에러 메시지 개선

```typescript
// AbortError 감지
catch (apiErr) {
  const isTimeout = apiErr instanceof Error && apiErr.name === "AbortError";
  console.error("Anthropic API error:", apiErr instanceof Error ? apiErr.message : apiErr);
  return NextResponse.json(
    { error: isTimeout
        ? "AI 생성 시간이 초과되었습니다. 다시 시도해주세요."
        : "정보공유 생성에 실패했습니다."
    },
    { status: isTimeout ? 504 : 500 },
  );
}
```

---

## 3. 컴포넌트 구조

### 3.1 공통 유틸: topic-utils.ts (T1 신규)

```typescript
// src/lib/topic-utils.ts

/**
 * 내부 메타데이터 키인지 판별.
 * 블랙리스트가 아닌 구조 패턴 기반으로 제거:
 * 1. key:value 형태 (콜론 포함)
 * 2. UUID 형태
 * 3. 순수 숫자
 * 4. 영문 snake_case (소문자+언더스코어 only, 한국어/대문자 없으면 메타데이터)
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
const COLON_KV_PATTERN = /^[a-z_]+:/i;  // key:value 형태
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

/**
 * 토픽 배열에서 유효한 토픽만 필터링.
 * 내부 메타데이터 키를 제거하고 사용자에게 보여줄 토픽만 반환.
 */
export function filterValidTopics(topics: string[]): string[] {
  return topics.filter((t) => !isMetadataKey(t));
}
```

### 3.2 CurationCard 수정 (T1 + T2 + T3)

#### T1: 메타데이터 필터 교체

```typescript
// Before (curation-card.tsx 내부에 정의)
const METADATA_PATTERNS = /^(ep_number|parent_id|level|section_title|chunk_index|source_ref|content_id)[:_]/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}/i;
function isMetadataKey(topic: string): boolean { ... }

// After (import로 교체)
import { filterValidTopics } from "@/lib/topic-utils";
```

#### T1: 빈 토픽 영역 숨김

```tsx
// Before
{keyTopics.length > 0 && (
  <div className="flex flex-wrap gap-1 mb-2">
    {keyTopics
      .filter((t) => !isMetadataKey(t))
      .map((topic) => (
        <Badge ...>{topic}</Badge>
      ))}
  </div>
)}

// After
{(() => {
  const validTopics = filterValidTopics(keyTopics);
  return validTopics.length > 0 ? (
    <div className="flex flex-wrap gap-1 mb-2">
      {validTopics.map((topic) => (
        <Badge
          key={topic}
          variant="secondary"
          className="text-[10px] px-1.5 py-0 h-5"
        >
          {topic}
        </Badge>
      ))}
    </div>
  ) : null;
})()}
```

#### T2: formatSummary JSON 배열 처리

```typescript
function formatSummary(aiSummary: string | null): string[] {
  if (!aiSummary) return [];

  const trimmed = aiSummary.trim();

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

  // NEW: JSON 배열 처리
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

  const lines = trimmed.split("\n").filter((l) => l.trim());

  if (lines.length >= 2) {
    return lines.slice(0, 3).map((l) =>
      stripJsonChars(l.replace(/^[\s]*[*\-\d.]+[\s]*/, "").trim())
    );
  }

  return [stripJsonChars(trimmed)];
}

/** JSON 문법 문자 제거 */
function stripJsonChars(text: string): string {
  return text
    .replace(/^\["|"\]$/g, "")     // 양끝 [" "]
    .replace(/^["'\[{}\]]+|["'\[{}\]]+$/g, "")  // 양끝 JSON 문자
    .replace(/",\s*"/g, ", ")      // "," 패턴 → 쉼표
    .trim();
}
```

#### T3: 인라인 마크다운 렌더링

```tsx
import { type ReactNode } from "react";

/**
 * 간단한 인라인 마크다운 파서 (볼드 + 이탤릭).
 * react-markdown 없이 React 엘리먼트로 변환.
 */
function renderInlineMarkdown(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // **볼드** 또는 *이탤릭* 매칭
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // 매치 전 텍스트
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **볼드**
      parts.push(<strong key={key++} className="font-semibold text-gray-700">{match[1]}</strong>);
    } else if (match[2]) {
      // *이탤릭*
      parts.push(<em key={key++}>{match[2]}</em>);
    }

    lastIndex = match.index + match[0].length;
  }

  // 나머지 텍스트
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
```

적용 위치:

```tsx
// Before
<span>{line}</span>

// After
<span>{renderInlineMarkdown(line)}</span>
```

### 3.3 TopicMapView 수정 (T1)

```typescript
// Before (topic-map-view.tsx 내부에 정의)
const METADATA_PATTERNS = ...;
const UUID_PATTERN = ...;
function isMetadataKey(topic: string): boolean { ... }

// After (import로 교체)
import { filterValidTopics } from "@/lib/topic-utils";

function groupByTopic(contents: CurationContentWithLinks[]): TopicGroup[] {
  const groups: Record<string, CurationContentWithLinks[]> = {};

  for (const item of contents) {
    // filterValidTopics로 유효 토픽만 추출
    const validTopics = filterValidTopics(item.key_topics || []);
    const topic = validTopics.length > 0 ? validTopics[0] : "미분류";

    if (!groups[topic]) groups[topic] = [];
    groups[topic].push(item);
  }

  return Object.entries(groups)
    .sort(([a, , ], [b, itemsB]) => {
      if (a === "미분류") return 1;
      if (b === "미분류") return -1;
      return itemsB.length - groups[a].length;
    })
    .map(([topic, items]) => ({ topic, items }));
}
```

### 3.4 GeneratePreviewModal 수정 (T4)

#### 경과 시간 표시

```tsx
// 상태 추가
const [elapsedSeconds, setElapsedSeconds] = useState(0);

// 타이머 effect
useEffect(() => {
  if (!loading) return;
  const interval = setInterval(() => {
    setElapsedSeconds((prev) => prev + 1);
  }, 1000);
  return () => clearInterval(interval);
}, [loading]);

// 경과 시간 포맷
function formatElapsed(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min > 0) return `${min}분 ${sec}초`;
  return `${sec}초`;
}
```

#### 클라이언트 타임아웃 추가

```tsx
useEffect(() => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 270_000); // 4분 30초

  async function generate() {
    try {
      const res = await fetch("/api/admin/curation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentIds }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성 실패");
      setTitle(data.title);
      setBodyMd(data.body_md);
      if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("생성 시간이 초과되었습니다. 다시 시도해주세요.");
      } else {
        setError(err instanceof Error ? err.message : "정보공유 생성에 실패했습니다.");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }
  generate();

  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}, [contentIds]);
```

#### 로딩 UI 변경

```tsx
// Before
<p className="text-sm text-gray-500">
  AI가 글을 생성중입니다.
</p>

// After
<p className="text-sm text-gray-500">
  AI가 글을 생성중입니다.
</p>
<p className="text-xs text-gray-400 mt-1">
  {formatElapsed(elapsedSeconds)} 경과
  {elapsedSeconds > 60 && " — Opus 모델은 2~4분 소요될 수 있습니다"}
</p>
```

---

## 4. 에러 처리

| 상황 | 에러 코드 | 사용자 메시지 | 처리 |
|------|-----------|-------------|------|
| 모든 토픽이 메타데이터 | - | - | 태그 영역 숨김, 토픽맵에서 "미분류" |
| JSON 배열 파싱 실패 | - | - | fallthrough → 줄 분리 처리 |
| 마크다운 파서 실패 | - | - | 원문 텍스트 그대로 표시 (graceful) |
| 프록시 240초 타임아웃 | AbortError | 직접 호출 폴백 | 콘솔 warn 후 폴백 |
| 직접 호출 240초 타임아웃 | 504 | "AI 생성 시간이 초과되었습니다. 다시 시도해주세요." | toast.error |
| 클라이언트 270초 타임아웃 | AbortError | "생성 시간이 초과되었습니다. 다시 시도해주세요." | 모달 에러 표시 |

---

## 5. 구현 순서 -- 체크리스트

### T1: 메타데이터 필터 강화 (의존성: 없음)

- [ ] `src/lib/topic-utils.ts`: 신규 — `isMetadataKey()`, `filterValidTopics()` 함수
- [ ] `curation-card.tsx`: 로컬 `METADATA_PATTERNS`, `UUID_PATTERN`, `isMetadataKey` 제거
- [ ] `curation-card.tsx`: `import { filterValidTopics } from "@/lib/topic-utils"` 추가
- [ ] `curation-card.tsx`: 토픽 뱃지 영역 — 필터 후 빈 배열이면 영역 숨김
- [ ] `topic-map-view.tsx`: 로컬 `METADATA_PATTERNS`, `UUID_PATTERN`, `isMetadataKey` 제거
- [ ] `topic-map-view.tsx`: `import { filterValidTopics } from "@/lib/topic-utils"` 추가
- [ ] `topic-map-view.tsx`: `groupByTopic` — `filterValidTopics` 사용으로 교체
- [ ] 빌드 확인

### T2: JSON 배열 AI 요약 파싱 (의존성: 없음)

- [ ] `curation-card.tsx`: `stripJsonChars()` 헬퍼 함수 추가
- [ ] `curation-card.tsx`: `formatSummary()` — `[` 시작 JSON 배열 파싱 분기 추가
- [ ] `curation-card.tsx`: `formatSummary()` — 모든 반환값에 `stripJsonChars` 적용
- [ ] 빌드 확인

### T3: 마크다운 별표 렌더링 (의존성: T2)

- [ ] `curation-card.tsx`: `renderInlineMarkdown()` 함수 추가
- [ ] `curation-card.tsx`: 요약 불릿 `<span>{line}</span>` → `<span>{renderInlineMarkdown(line)}</span>` 교체
- [ ] 빌드 확인

### T4: 정보공유 생성 타임아웃 (의존성: 없음)

- [ ] `route.ts`: `callViaProxy` 타임아웃 120초 → 240초
- [ ] `route.ts`: `callAnthropicDirect`에 AbortController + 240초 타임아웃 추가
- [ ] `route.ts`: catch 블록에 AbortError 감지 → 504 응답 + 명확한 메시지
- [ ] `generate-preview-modal.tsx`: `elapsedSeconds` 상태 + `setInterval` 타이머 추가
- [ ] `generate-preview-modal.tsx`: `formatElapsed()` 함수 추가
- [ ] `generate-preview-modal.tsx`: 로딩 UI에 경과 시간 + 안내 메시지 표시
- [ ] `generate-preview-modal.tsx`: fetch에 AbortController + 270초 클라이언트 타임아웃
- [ ] `generate-preview-modal.tsx`: AbortError 시 타임아웃 전용 에러 메시지
- [ ] `generate-preview-modal.tsx`: cleanup 함수에서 controller.abort() + clearTimeout
- [ ] 빌드 확인
