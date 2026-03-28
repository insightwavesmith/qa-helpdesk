# 답변 승인 시 솔라피 카카오 알림톡 발송 — Design

## 1. 데이터 모델
기존 테이블 사용, 신규 테이블 없음.

- `questions.author_id` → `profiles.id` (FK) → `profiles.phone` 조회
- `answers.question_id` → `questions.id` (FK)

흐름: `answerId` → answers.question_id → questions.author_id → profiles.phone

## 2. API 설계

### 솔라피 알림톡 발송
- **Endpoint**: `POST https://api.solapi.com/messages/v4/send`
- **인증**: HMAC-SHA256 (`Authorization: HMAC-SHA256 apiKey={key}, date={ISO}, salt={uuid}, signature={sig}`)
- **Request Body**:
```json
{
  "message": {
    "to": "01012345678",
    "from": "",
    "kakaoOptions": {
      "pfId": "_xdqCxin",
      "templateId": "KA01TP2603110817364241yYm61nGS6W",
      "disableSms": true
    }
  }
}
```

## 3. 컴포넌트 구조

### `src/lib/solapi.ts` (신규)
```typescript
// HMAC-SHA256 서명 생성
function generateSignature(apiKey: string, apiSecret: string): AuthHeader

// 알림톡 발송
export async function sendKakaoNotification(phone: string): Promise<void>
```

### `src/actions/answers.ts` (수정)
- `approveAnswer()` 내에서:
  1. question_id로 questions 테이블에서 author_id 조회
  2. author_id로 profiles 테이블에서 phone 조회
  3. phone이 있으면 `sendKakaoNotification(phone)` fire-and-forget 호출

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| phone이 null/빈값 | 조용히 스킵 (로그만) |
| 솔라피 API 실패 | console.error 로그, 승인은 정상 처리 |
| 환경변수 미설정 | 조용히 스킵 (로그만) |

## 5. 구현 순서
- [x] `src/lib/solapi.ts` 신규 생성
- [x] `src/actions/answers.ts`의 `approveAnswer()`에 알림톡 발송 추가
- [ ] 환경변수 `.env.local`에 추가
- [ ] tsc + lint + build 검증
