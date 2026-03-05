# T3: 정보공유 생성 프록시 경유 설계서

## 1. 데이터 모델
- 변경 없음 (DB/타입 수정 없음)

## 2. API 설계

### 프록시 API 스펙
```
POST {AI_PROXY_URL}
Headers:
  Content-Type: application/json
  x-proxy-key: {AI_PROXY_KEY}
Body:
  {
    "model": "claude-opus-4-6",
    "max_tokens": 16000,
    "temperature": 1,
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

## 3. 컴포넌트 구조

### 수정 파일: `src/app/api/admin/curation/generate/route.ts`

#### 3-1. 프록시 호출 헬퍼 함수 추가
```typescript
async function callViaProxy(
  proxyUrl: string,
  proxyKey: string,
  body: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string }> }>
```
- fetch로 프록시 호출 (AbortController timeout 120초)
- 응답 !ok → throw Error
- 응답 JSON 파싱 후 반환

#### 3-2. 기존 Anthropic API 호출 부분 변경

**Before:**
```typescript
const response = await fetch(ANTHROPIC_API_URL, { ... });
```

**After:**
```typescript
// 1) 프록시 환경변수 확인
const proxyUrl = process.env.AI_PROXY_URL;
const proxyKey = process.env.AI_PROXY_KEY || "";

// 2) 요청 바디 구성 (공통)
const requestBody = { model, max_tokens, temperature, thinking, system, messages };

// 3) 프록시 시도 → 실패 시 폴백
let data;
if (proxyUrl) {
  try {
    data = await callViaProxy(proxyUrl, proxyKey, requestBody);
    console.log("[정보공유 생성] 프록시 사용:", proxyUrl);
  } catch (proxyErr) {
    console.warn("[정보공유 생성] 프록시 실패, API 폴백:", proxyErr.message);
    data = await callAnthropicDirect(apiKey, requestBody);
  }
} else {
  data = await callAnthropicDirect(apiKey, requestBody);
}
```

#### 3-3. 기존 Anthropic 직접 호출 헬퍼
```typescript
async function callAnthropicDirect(
  apiKey: string,
  body: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string }> }>
```
- 기존 fetch(ANTHROPIC_API_URL, ...) 로직을 그대로 래핑

## 4. 에러 처리
| 시나리오 | 처리 |
|---------|------|
| 프록시 네트워크 에러 | catch → Anthropic API 폴백 |
| 프록시 타임아웃 (120초) | AbortController → catch → 폴백 |
| 프록시 5xx 응답 | !response.ok → throw → 폴백 |
| 프록시 + 폴백 모두 실패 | 기존 500 에러 응답 반환 |
| AI_PROXY_URL 미설정 | 기존 Anthropic API 직접 호출 |

## 5. 구현 순서
- [x] 5-1. callViaProxy() 헬퍼 함수 추가
- [x] 5-2. callAnthropicDirect() 헬퍼 함수 추가 (기존 로직 추출)
- [x] 5-3. POST 핸들러에서 프록시 우선 → 폴백 분기 적용
- [x] 5-4. console.log/warn 로깅 추가
- [x] 5-5. tsc + lint + build 통과 확인
