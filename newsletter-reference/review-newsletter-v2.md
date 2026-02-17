# 뉴스레터 섹션별 고정 Unlayer 템플릿 구현 — 리뷰 보고서

**작성일**: 2026-02-17
**분석 대상**: TASK.md (T1~T6)
**분석 파일**: TASK.md, email-samples-v7.html, email-template-utils.ts, contents.ts, newsletter-edit-panel.tsx, email-default-template.ts

---

## 1. 리스크 분석

### 1-1. 태스크별 리스크 레벨 요약

| 태스크 | 설명 | 리스크 | 근거 |
|--------|------|--------|------|
| T1 | 섹션별 고정 Unlayer Row JSON 정의 | **HIGH** | 8가지 레이아웃을 Unlayer JSON으로 1:1 변환. HTML→Unlayer JSON 변환은 수동 작업이며, Unlayer의 내부 JSON 스키마 문서가 부족하여 시행착오 필수 |
| T2 | parseSummaryToSections 개선 | **MEDIUM** | 기존 파서 확장이지만, 8가지 필드 형식(테이블, 카드, 체크리스트 등)을 정확히 파싱해야 함. AI 출력의 비결정성이 파싱 실패 원인이 될 수 있음 |
| T3 | buildDesignFromSummary 재구현 | **HIGH** | T1+T2에 완전 의존. 기존 로직(L507~L613) 전면 교체. header/footer row 분리 로직, PLACEHOLDER_ROW_IDS 필터링, 타입별 분기 등 기존 복잡도가 높음. 하위 호환성 보장 필요 |
| T4 | AI email_summary 프롬프트 개선 | **MEDIUM** | AI 출력 형식이 T2 파서와 정확히 맞아야 함. 현재 `BANNER_KEYS_BY_TYPE` 가이드가 있지만, AI가 형식을 100% 준수하지 않을 수 있음 |
| T5 | 공통/비배너 섹션 row 구현 | **MEDIUM** | T1과 동일 파일이므로 작업 범위 중복. 13개 공통 row 정의는 양이 많지만 구조가 단순(대부분 텍스트 블록) |
| T6 | 에러 핸들링 + 하위 호환 | **LOW** | 프론트엔드 UI 작업. 기존 newsletter-edit-panel.tsx에 이미 기본 에러 핸들링이 구현되어 있음. 추가 작업량 적음 |

### 1-2. 기술적 리스크 상세

#### HIGH: Unlayer JSON 구조의 제약 (T1, T3)

**핵심 문제**: Unlayer는 `row > column > content` 3계층 구조를 강제하며, content type은 `text`, `image`, `button`, `divider`, `html`, `social` 등으로 제한된다. 골드 스탠다드 HTML(email-samples-v7.html)의 레이아웃 중 상당수는 Unlayer의 네이티브 content type으로 표현 불가능하며, `text` type 내부에 raw HTML을 삽입하는 방식(`<table>` 기반 이메일 레이아웃)으로 구현해야 한다.

- **번호 카드(numbered-cards-3)**: Unlayer에는 카드 컴포넌트가 없음. `text` content 안에 `<table>` 기반 카드 레이아웃을 inline HTML로 삽입해야 함.
- **체크리스트**: 동일하게 `<table>` 기반 inline HTML 필요.
- **Before/After 테이블**: `text` content 안에 `<table>` HTML 삽입. Unlayer 에디터에서 사용자가 개별 셀 편집이 어려울 수 있음.
- **프로필 카드**: 이미 `SMITH_PROFILE_ROW`에서 `text` type + `<table>` HTML 패턴으로 구현되어 있어 선례 존재.

이 접근법은 현재 코드에서 이미 사용 중이며(`SMITH_PROFILE_ROW`, `createBannerImageRow`의 CSS gradient fallback 등), 실현은 가능하나 **Unlayer 에디터에서의 편집 경험이 제한적**이라는 트레이드오프가 있다.

#### HIGH: AI 출력 비결정성 (T2, T4)

AI(Gemini)가 생성하는 `email_summary`의 형식이 T2 파서의 기대와 다를 수 있다. 현재 `BANNER_KEYS_BY_TYPE`으로 형식을 강제하고 있지만:

- KEY POINT의 `01. 제목 | 설명` 형식 vs `✅ **제목** — 설명` 형식이 혼재
- 테이블 마크다운(`| 지표 | Before | After |`)의 구분선 행 유무
- 인용문(`> "인용문"`)의 따옴표 스타일 차이
- `###` 배너키 뒤의 공백/줄바꿈 패턴

파서가 이런 변형을 모두 처리하지 못하면 레이아웃이 깨진다.

#### MEDIUM: 기존 email_design_json 하위 호환 (T3, T6)

기존에 저장된 `email_design_json`은 현재의 `createContentTextRow` 방식(단일 텍스트 블록)으로 생성된 것이다. T3에서 `buildDesignFromSummary`를 재구현하면, 새로 생성되는 JSON은 구조가 완전히 다르다. 기존 JSON은 `content.email_design_json`이 있으면 그대로 로드하므로 문제 없지만, **"뉴스레터 재생성" 시 기존 사용자 수정 사항이 모두 초기화**된다는 점을 명확히 사용자에게 알려야 한다.

### 1-3. 의존성 리스크

| 의존 경로 | 리스크 | 설명 |
|-----------|--------|------|
| T1 → T3 | **HIGH** | T1의 row JSON 구조가 확정되지 않으면 T3의 placeholder 치환 로직을 작성할 수 없음 |
| T2 → T3 | **HIGH** | T2의 파싱 결과 형식({key, fields})이 확정되지 않으면 T3에서 필드 매핑 불가 |
| T2 → T4 | **MEDIUM** | T4의 프롬프트가 T2 파서 형식과 정확히 맞아야 함 |
| T1 → T5 | **LOW** | 같은 파일(`newsletter-row-templates.ts`) 작업이므로 병합이 자연스러움 |

### 1-4. 복잡도 리스크

| 태스크 | 예상 코드량 | 복잡도 | 근거 |
|--------|-------------|--------|------|
| T1 | 400~600줄 | 높음 | 8가지 레이아웃 x 각 30~80줄의 Unlayer JSON |
| T2 | 100~150줄 | 중간 | 기존 파서 확장, 8가지 필드 형식 파싱 |
| T3 | 100~200줄 | 높음 | 기존 로직 전면 교체, 다수 분기 처리 |
| T4 | 50~80줄 | 낮음 | 프롬프트 문자열 수정 |
| T5 | 300~500줄 | 중간 | 13개 공통 row, 대부분 단순 구조 |
| T6 | 30~50줄 | 낮음 | 기존 컴포넌트에 경고 UI 추가 |

---

## 2. 태스크 의존성 검증

### 2-1. TASK.md 정의된 의존성

```
T1 (Row JSON 정의)       → 의존: 없음
T2 (파서 개선)            → 의존: 없음
T3 (buildDesign 재구현)   → 의존: T1, T2
T4 (AI 프롬프트 개선)     → 의존: T2
T5 (공통 row 구현)        → 의존: T1
T6 (에러 핸들링)          → 의존: T3, T4
```

### 2-2. 의존성 정확성 평가

**올바른 의존성:**
- T3 → T1: 정확. T3는 T1에서 정의한 row JSON 템플릿을 import하여 placeholder를 치환함.
- T3 → T2: 정확. T3는 T2의 `parseSummaryToSections` 반환값(`{key, fields}`)을 사용하여 필드 매핑.
- T6 → T3: 정확. T6는 T3의 새로운 `buildDesignFromSummary`가 완성되어야 에러 시나리오를 테스트 가능.
- T6 → T4: 정확. T4의 프롬프트 개선이 반영된 AI 출력을 기반으로 에러 핸들링 검증.

**누락된 의존성:**

1. **T4 → T1 (누락, MEDIUM)**: T4의 프롬프트에서 AI에게 "01. 제목 | 설명" 같은 형식을 강제하는데, 이 형식은 T1의 row JSON에서 어떤 placeholder를 기대하는지에 따라 달라져야 한다. T1에서 `{{keypoint_01_title}}`, `{{keypoint_01_desc}}` 같은 placeholder를 정의하면, T4의 프롬프트도 그에 맞춰 AI 출력 형식을 조정해야 한다. 현재는 T4가 T2에만 의존하지만, 실질적으로 T1의 placeholder 설계에도 영향을 받는다.

2. **T5 → T3 (누락, LOW)**: T5의 공통 row들(row-logo, row-hero, row-title 등)은 T3의 `buildDesignFromSummary`에서 header/footer로 배치된다. T5가 완성되어야 T3에서 올바른 공통 row를 참조할 수 있다. 다만 현재 이 row들은 `email-default-template.ts`에 이미 존재하므로, T5는 사실상 이것의 리팩토링/이동에 해당한다.

3. **T3 → T5 (순환 가능성, LOW)**: T3가 공통 row를 참조하려면 T5가 필요하고, T5는 T1에 의존한다고 되어있지만 실제로는 T3과도 연관. 순환 의존은 아니지만, T3와 T5의 작업 순서를 명확히 해야 한다.

### 2-3. 병렬 실행 가능 태스크

```
병렬 그룹 1: T1 + T2 (의존 없음, 동시 시작 가능)
병렬 그룹 2: T4 + T5 (T1/T2 완료 후, 서로 독립)
순차: T3 (T1 + T2 완료 후)
순차: T6 (T3 + T4 완료 후)
```

**최적 실행 경로:**
```
          T1 ──┬── T5 ──┐
               │        │
               ├── T3 ──┼── T6
               │        │
          T2 ──┤        │
               └── T4 ──┘
```

**크리티컬 패스**: T1 → T3 → T6 (또는 T2 → T3 → T6)

---

## 3. 누락 사항

### 3-1. TASK.md에서 빠진 고려 사항

#### (A) Unlayer 에디터에서의 편집 가능성 검증

TASK.md의 검증 항목에 "Unlayer 에디터에서 각 row 개별 편집 가능"이 있지만, **구체적으로 어떤 수준의 편집을 기대하는지** 명시되지 않았다.

- `text` content 안에 `<table>` HTML로 카드/체크리스트를 구현하면, Unlayer 에디터에서는 해당 블록을 **텍스트 편집기로만** 수정 가능하다. 개별 카드 항목의 추가/삭제/순서 변경은 에디터 UI에서 직관적으로 불가능하다.
- "개별 편집 가능"의 범위를 "row 단위 이동/삭제는 가능하나 내부 필드 수정은 HTML 편집 필요"로 한정해야 할 수 있다.

#### (B) email_summary 마이그레이션 전략

기존에 `email_summary`가 있지만 새로운 형식(### 배너키 + 구조화된 필드)이 아닌 콘텐츠의 처리 전략이 누락되었다. 기존 `email_summary`를 새 형식으로 재생성하는 배치 작업이 필요한지, 아니면 기존 것은 그대로 두고 새로 생성하는 것만 새 형식을 적용하는지 결정이 필요하다.

#### (C) Unlayer 커스텀 Tool/Widget 활용 가능성

Unlayer는 [Custom Tools/Widgets](https://docs.unlayer.com/docs/custom-tools) 기능을 제공한다. `text` content에 raw HTML을 넣는 대신, 커스텀 tool을 등록하면 에디터에서 더 나은 편집 경험을 제공할 수 있다. 예를 들어 "번호 카드" 커스텀 tool을 등록하면 에디터에서 각 카드의 제목/설명을 개별 필드로 편집할 수 있다. 이 대안의 검토가 누락되어 있다.

#### (D) 이메일 클라이언트 호환성 테스트 범위

검증 항목에 "Gmail에서 레퍼런스 이미지와 동일 렌더링"이 있지만, **다른 이메일 클라이언트**(Outlook, Apple Mail, 네이버 메일, 다음 메일)에 대한 테스트는 언급되지 않았다. 특히:
- Outlook은 `<table>` 렌더링에 제약이 있음 (CSS 지원 제한)
- 네이버 메일은 inline style 외의 CSS를 제거함

#### (E) 모바일 반응형 대응

email-samples-v7.html은 600px 고정 너비이며, 모바일 반응형 대응이 없다. Unlayer는 자체 반응형 시스템이 있지만, `text` content 내부의 `<table>` HTML은 Unlayer의 반응형 시스템을 우회한다. 모바일에서 카드/테이블이 깨질 수 있다.

### 3-2. 엣지 케이스 누락

| 엣지 케이스 | TASK.md | 누락 여부 |
|-------------|---------|-----------|
| AI가 배너키를 변형하여 생성 (예: "KEY POINTS" vs "KEY POINT") | 부분적 언급 (validateBannerKeys) | 파서에서 fuzzy matching 필요 |
| 같은 배너키가 2번 이상 등장 | 미언급 | `parseSummaryToSections`에서 중복 처리 로직 필요 |
| email_summary가 10,000자 이상 | 미언급 | Unlayer JSON 크기 제한 확인 필요 |
| 배너 이미지 URL 404 (Storage 삭제) | 미언급 | 이미지 로드 실패 시 fallback UI 필요 |
| Template B의 `webinar` vs `notice` 타입 처리 분기 | 부분적 (L528) | `notice` 타입이 Template B를 사용하지만 TEMPLATE_KEY_ORDER에도 별도 정의됨. 통합 여부 결정 필요 |
| CTA URL이 없는 경우 | 미언급 | `content.id` 기반 fallback URL이 있지만 명시적 안내 필요 |
| 빈 섹션 content (### INSIGHT 바로 다음 ### KEY POINT) | 미언급 | fields가 비어있을 때 placeholder 그대로 노출될 위험 |

### 3-3. 테스트/검증 항목 누락

1. **단위 테스트**: `parseSummaryToSections`와 새로운 필드 파서에 대한 단위 테스트 계획이 없음. 8가지 필드 형식 각각에 대한 테스트 케이스 필요.
2. **통합 테스트**: `generateEmailSummary` → `parseSummaryToSections` → `buildDesignFromSummary` 전체 파이프라인 테스트.
3. **시각적 회귀 테스트**: email-samples-v7.html 골드 스탠다드와 실제 Unlayer 출력의 픽셀 비교.
4. **성능 테스트**: `buildDesignFromSummary`의 실행 시간 (특히 T1의 row JSON이 큰 경우).

---

## 4. 개선 제안

### 4-1. 태스크 분할/합병 제안

#### T1 + T5 합병 권장

T1("섹션별 고정 Unlayer Row JSON 정의")과 T5("공통/비배너 섹션 row 구현")는 **같은 파일(`newsletter-row-templates.ts`)**에서 작업하며, 같은 사람(backend-dev)이 담당한다. 분리하면:
- 같은 파일의 export 구조를 두 번에 걸쳐 설계해야 함
- T5의 공통 row 중 일부(row-profile, row-cta)는 이미 `email-default-template.ts`에 존재하므로 이동만 하면 됨

**제안**: T1과 T5를 합병하여 **T1: 전체 Row JSON 정의 (배너 섹션 8종 + 공통 섹션 13종)**로 통합. 예상 코드량 700~1100줄.

#### T2에 "필드 파싱 스키마 정의" 추가

T2의 필드 형식(INSIGHT → `{subtitle, body, tip}`, KEY POINT → `{items: [{title, desc}x3]}` 등)은 T1, T3, T4 모두에서 참조하는 **계약(contract)**이다. 이 스키마를 TypeScript type으로 먼저 정의하고, T1/T3/T4가 이것을 import하도록 하면 의존성이 명확해진다.

```typescript
// 예: src/lib/newsletter-section-types.ts
export interface InsightFields { subtitle: string; body: string; tip?: string; }
export interface KeyPointFields { items: { title: string; desc: string }[]; }
export interface ChecklistFields { items: string[]; }
// ...
export type SectionFields = InsightFields | KeyPointFields | ChecklistFields | ...;
```

**제안**: T2 시작 전에 "T0: 섹션 필드 스키마 정의" 서브 태스크를 추가.

### 4-2. 구현 순서 최적화

**현재 TASK.md 순서**: T1 → T2 → T3 → T4 → T5 → T6

**최적화된 순서**:

```
Phase 1 (병렬, 2일):
  T0: 섹션 필드 스키마 정의 (TypeScript types) — 0.5일
  T1+T5: 전체 Row JSON 정의 (배너+공통) — 2일
  T2: 파서 개선 — 1일

Phase 2 (병렬, 1.5일):
  T4: AI 프롬프트 개선 — 0.5일
  T3: buildDesignFromSummary 재구현 — 1.5일

Phase 3 (순차, 0.5일):
  T6: 에러 핸들링 + 하위 호환 — 0.5일

총 예상: 4일 (병렬 실행 시)
```

### 4-3. 리스크 완화 방안

| 리스크 | 완화 방안 |
|--------|-----------|
| Unlayer JSON 구조 불일치 | Unlayer 에디터에서 실제로 디자인을 만든 후 `exportHtml()`로 JSON 추출하여 역공학. 수동 JSON 작성 대신 에디터 기반 JSON 생성 권장 |
| AI 출력 형식 불일치 | T2 파서에 **관대한 파싱(lenient parsing)** 전략 적용. 정규식 매칭 실패 시 fallback으로 텍스트 블록 처리 |
| 하위 호환성 | `email_design_json`이 있는 기존 콘텐츠는 절대 건드리지 않음. `email_design_json === null && email_summary !== null`인 경우에만 새 빌드 로직 적용 |
| 이메일 클라이언트 호환 | Litmus 또는 Email on Acid 같은 이메일 테스트 도구로 주요 클라이언트 렌더링 사전 검증 |
| 모바일 깨짐 | `<table>` HTML에 `max-width: 100%` + `display: block`(모바일 스택킹) 패턴 적용 |

### 4-4. 추가 제안

1. **Unlayer Custom Tool 등록 검토**: 장기적으로 카드/체크리스트를 Unlayer Custom Tool로 등록하면, 에디터에서 각 필드를 개별 편집할 수 있다. 단, 초기 구현 복잡도가 높으므로 v2에서 검토.

2. **Snapshot 테스트 도입**: T1의 row JSON과 T3의 빌드 결과를 Jest snapshot으로 저장하면, 이후 수정 시 의도치 않은 변경을 감지할 수 있다.

3. **프롬프트 버전 관리**: T4의 AI 프롬프트를 별도 파일(예: `src/lib/newsletter-prompts.ts`)로 분리하여 `contents.ts`의 비대화를 방지. 프롬프트 변경 이력도 git으로 추적 용이.

---

## 5. Unlayer JSON 변환 실현가능성 평가

### 5-1. email-samples-v7.html 분석 결과

email-samples-v7.html은 3종 템플릿의 HTML 목업으로, 다음 레이아웃 타입을 포함:

| 레이아웃 | Template | HTML 구조 | Unlayer 변환 난이도 |
|----------|----------|-----------|---------------------|
| 로고 | A, B, C | `<div class="logo"><img>` | **쉬움** — `image` content type 또는 `text` + `<img>` |
| 제목 | A, B, C | `<div class="title">` | **쉬움** — `text` content type |
| 인용구(Hook) | A, C | `<div class="hook">` 빨간 italic | **쉬움** — `text` content type + inline style |
| 히어로 배너 | B | `<div class="hero">` gradient + pill + h2 | **중간** — row의 `backgroundImage` 대신 `backgroundColor`에 gradient 사용 불가. `text` content에 full HTML 삽입 필요 |
| 본문 텍스트 | A, B, C | `<div class="body">` bold = #F75D5D | **쉬움** — `text` content type |
| 배너 이미지 | 공통 | `<div class="banner-wrap"><img>` | **쉬움** — 이미 `createBannerImageRow`로 구현됨 |
| 번호 카드 | A, B, C | `<div class="cards">` flex layout | **어려움** — Unlayer에 카드 컴포넌트 없음. `text` content + `<table>` HTML 필수 |
| 체크리스트 | A | `<div class="checklist">` | **중간** — `text` content + `<table>` HTML. 구조 단순 |
| 팁박스 | A | `<div class="tipbox">` 노란 배경 + 좌측 보더 | **중간** — `text` content + `<div>` inline style |
| 불릿 리스트 | B | `<div class="bullets">` 빨간 dot | **중간** — `text` content + `<table>` HTML |
| 일정 테이블 | B | `<table class="sched-table">` | **중간** — `text` content + `<table>` HTML |
| B/A 테이블 | C | `<table class="ba-table">` 헤더 #1a1a2e | **중간** — `text` content + `<table>` HTML |
| 인용 카드 | C | `<div class="quotebox">` 회색 배경 | **쉬움** — `text` content + `<div>` inline style |
| 프로필 카드 | A, B | `<div class="profile">` flex | **쉬움** — 이미 `SMITH_PROFILE_ROW`에 구현됨 |
| CTA 버튼 | 공통 | `<a class="cta">` 풀너비 빨간 배경 | **쉬움** — `button` content type. 이미 구현됨 |
| 푸터 | 공통 | `<div class="footer">` 회색 배경 | **쉬움** — `text` content type |
| 이미지 Placeholder | B | `<div class="preview-area">` | **중간** — `text` content + `<div>` HTML 또는 `image` content + placeholder |

### 5-2. 변환 전략별 실현가능성

#### 전략 A: text content + inline HTML (현재 방향)

모든 레이아웃을 Unlayer의 `text` content type 안에 `<table>` 기반 inline HTML로 구현하는 방식.

**장점:**
- 구현 확실성 높음. 이메일 클라이언트에서 `<table>` 레이아웃은 가장 안정적
- 현재 코드에 선례 존재 (`SMITH_PROFILE_ROW`, `markdownToEmailHtml`의 카드/체크리스트 출력)
- Unlayer 버전 의존성 없음

**단점:**
- 에디터에서 WYSIWYG 편집 불가. 사용자가 텍스트 내용을 바꾸려면 HTML 편집 필요
- row 단위로만 이동/삭제 가능, 내부 필드 개별 편집 불가

**실현가능성: 90%** — 기술적으로 확실히 가능하나, UX 트레이드오프 존재.

#### 전략 B: Unlayer Custom Tool 활용

각 레이아웃을 Unlayer Custom Tool로 등록하여 에디터에서 네이티브 편집 가능하게 하는 방식.

**장점:**
- 에디터에서 각 필드 개별 편집 가능 (카드 제목, 체크리스트 항목 등)
- Unlayer의 반응형 시스템 활용 가능

**단점:**
- Custom Tool 개발 복잡도 높음 (React 컴포넌트 + Unlayer API 학습 필요)
- Unlayer 라이브러리 버전 업데이트 시 호환성 위험
- 추가 개발 시간 2~4일 예상

**실현가능성: 70%** — 기술적으로 가능하나 개발 비용 높음. v2 검토 대상.

#### 전략 C: html content type 활용

Unlayer의 `html` content type을 사용하여 raw HTML을 직접 삽입하는 방식.

**장점:**
- HTML 코드 에디터로 편집 가능 (syntax highlighting)
- `text` type보다 의도가 명확

**단점:**
- Unlayer 에디터에서 미리보기가 제한적일 수 있음
- `text` type과 기능적 차이가 크지 않음

**실현가능성: 85%** — `text` type과 유사하지만 의미적으로 더 적합할 수 있음.

### 5-3. 레이아웃 타입별 상세 평가

#### 1) subtitle-body-tip (INSIGHT)

```
골드 스탠다드:
  <div class="body" style="padding-top:8px">
    <div style="font-size:17px;font-weight:700;">소제목</div>
    본문 텍스트... <b>강조</b>
  </div>
  <div class="tipbox">💡 팁 내용</div>
```

**Unlayer 변환:**
- 소제목+본문: `text` content 1개 (inline HTML `<div>` 안에 소제목 `<div>` + 본문 `<p>`)
- 팁박스: 별도 `text` content 1개 (inline style로 노란 배경 + 좌측 보더)
- 또는 전체를 하나의 `text` content로 통합

**난이도: 중간** — 두 블록을 하나의 row에 넣을지, 별도 row로 나눌지 결정 필요. 하나의 row 안에 2개 content로 구성하면 팁박스 편집이 독립적으로 가능.

**placeholder 설계:**
```
{{insight_subtitle}}, {{insight_body}}, {{insight_tip}}
```

#### 2) numbered-cards-3 (KEY POINT, 핵심 주제, 핵심 변화)

```
골드 스탠다드:
  <div class="cards">
    <div class="card"><div class="num">01</div><div><div class="ct">제목</div><div class="cd">설명</div></div></div>
    ...x3
  </div>
```

**Unlayer 변환:**
- `text` content 1개 안에 `<table>` HTML로 3개 카드 렌더링
- 각 카드: `<tr>` 1개 (좌측 원형 번호 `<td>` + 우측 제목/설명 `<td>`)
- 카드 간 `border-bottom: 1px solid #f0f0f0`

**난이도: 어려움** — `<table>` 중첩 구조가 복잡하고, 원형 번호 배지는 `border-radius:50%`로 구현해야 하나 Outlook에서 `border-radius`를 지원하지 않음. VML fallback이 필요할 수 있음.

**placeholder 설계:**
```
{{card_01_title}}, {{card_01_desc}},
{{card_02_title}}, {{card_02_desc}},
{{card_03_title}}, {{card_03_desc}}
```

#### 3) checklist (CHECKLIST)

```
골드 스탠다드:
  <div class="checklist">
    <div class="check-item"><span class="icon">✅</span> 텍스트</div>
    ...x5
  </div>
```

**Unlayer 변환:**
- `text` content 1개 + `<table>` HTML
- 각 항목: `<tr><td>✅</td><td>텍스트</td></tr>`
- 항목 간 `border-bottom: 1px solid #f0f0f0`

**난이도: 중간** — 구조 단순. 체크 아이콘 `✅`은 이모지이므로 이메일 클라이언트에서 렌더링 차이 있을 수 있음. `<span style="color:#F75D5D">✅</span>`으로 색상 강제 가능.

**placeholder 설계:**
```
{{check_01}}, {{check_02}}, {{check_03}}, {{check_04}}, {{check_05}}
```

#### 4) bullet-list (이런 분들을 위해)

```
골드 스탠다드:
  <div class="bullets">
    <div class="bullet"><span class="dot">•</span> 텍스트 <b>키워드</b></div>
    ...x4
  </div>
```

**Unlayer 변환:**
- `text` content 1개 + `<table>` HTML
- 각 항목: `<tr><td style="color:#F75D5D;font-weight:700">•</td><td>텍스트</td></tr>`

**난이도: 중간** — 체크리스트와 유사한 구조. 키워드 볼드 처리(`<b style="color:#F75D5D">`)가 필요하므로 placeholder에서 볼드 마킹을 처리해야 함.

**placeholder 설계:**
```
{{bullet_01}}, {{bullet_02}}, {{bullet_03}}, {{bullet_04}}
```
(볼드 처리는 `markdownToEmailHtml` 활용 가능)

#### 5) schedule-table (웨비나 일정)

```
골드 스탠다드:
  <table class="sched-table">
    <tr><th>항목</th><th>내용</th></tr>
    <tr><td>📅 일시</td><td><b>날짜/시간</b></td></tr>
    ...x4
  </table>
```

**Unlayer 변환:**
- `text` content 1개 + `<table>` HTML
- 헤더: `<tr><th style="background:#FFF0F0;...">항목</th><th>내용</th></tr>`
- 데이터: `<tr><td style="font-weight:600">이모지 라벨</td><td>내용</td></tr>`

**난이도: 중간** — 테이블 구조는 이메일에서 가장 안정적인 레이아웃. 이모지 라벨의 이메일 클라이언트 호환성 검증 필요.

**placeholder 설계:**
```
{{sched_01_label}}, {{sched_01_value}},
{{sched_02_label}}, {{sched_02_value}},
...
```

#### 6) before-after-tables (성과)

```
골드 스탠다드:
  <div class="ba-label">자사몰 매출</div>
  <table class="ba-table">
    <tr><th>지표</th><th>Before</th><th>After</th></tr>
    <tr><td>월 매출</td><td>1,000만 원</td><td class="af">3,200만 원</td></tr>
    ...
  </table>
  (x2 테이블: 자사몰매출 + 광고효율)
```

**Unlayer 변환:**
- `text` content 1개에 2개 테이블 포함
- 각 테이블: 라벨 `<div>` + `<table>` HTML
- After 셀: `<td style="color:#F75D5D;font-weight:700">`
- 헤더: `<th style="background:#1a1a2e;color:#fff">`

**난이도: 중간~어려움** — 2개 테이블 + 라벨을 하나의 content에 넣으면 HTML이 길어짐. 별도 row로 분리하면 구조는 깔끔하지만 빌드 로직이 복잡해짐.

**placeholder 설계:**
```
{{ba_table1_title}}, {{ba_table1_rows}} (JSON 형태 필요)
{{ba_table2_title}}, {{ba_table2_rows}}
```

#### 7) interview-quotes (INTERVIEW)

```
골드 스탠다드:
  <div class="quotebox">
    "인용문 텍스트..."
    <div class="src">— 수강생 A님</div>
  </div>
  <div class="quotebox" style="margin-top:10px">...</div>
```

**Unlayer 변환:**
- `text` content 1~2개 (인용 카드당 1개)
- 각 인용: `<div style="background:#f5f5f5;border-radius:6px;padding:16px 20px;...">인용문<div style="...">출처</div></div>`

**난이도: 쉬움** — 단순 텍스트 블록에 배경색만 적용.

**placeholder 설계:**
```
{{quote_01_text}}, {{quote_01_source}},
{{quote_02_text}}, {{quote_02_source}}
```

#### 8) image-placeholder (강의 미리보기)

```
골드 스탠다드:
  <div class="preview-area">
    <div class="play">▶</div>
    <div class="pcap">강의 슬라이드 미리보기</div>
    <div class="psub">밑줄 친 이미지를 교체해주세요</div>
  </div>
  <div class="preview-tags">태그 텍스트</div>
```

**Unlayer 변환:**
- 방법 1: `image` content type + placeholder 이미지 URL
- 방법 2: `text` content + `<div>` HTML (재생 버튼 + 캡션)
- 방법 1이 에디터에서 이미지 교체가 쉬움

**난이도: 중간** — 재생 버튼 오버레이는 `image` content로 구현 불가. `text` content로 구현하면 이미지 교체가 어려움. 재생 버튼 없이 이미지만 넣는 것이 현실적.

**placeholder 설계:**
```
{{preview_image_url}}, {{preview_caption}}, {{preview_tags}}
```

### 5-4. Unlayer JSON 구조의 주요 제약 사항

1. **content type 제한**: `text`, `image`, `button`, `divider`, `html`, `social`, `video` 등으로 한정. 카드, 체크리스트, 테이블 등의 전용 타입 없음.

2. **column 제약**: `cells` 배열로 컬럼 비율을 정의하지만, 이메일에서 다중 컬럼은 렌더링 불안정 (특히 모바일). 1컬럼 레이아웃이 안전.

3. **중첩 row 불가**: row 안에 row를 넣을 수 없음. 카드 3개를 각각 row로 만들면 에디터에서 개별 이동 가능하지만, 하나의 "카드 그룹"으로 관리 불가.

4. **CSS 제한**: Unlayer가 생성하는 HTML은 inline style 기반이므로, 클래스 기반 CSS는 사용 불가. 모든 스타일을 inline으로 지정해야 함.

5. **조건부 표시**: `displayCondition`이 있지만 실질적으로 Unlayer 유료 기능. 무료 버전에서는 모든 row가 항상 표시됨.

### 5-5. 최종 실현가능성 결론

| 평가 항목 | 점수 (10점 만점) | 설명 |
|-----------|-----------------|------|
| 기술적 실현가능성 | **8/10** | `text` content + inline HTML로 모든 레이아웃 구현 가능. 원형 번호 배지의 Outlook 호환성만 주의 |
| 디자인 정합성 | **7/10** | 골드 스탠다드와 95%+ 일치 가능. 미세한 padding/margin 차이는 Unlayer의 기본 간격 시스템과 충돌 가능 |
| 에디터 편집 경험 | **5/10** | row 단위 이동/삭제만 가능. 내부 텍스트 수정은 HTML 편집 필요. 사용자 교육 필요 |
| 유지보수성 | **6/10** | row JSON이 하드코딩이므로 디자인 변경 시 JSON 수동 수정 필요 |
| 이메일 클라이언트 호환성 | **7/10** | Gmail/Apple Mail은 문제 없으나, Outlook의 CSS 제한으로 일부 레이아웃 깨짐 가능 |
| **종합** | **6.6/10** | 현실적으로 구현 가능하지만, 에디터 편집 경험과 유지보수성에서 트레이드오프 존재 |

---

## 6. 최종 권고사항

### 즉시 적용 (Phase 1 전)

1. **T0 추가**: 섹션 필드 스키마(TypeScript types)를 먼저 정의하여 T1/T2/T3/T4 간의 계약을 명확히 한다.
2. **T1+T5 합병**: 같은 파일에서 작업하므로 분리할 이유가 없다.
3. **Unlayer 에디터 역공학**: T1 작업 전에 Unlayer 에디터에서 직접 카드/체크리스트를 디자인한 후 JSON을 추출하여 참고한다. 수동 JSON 작성보다 정확하고 빠르다.

### 단기 (구현 중)

4. **관대한 파싱 전략**: T2 파서가 AI 출력의 변형을 모두 처리할 수 있도록 정규식에 여유를 두고, 매칭 실패 시 텍스트 블록으로 fallback 처리.
5. **단위 테스트 작성**: T2 파서와 T3 빌더에 대한 테스트를 함께 작성. 골드 스탠다드 email_summary 3종(education, webinar, case_study)을 fixture로 준비.
6. **이메일 테스트 도구 사전 셋업**: Litmus 또는 Email on Acid 계정을 준비하여 구현 중 수시로 테스트.

### 중장기 (v2)

7. **Unlayer Custom Tool 검토**: 번호 카드, 체크리스트 등을 Custom Tool로 등록하면 편집 경험이 대폭 개선됨.
8. **프롬프트 버전 관리**: AI 프롬프트를 별도 파일로 분리하고, 프롬프트 테스트 자동화 검토.
9. **모바일 반응형 테스트 자동화**: Playwright로 모바일 뷰포트 스크린샷을 자동 촬영하여 회귀 테스트.

---

**결론**: TASK.md의 T1~T6 태스크 설계는 전반적으로 잘 구조화되어 있으며, 기술적으로 실현 가능하다. 주요 리스크는 (1) Unlayer JSON 구조의 제약으로 인한 에디터 편집 경험 저하, (2) AI 출력 비결정성으로 인한 파싱 실패, (3) T1의 row JSON 작성 복잡도이다. T0(스키마 정의) 추가와 T1+T5 합병을 권장하며, Unlayer 에디터 역공학을 통한 JSON 생성 방식을 우선 활용할 것을 제안한다.
