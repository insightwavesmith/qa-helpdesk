# TASK: Q&A 답변 개선 + 정보공유 생성 품질 복구

## 목표
Q&A 답변 품질 개선 (파이프라인 순서 변경 + 포맷 + 톤) + 정보공유 생성 품질 복구 (thinking budget + IMAGE_PLACEHOLDER)

---

## T1. Q&A 파이프라인 — Stage 0 용어 정의 웹서치

### 현재 동작
- Stage 0 (`domain-intelligence.ts`): Sonnet으로 용어 정규화만 수행 (15초)
- Query Expansion (`query-expander.ts`): Gemini Flash로 검색 쿼리 확장 (별도 단계)
- 용어의 "정확한 뜻"을 외부에서 확인하지 않음

### 기대 동작
- Stage 0에서 핵심 용어 1~2개의 정의를 Brave Search로 확인
- 확인된 정의가 RAG 검색 + 답변 생성에 컨텍스트로 포함됨

### 변경사항
- `src/lib/domain-intelligence.ts`:
  - `analyzeDomain()` 함수 내에서 Sonnet 호출 후, `normalizedTerms` 중 핵심 1~2개 추출
  - Brave Search API로 "{용어} 뜻", "{용어}란" 검색 (결과 2건, 한국어, freshness 무관)
  - 반환 인터페이스(`DomainAnalysis`)에 `termDefinitions: Array<{term: string, definition: string}>` 필드 추가
  - 타임아웃: Brave 5초 (실패 시 빈 배열 반환, 기존 동작 유지)
  - Brave API 키: `process.env.BRAVE_API_KEY` (없으면 스킵)
- `src/lib/knowledge.ts`:
  - `createAIAnswerForQuestion()` 내에서 `domainAnalysis.termDefinitions`를 Stage 3 컨텍스트에 포함
  - 시스템 프롬프트가 아닌 유저 메시지의 컨텍스트 섹션에 "용어 정의:\n- {term}: {definition}" 추가

### 왜 필요한가
- "네이버쇼핑 입점" → AI가 "스마트스토어 개설"로 오해. 실제는 자사몰→네이버 등록
- 도메인 용어를 모르면 RAG 검색도 엉뚱한 청크를 찾음

### 하지 말 것
- 기존 Stage 0의 normalizedTerms, intent, questionType 등 기존 기능 변경 금지
- 웹서치 실패 시 에러 throw 금지 — 기존 동작으로 폴백

---

## T2. Q&A 답변 포맷 3단 구조

### 현재 동작
답변이 본문만 있음. 요약 없이 바로 설명 시작.

### 기대 동작
답변이 "핵심 요약 → 상세 설명 → 실행 포인트" 3단 구조로 생성됨.

### 변경사항
- `src/lib/knowledge.ts`: QA_SYSTEM_PROMPT 수정
  - 답변 구조를 명시:
    ```
    **핵심:** [1-2문장으로 질문의 답]
    
    [상세 설명 - 기존 답변 스타일]
    
    **정리하면:**
    - [실행 가능한 포인트 1]
    - [실행 가능한 포인트 2]
    ```
  - "핵심:" 으로 시작하는 1-2문장 요약 필수
  - "정리하면:" 으로 끝나는 실행 포인트 필수

### 하지 말 것
- 기존 프롬프트의 말투 규칙, AI 상투어 금지 목록 등 삭제 금지
- 답변 길이 제한 변경 금지

---

## T3. Q&A 답변 톤 보정

### 현재 동작
프롬프트에 "~다/~거든/~죠 단정형" 규칙이 있지만, 실제 출력이 블로그처럼 나옴.

### 기대 동작
강사가 수강생에게 답변하는 톤. 프롬프트 규칙이 실제로 지켜짐.

### 변경사항
- `src/lib/knowledge.ts`: QA_SYSTEM_PROMPT에 few-shot 예시 2개 추가
  - 좋은 예시 (강사→수강생 톤):
    ```
    **핵심:** 기여기간의 '클릭'이 링크 클릭만으로 바뀐 거다.
    
    기존에는 이미지 확대, 좋아요, 댓글 같은 모든 인터랙션이 '클릭'으로 잡혔거든. 
    그래서 클릭 후 7일 기여에 과대 집계가 있었다.
    이제 CTA 버튼이나 링크를 눌러서 자사몰에 실제로 도착한 사람만 센다.
    
    **정리하면:**
    - 전환 숫자가 줄어들어도 실제 매출이 줄어든 건 아닐 수 있다
    - 광고관리자 보고된 전환과 실제 매출 대조해서 확인해라
    ```
  - 나쁜 예시 (블로그 톤):
    ```
    안녕하세요! 좋은 질문을 해주셨네요.
    기여기간에 대해 알아보도록 하겠습니다.
    메타의 기여기간은 광고 성과를 측정하는 기간을 의미합니다...
    ```

### 하지 말 것
- 기존 프롬프트 규칙 삭제 금지 — 추가만
- few-shot 예시를 3개 이상 넣지 말 것 (토큰 절약)

---

## T4. 정보공유 생성 — max_tokens 확대

### 현재 동작
- max_tokens: 16,000
- Extended Thinking budget_tokens: 10,000
- 실제 텍스트 출력 상한: ~6,000 토큰

### 기대 동작
- max_tokens: 32,768 (Opus 최대치)
- Extended Thinking budget_tokens: 10,000 유지
- 실제 텍스트 출력 상한: ~22,768 토큰

### 변경사항
- `src/app/api/admin/curation/generate/route.ts` line 253: `max_tokens: 16000` → `max_tokens: 32768`
- budget_tokens는 10,000 그대로 유지

### 하지 말 것
- budget_tokens 변경 금지
- 모델 변경 금지
- 다른 파라미터 변경 금지

---

## T5. 정보공유 생성 — IMAGE_PLACEHOLDER 처리

### 현재 동작
- 프롬프트에 이미지 금지 규칙이 **이미 3곳에 있음** (line 108, 134, 191)
- 그럼에도 AI가 가끔 `IMAGE_PLACEHOLDER` figure 태그 생성
- `post-body.tsx:180,184`에서 `img.closest("figure")?.remove()` → 섹션 통째로 사라짐

### 기대 동작
- 프롬프트 규칙 강화로 figure 생성 자체를 방지
- 만약 생성되더라도 figure 전체가 아닌 img 태그만 제거 (텍스트 보존)

### 변경사항
1. `src/app/api/admin/curation/generate/route.ts`: 기존 3개 이미지 금지 규칙을 하나로 통합 + 강화
   - 기존 line 108: "이미지 태그(![...](URL)) 삽입 금지" → 유지
   - 기존 line 134: "이미지 마크다운 태그 사용 금지" → 유지
   - 기존 line 191: "이미지 관련 마크다운 사용 금지" → 유지
   - **추가**: "<figure>, <img>, <picture> HTML 태그 생성 절대 금지. 텍스트 콘텐츠만."
2. `src/components/posts/post-body.tsx:180,184`: `img.closest("figure")?.remove()` → img 태그만 제거, figure 내 텍스트는 보존
   - 변경 전: `img.closest("figure")?.remove()`
   - 변경 후: `img.remove()` (figure 안의 figcaption 등 텍스트는 살림)

### 하지 말 것
- 기존 3개 금지 규칙 삭제 금지 — 추가만
- post-body.tsx의 다른 로직 변경 금지

---

## T6. 정보공유 생성 — 글자수 기준 변경

### 현재 동작
- 프롬프트: "최소 4,000자", 1개 소스 4,000~5,000자, 묶음 5,000~7,000자
- 코드 검증: 하한 2,000자, 상한 7,000자 (경고만)

### 기대 동작
- 프롬프트 + 코드 모두 최소 5,000자 / 상한 10,000자로 통일

### 변경사항
1. `src/app/api/admin/curation/generate/route.ts` 프롬프트 글자수 규칙 (line 119 부근):
   - "최소 4,000자 이상" → "최소 5,000자 이상 (공백 포함). 5,000자 미만 절대 금지."
   - "1개 콘텐츠: 4,000~5,000자" → "1개 콘텐츠: 5,000~7,000자"
   - "2~4개 묶음: 5,000~7,000자" → "2~4개 묶음: 7,000~10,000자"
2. `src/app/api/admin/curation/generate/route.ts` 코드 검증 (line 299 부근):
   - `bodyMd.length < 2000` → `bodyMd.length < 5000`
   - `bodyMd.length > 7000` → `bodyMd.length > 10000`

### 하지 말 것
- 재생성 로직 추가 금지 — 기존 경고 반환 로직 유지
- 검증 실패 시 에러 throw 금지 — 경고(console.warn)만

---

## 공통 하지 말 것
- 다른 파일 변경 금지 (위에 명시된 파일만)
- 테스트 파일 추가 금지
- 패키지 추가 금지
- DB 스키마 변경 금지
- 기존 코드 구조/패턴 변경 금지 (지정된 부분만 수정)
