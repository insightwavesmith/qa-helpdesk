# Q&A 답변 개선 + 정보공유 생성 품질 복구 — Plan

> 작성: 2026-03-05
> 참조: TASK.md (T1~T6, T4 제외)
> 선행 참조: F2(qa-answer-humanize), F3(placeholder-image-removal), B3(ai-prompt-humanize)

---

## 1. 개요

| 구분 | 내용 |
|------|------|
| **목표** | Q&A 답변 품질 개선 (파이프라인 + 포맷 + 톤) + 정보공유 생성 품질 복구 (IMAGE_PLACEHOLDER + 글자수) |
| **대상 태스크** | T1, T2, T3, T5, T6 (T4는 별도 TASK) |
| **수정 파일** | 총 3개 파일 (아래 상세) |
| **DB 변경** | 없음 |
| **패키지 추가** | 없음 |

---

## 2. 태스크별 요약

### T1. Q&A Stage 0 용어 정의 웹서치 (Brave)

- **문제**: Stage 0이 Sonnet으로 용어 정규화만 하고, 정확한 뜻을 외부 검증하지 않음
  - 예: "네이버쇼핑 입점" → "스마트스토어 개설"로 오해 (실제는 자사몰→네이버 등록)
- **해결**: `analyzeDomain()` 반환 후 핵심 용어 1~2개를 Brave Search로 정의 조회
- **변경 파일**: `src/lib/domain-intelligence.ts`, `src/lib/knowledge.ts`

### T2. Q&A 답변 포맷 3단 구조

- **문제**: 답변이 본문만 있고 요약/결론 없이 바로 시작
- **해결**: "핵심 요약 → 상세 설명 → 정리하면" 3단 구조 프롬프트 추가
- **변경 파일**: `src/lib/knowledge.ts` (QA_SYSTEM_PROMPT)

### T3. Q&A 답변 톤 보정 (few-shot)

- **문제**: 프롬프트에 규칙이 있으나 실제 출력이 블로그 톤
- **해결**: QA_SYSTEM_PROMPT에 few-shot 예시 2개 (좋은 예시 + 나쁜 예시) 추가
- **변경 파일**: `src/lib/knowledge.ts` (QA_SYSTEM_PROMPT)

### T5. 정보공유 IMAGE_PLACEHOLDER 처리

- **문제**: 프롬프트에 이미지 금지 규칙이 3곳에 있으나 AI가 가끔 figure 태그 생성. `post-body.tsx`에서 `img.closest("figure")?.remove()`로 섹션 텍스트 통째로 사라짐
- **해결**: (1) 프롬프트에 HTML 태그(`<figure>`, `<img>`, `<picture>`) 명시적 금지 추가, (2) `post-body.tsx`에서 img 태그만 제거하고 figure 내 텍스트(figcaption 등)는 보존
- **변경 파일**: `src/app/api/admin/curation/generate/route.ts`, `src/components/posts/post-body.tsx`

### T6. 정보공유 글자수 기준 변경

- **문제**: 프롬프트 최소 4,000자 / 코드 검증 하한 2,000자·상한 7,000자 — 불일치 + 부족
- **해결**: 프롬프트 + 코드 모두 최소 5,000자 / 상한 10,000자로 통일
- **변경 파일**: `src/app/api/admin/curation/generate/route.ts`

---

## 3. 변경 파일 종합

| 파일 | 관련 태스크 | 변경 유형 |
|------|------------|----------|
| `src/lib/domain-intelligence.ts` | T1 | Brave Search 호출 + `DomainAnalysis` 인터페이스 확장 |
| `src/lib/knowledge.ts` | T1, T2, T3 | `QA_SYSTEM_PROMPT` 수정 + `termDefinitions` 컨텍스트 추가 |
| `src/app/api/admin/curation/generate/route.ts` | T5, T6 | 프롬프트 이미지 금지 강화 + 글자수 기준 변경 |
| `src/components/posts/post-body.tsx` | T5 | img 태그만 제거 (figure 내 텍스트 보존) |

---

## 4. 각 태스크 상세 변경사항

### T1. domain-intelligence.ts 변경

#### 4-1-1. DomainAnalysis 인터페이스 확장 (L21~29)
```typescript
// 추가 필드
termDefinitions: Array<{ term: string; definition: string }>;
```
- `normalizedTerms` 중 핵심 1~2개의 사전적 정의를 Brave Search로 조회한 결과

#### 4-1-2. analyzeDomain() 함수 내 Brave 호출 추가
- **위치**: Sonnet 응답 파싱 후, return 직전
- **로직**:
  1. `normalizedTerms`에서 최대 2개 핵심 용어 추출
  2. 각 용어에 대해 `searchBrave({ query: "{용어} 뜻", count: 2, country: "KR" })` 호출
  3. 결과의 `description`을 정제하여 `termDefinitions` 배열에 담기
- **타임아웃**: 개별 5초 (`BRAVE_API_KEY` 없으면 빈 배열 반환)
- **실패 시**: 빈 배열 반환 (`termDefinitions: []`), 기존 동작 유지 — 에러 throw 금지

#### 4-1-3. knowledge.ts — termDefinitions 컨텍스트 주입
- **위치**: `generate()` 함수 내 `buildDomainContext()` 호출 부분 (L680~684)
- **로직**: `buildDomainContext()` 함수에서 `analysis.termDefinitions` 처리 추가
  ```
  ## 용어 정의
  - {term}: {definition}
  ```
- **주입 위치**: 유저 메시지의 컨텍스트 섹션 (시스템 프롬프트 아님)

### T2. QA_SYSTEM_PROMPT — 3단 구조 포맷 (knowledge.ts)

- **삽입 위치**: QA_SYSTEM_PROMPT 내 "말투 규칙" 앞 (L92 이전)
- **추가 내용**:
```
답변 구조 (반드시 지켜라):
**핵심:** [1-2문장으로 질문의 답]

[상세 설명 - 강의 자료 기반]

**정리하면:**
- [실행 가능한 포인트 1]
- [실행 가능한 포인트 2]
```
- "핵심:"으로 시작하는 1~2문장 요약 필수
- "정리하면:"으로 끝나는 실행 포인트 필수

### T3. QA_SYSTEM_PROMPT — few-shot 예시 추가 (knowledge.ts)

- **삽입 위치**: QA_SYSTEM_PROMPT 내 "톤 레퍼런스" 섹션 뒤 (L155 이후)
- **추가 내용**: TASK.md에 명시된 좋은 예시 1개 + 나쁜 예시 1개
- **제한**: 예시 3개 이상 금지 (토큰 절약)
- 기존 프롬프트 규칙 삭제 금지 — 추가만

### T5. route.ts — 이미지 금지 프롬프트 강화

- **기존 3곳 유지** (L108, L134, L191) — 삭제 금지
- **추가**: `<figure>`, `<img>`, `<picture>` HTML 태그 생성 절대 금지 규칙
- **삽입 위치**: 기존 이미지 금지 규칙 뒤에 추가 1줄

### T5. post-body.tsx — img 태그만 제거

- **변경 위치**: useEffect 내 imgs.forEach 콜백 (L179~184)
- **변경 전**: `img.closest("figure")?.remove()` — figure 전체(텍스트 포함) 삭제
- **변경 후**: `img.remove()` — img 태그만 제거, figure 내 figcaption 등 텍스트 보존

### T6. route.ts — 글자수 기준 변경

#### 프롬프트 변경 (L118~122)
| 항목 | Before | After |
|------|--------|-------|
| 최소 기준 | "최소 4,000자 이상" | "최소 5,000자 이상 (공백 포함). 5,000자 미만 절대 금지." |
| 1개 콘텐츠 | "4,000~5,000자" | "5,000~7,000자" |
| 2~4개 묶음 | "5,000~7,000자" | "7,000~10,000자" |

#### 코드 검증 변경 (L299~303)
| 항목 | Before | After |
|------|--------|-------|
| 하한 경고 | `bodyMd.length < 2000` | `bodyMd.length < 5000` |
| 상한 경고 | `bodyMd.length > 7000` | `bodyMd.length > 10000` |

---

## 5. 하지 말 것 (공통)

- 위에 명시된 파일 외 다른 파일 변경 금지
- 테스트 파일 추가 금지
- 패키지 추가 금지
- DB 스키마 변경 금지
- 기존 코드 구조/패턴 변경 금지 (지정된 부분만 수정)
- 기존 프롬프트 규칙 삭제 금지 — 추가만

---

## 6. 의존성 순서

```
T1 (독립) ─┐
T2 (독립) ─┤──→ knowledge.ts 순차 수정 권장
T3 (독립) ─┘
T5 (독립) ─┬──→ route.ts + post-body.tsx
T6 (독립) ─┘──→ route.ts
```

- T1, T2, T3은 모두 `knowledge.ts`를 수정하므로 순차 적용 권장
- T5, T6은 모두 `route.ts`를 수정하므로 순차 적용 권장
- T1~T3 그룹과 T5~T6 그룹은 서로 독립 → 병렬 가능

---

## 7. 성공 기준

- [ ] T1: `DomainAnalysis.termDefinitions` 필드 추가, Brave 호출 동작 (실패 시 빈 배열)
- [ ] T2: QA_SYSTEM_PROMPT에 3단 구조 포맷 규칙 추가
- [ ] T3: QA_SYSTEM_PROMPT에 few-shot 좋은 예시 + 나쁜 예시 포함
- [ ] T5: route.ts에 HTML 이미지 태그 금지 규칙 추가, post-body.tsx에서 img만 제거
- [ ] T6: 프롬프트 최소 5,000자 / 상한 10,000자, 코드 검증 일치
- [ ] 기존 기능 깨지지 않음
- [ ] `npm run build` 성공
- [ ] lint 에러 0개

---

## 8. 위험 분석

| 위험 | 영향도 | 대응 |
|------|--------|------|
| Brave API 키 미설정 | 낮음 | 스킵 → 빈 배열 반환 |
| 프롬프트 변경 후 AI 출력 품질 저하 | 중간 | few-shot 예시로 가이드 강화 |
| post-body img 제거 시 레이아웃 깨짐 | 낮음 | figure 내 텍스트만 남으므로 자연스럽게 표시 |
| route.ts 글자수 상한 10,000 초과 | 낮음 | console.warn만 (기존 로직 유지) |
