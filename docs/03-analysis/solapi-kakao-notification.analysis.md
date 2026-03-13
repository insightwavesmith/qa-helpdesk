# 답변 승인 시 솔라피 카카오 알림톡 발송 — Gap 분석

## Match Rate: 100%

## 설계 항목 vs 구현 비교

| # | 설계 항목 | 구현 상태 | 일치 |
|---|----------|----------|------|
| 1 | `src/lib/solapi.ts` 신규 — HMAC-SHA256 인증 | `generateAuthHeader()` 구현 (randomUUID + date + sha256) | ✅ |
| 2 | `sendKakaoNotification(phone)` — 알림톡 발송 | pfId, templateId, disableSms:true 포함 | ✅ |
| 3 | 전화번호 없으면 조용히 스킵 | `if (!phone)` early return + 로그 | ✅ |
| 4 | 환경변수 미설정 시 스킵 | `if (!process.env.SOLAPI_API_KEY)` early return | ✅ |
| 5 | 발송 실패해도 승인 정상 (fire-and-forget) | `Promise.resolve(...).catch()` 패턴 | ✅ |
| 6 | `approveAnswer()`에서 question → author → phone 조회 | question_id → author_id → profiles.phone 체이닝 | ✅ |
| 7 | npm SDK 미사용, fetch 직접 구현 | fetch + HMAC 직접 구현 | ✅ |
| 8 | `disableSms: true` (대체 SMS 없음) | kakaoOptions에 설정됨 | ✅ |
| 9 | 전화번호 하이픈 정규화 | `phone.replace(/-/g, "")` | ✅ |
| 10 | tsc + build 통과 | tsc 에러 0, build 성공 | ✅ |

## 불일치 항목
없음

## 수정 필요
없음

## 변경 파일
- `src/lib/solapi.ts` (신규, +68줄)
- `src/actions/answers.ts` (수정, +16줄)
- `docs/01-plan/features/solapi-kakao-notification.plan.md` (신규)
- `docs/02-design/features/solapi-kakao-notification.design.md` (신규)
