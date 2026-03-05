# TASK — T3: 정보공유 생성 프록시 경유

## 목표
정보공유 콘텐츠 생성(Opus) 시 Anthropic API 직접 호출 대신 로컬 프록시 서버를 경유하도록 변경.
Q&A(Sonnet)는 기존 API 유지. 정보공유 생성만 프록시.

## 현재 동작
- `src/app/api/admin/curation/generate/route.ts` 에서 Anthropic SDK로 직접 API 호출
- `new Anthropic()` → `client.messages.create()` 패턴
- 모델: claude-opus-4-6, max_tokens: 16000, thinking budget: 10000

## 기대 동작
- 정보공유 생성 시 `AI_PROXY_URL` 환경변수가 있으면 프록시로 요청
- 프록시 실패 시 기존 Anthropic API로 폴백 (서비스 중단 방지)
- `AI_PROXY_URL` 환경변수가 없으면 기존 방식 그대로

## 프록시 API 스펙
```
POST {AI_PROXY_URL}
Headers:
  Content-Type: application/json
  x-proxy-key: {AI_PROXY_KEY}  // 환경변수
Body:
  {
    "model": "claude-opus-4-6",
    "max_tokens": 16000,
    "system": "시스템 프롬프트",
    "messages": [{"role":"user","content":"..."}],
    "thinking": {"type":"enabled","budget_tokens":10000}
  }
Response:
  {
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "content": [{"type":"text","text":"생성된 콘텐츠"}],
    "model": "claude-opus-4-6",
    "stop_reason": "end_turn"
  }
```

## 수정 방법
1. `generate/route.ts`에 프록시 호출 함수 추가:
   - `AI_PROXY_URL`과 `AI_PROXY_KEY` 환경변수 확인
   - fetch로 프록시 호출 (timeout 120초)
   - 응답에서 content[0].text 추출 (기존 Anthropic SDK 응답과 동일 구조)

2. 기존 `client.messages.create()` 호출 부분을:
   - 먼저 프록시 시도
   - 프록시 실패(네트워크 에러, 타임아웃, 5xx) → 기존 Anthropic API 폴백
   - console.log로 "프록시 사용" / "API 폴백" 로깅

3. thinking 응답 처리:
   - 프록시 응답의 content 배열에 thinking block이 있을 수 있음
   - type === "text"인 항목만 추출 (기존 코드와 동일)

## 환경변수
- `AI_PROXY_URL`: 프록시 엔드포인트 (예: https://xxx.trycloudflare.com/v1/generate)
- `AI_PROXY_KEY`: 프록시 인증 키

## 하지 말 것
- Q&A 관련 코드 (knowledge.ts, domain-intelligence.ts) 수정 금지
- 정보공유 프롬프트 내용 수정 금지
- AI 수정(revise) 엔드포인트 수정 금지 (정보공유 생성만)
- 새 패키지 설치 금지 (fetch는 Next.js 내장)
- Anthropic SDK 제거 금지 (폴백용으로 유지)
