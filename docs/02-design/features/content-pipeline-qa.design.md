# Content Pipeline QA — Design

> 최종 갱신: 2026-02-28 (코드 기준 현행화)

## 1. 콘텐츠 AI 생성 아키텍처

### generateContentWithAI (actions/contents.ts)
- KnowledgeService 위임: `generate(request)` 호출
- 타입별 Consumer 매핑:
  - education, notice, case_study → `education` consumer
  - webinar → `webinar` consumer
  - promo → `promo` consumer

### TYPE_PROMPTS 시스템 (5종)
| 타입 | system prompt 핵심 | userPrefix | 최소 분량 |
|------|-------------------|-----------|----------|
| education | 메타 광고 전문 교육 콘텐츠 작성자 | "다음 주제에 대한 메타 광고 전문가 교육 콘텐츠를 작성해주세요" | 3,000자 |
| case_study | 고객 성공사례 작성 전문가 | "다음 주제에 대한 고객 성공사례를 작성해주세요" | 2,000자 |
| webinar | 웨비나/라이브 안내 콘텐츠 작성 전문가 | "다음 주제에 대한 웨비나 안내 콘텐츠를 작성해주세요" | 1,500자 |
| notice | 공지사항 작성 전문가 | "다음 내용에 대한 공지사항을 작성해주세요" | 500~1,000자 |
| promo | 프로모션/마케팅 콘텐츠 작성 전문가 | "다음 내용에 대한 프로모션 콘텐츠를 작성해주세요" | 1,500자 |

### CONTENT_BASE_STYLE (공통 규칙)
- ~해요 체, 마켓핏랩 블로그 스타일
- 전문 용어 → 괄호 설명
- 제목에 영어만 단독 사용 금지
- 마크다운 이스케이프 규칙 포함

## 2. 이메일 요약 생성 파이프라인

### generateEmailSummary (actions/contents.ts)
JSON 스키마 기반 구조화된 생성:

1. `ksGenerate()` 호출 (KnowledgeService)
2. AI 응답 → `parseAIResponse()` (newsletter-schemas.ts)
3. 파싱 결과 → `convertJsonToEmailSummary()` → 마크다운 변환
4. `validateBannerKeys()` (email-template-utils.ts) → 필수 배너키 검증
5. DB에 `email_summary` 저장

### 타입별 emailSummaryGuide
| 타입 | 필수 ### 배너키 |
|------|----------------|
| education | `### INSIGHT`, `### KEY POINT`, `### CHECKLIST` |
| webinar | `### 강의 미리보기`, `### 핵심 주제`, `### 이런 분들을 위해`, `### 웨비나 일정` |
| case_study | 성과 하이라이트 중심 |
| notice | 변경사항 핵심 |
| promo | 핵심 혜택 + 긴급성 |

### 배너키 검증 (email-template-utils.ts)
- `validateBannerKeys(emailSummary)`: ### 헤딩 파싱 → BANNER_MAP 매칭
- `parseSummaryToSections(emailSummary)`: 섹션별 분리

> TYPE_TO_TEMPLATE 상수는 존재하지 않음. 배너키 매핑은 parseSummaryToSections으로 처리.

## 3. 수정 대상 파일 (현재 구현)

| 파일 | 역할 |
|------|------|
| `src/actions/contents.ts` | Server Actions: CRUD + AI 생성 + 이메일 요약 |
| `src/lib/knowledge.ts` | KnowledgeService (RAG 파이프라인) |
| `src/lib/newsletter-schemas.ts` | JSON 스키마 + Zod 검증 |
| `src/lib/email-template-utils.ts` | 배너키 검증 + 섹션 파싱 |

## 4. 통합 지식 서비스 (구현 완료)

```
KnowledgeService.generate(request)
  → Stage 0: 이미지 설명 처리 (qa/chatbot)
  → Stage 1: 유사 QA 검색 (qa/chatbot)
  → Stage 2: Vector Search + Query Expansion + Reranking
  → Stage 3: LLM 호출 (Anthropic API)

Consumers:
  QA → generate(consumerType="qa") → Sonnet + Reranking + Thinking
  콘텐츠 → generate(consumerType="education"|"webinar"|"promo") → Opus
  뉴스레터 → generate(consumerType="newsletter") → Opus
```

## 5. 에러 처리

| 시나리오 | 기대 동작 |
|---------|----------|
| AI 생성 실패 | 3회 재시도 + fallback 매핑 + raw 저장 |
| RAG 검색 0건 | 컨텍스트 없이 생성 시도 |
| ### 헤딩 변형 | 부분매칭(includes)으로 대응 |
| AI가 필수 ### 누락 | validateBannerKeys 경고 + 재생성 옵션 |
| Claude API rate limit | 에러 표시 + 재시도 버튼 |

## 6. 구현 상태
- [x] generateContentWithAI → KnowledgeService 위임
- [x] TYPE_PROMPTS 5종 시스템 프롬프트
- [x] CONTENT_BASE_STYLE 공통 규칙
- [x] generateEmailSummary → JSON 스키마 파이프라인
- [x] 배너키 검증 (validateBannerKeys)
- [x] 콘텐츠 타입 → Consumer 매핑 (CONTENT_TO_CONSUMER)
