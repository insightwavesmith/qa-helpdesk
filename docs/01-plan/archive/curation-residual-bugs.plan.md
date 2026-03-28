# 큐레이션 잔여 버그 수정 Plan

> TASK: `TASK-큐레이션-잔여버그.md`
> 선행 구현: `curation-v2-bugfix` (T1~T4 초기 구현 완료)
> 선행 Plan: `docs/01-plan/features/curation-v2-bugfix.plan.md`
> 선행 Design: `docs/02-design/features/curation-v2-bugfix.design.md`

---

## 1. 요구사항

`curation-v2-bugfix`에서 T1~T3을 구현했으나, 잔여 엣지케이스 3건이 남아 있다.
DB 데이터 수정 없이 기존 코드의 엣지케이스만 보완한다.

## 2. 현재 상태 (코드 리서치 결과)

### 관련 파일 현황
- `src/lib/topic-utils.ts` (27줄): `isMetadataKey()`, `filterValidTopics()` — 구조 패턴 기반 필터링 구현 완료
- `src/components/curation/curation-card.tsx` (363줄): `formatSummary()`, `renderInlineMarkdown()`, `stripJsonChars()` 구현 완료
- `src/components/curation/topic-map-view.tsx` (147줄): `groupByTopic()`에서 `filterValidTopics` import 사용 중

### 잔여 버그 상세

| ID | 증상 | 근본 원인 (코드 분석) |
|----|------|----------------------|
| T1 | `guide_type:학습가이드`, `section_index:0` 같은 메타데이터가 토픽으로 노출 | `isMetadataKey`의 `COLON_KV_PATTERN = /^[a-z_]+:/i`는 영문 key만 매칭. DB에 한국어 key:value나 대문자 포함 패턴이 있을 수 있음. 실제 DB key_topics 값 확인 필요 |
| T2 | `["타겟팅 제한은..."]` 같은 JSON 배열이 대괄호/따옴표 포함 노출 (1건) | `formatSummary`에 JSON 배열 파싱 로직이 있으나, 해당 1건이 `JSON.parse` 실패하는 엣지케이스일 가능성. 실제 DB ai_summary 값 확인 필요 |
| T3 | 2/22 이전 카드에서 `**bold**`가 렌더링 안 됨 | 불릿 스트리핑 regex `/^[\s]*[*\-\u2022\u25E6\d.]+[\s]*/`의 문자 클래스에 `*`가 포함 → `**볼드텍스트**`의 앞쪽 `**`를 불릿 마커로 오인하여 제거 → `renderInlineMarkdown`이 짝을 못 맞춤 |

### T3 근본 원인 상세 분석

```
입력: "**핵심 포인트** 광고 최적화가 중요합니다"
불릿 스트리핑 후: "핵심 포인트** 광고 최적화가 중요합니다"  (앞 ** 제거됨)
renderInlineMarkdown: 짝 없는 ** → bold 미렌더링
```

`/^[\s]*[*\-\u2022\u25E6\d.]+[\s]*/` regex에서 `[*\-\u2022\u25E6\d.]+`는 character class이므로 `*`가 개별 문자로 매칭된다. `**`의 첫 번째 `*`와 두 번째 `*` 모두 이 패턴에 매칭되어 제거된다.

## 3. 범위

### In-scope
- **T1**: `isMetadataKey()` 패턴 보강 — DB 실제 데이터 기반으로 누락 패턴 추가
- **T2**: `formatSummary()` JSON 배열 파싱 엣지케이스 수정 — DB 해당 1건의 실제 값 확인 후 처리
- **T3**: 불릿 스트리핑 regex 수정 — 마크다운 볼드 구문(`**`)을 불릿 마커로 오인하지 않도록 변경

### Out-of-scope
- T4 (타임아웃) — 이 TASK 범위 아님
- DB key_topics 데이터 정리/재분석
- `react-markdown` 라이브러리 추가
- `dangerouslySetInnerHTML` 사용
- 하드코딩 블랙리스트 (T1은 구조 패턴 기반 유지)

## 4. 성공 기준

1. 카드/토픽맵에 `guide_type:`, `section_index:`, `section_title:` 등 key:value 형태 메타데이터가 노출되지 않음
2. DB의 모든 key_topics에서 메타데이터 패턴이 정확히 필터링됨 (false positive 없이)
3. JSON 배열 형태 `["..."]` ai_summary가 불릿 리스트로 정상 표시됨 (잔여 1건 포함)
4. `**bold**` 인라인 마크다운이 `<strong>` 태그로 정상 렌더링됨
5. 불릿 스트리핑이 마크다운 볼드 구문을 훼손하지 않음
6. 기존 정상 작동하는 요약 포맷이 깨지지 않음
7. `npm run build` 성공

## 5. 구현 순서

```
T1 (메타데이터 필터 보강) ─┐
T2 (JSON 파싱 엣지케이스) ─┼─ 모두 독립, 순서 무관
T3 (불릿 regex 수정)      ─┘
```

T1, T2, T3 모두 독립적. 같은 파일(curation-card.tsx)이지만 다른 함수를 수정하므로 병렬 가능.

### T1: 메타데이터 필터 보강
**수정 파일:**
- `src/lib/topic-utils.ts` — `isMetadataKey()` 패턴 보강

### T2: JSON 배열 파싱 엣지케이스
**수정 파일:**
- `src/components/curation/curation-card.tsx` — `formatSummary()` 또는 `stripJsonChars()` 수정

### T3: 불릿 스트리핑 regex 수정
**수정 파일:**
- `src/components/curation/curation-card.tsx` — `formatSummary()` 내 불릿 스트리핑 regex 수정

## 6. 의존성 그래프

```
topic-utils.ts ← curation-card.tsx ← topic-map-view.tsx
                    │
                    ├── formatSummary()     ← T2, T3
                    ├── renderInlineMarkdown() ← (T3 영향)
                    └── 토픽 뱃지 렌더링    ← T1
```

T1: topic-utils.ts만 수정 → curation-card.tsx, topic-map-view.tsx는 import만 하고 있어 코드 변경 불필요
T2: curation-card.tsx formatSummary/stripJsonChars 수정
T3: curation-card.tsx formatSummary 내 regex 수정

## 7. 리스크

| 리스크 | 확률 | 대응 |
|--------|------|------|
| T1 패턴 보강 시 유효 토픽이 오탐될 수 있음 | 중 | DB 실제 데이터 확인 후 패턴 추가. 한국어 포함 문자열은 유효 토픽으로 보존 |
| T2 해당 1건의 실제 값이 예상과 다를 수 있음 | 중 | DB에서 실제 값 조회 후 정확한 엣지케이스 파악 |
| T3 불릿 regex 변경이 다른 불릿 형식을 깨뜨릴 수 있음 | 중 | `*`, `-`, 숫자 불릿은 유지하되 `**`(연속 별표)는 보존하는 negative lookahead 적용 |

## 8. DB 데이터 확인 필요사항 (구현 전 필수)

구현 시작 전 아래 쿼리로 실제 데이터를 확인해야 정확한 수정이 가능:

```sql
-- T1: 현재 필터링 안 되는 메타데이터 패턴 확인
SELECT DISTINCT unnest(key_topics) as topic
FROM contents
WHERE key_topics IS NOT NULL
ORDER BY topic;

-- T2: JSON 배열 형태 ai_summary 중 미파싱 건 확인
SELECT id, ai_summary
FROM contents
WHERE ai_summary LIKE '[%'
LIMIT 20;

-- T3: ** 마크다운 포함 ai_summary 확인
SELECT id, ai_summary
FROM contents
WHERE ai_summary LIKE '%**%'
LIMIT 20;
```
