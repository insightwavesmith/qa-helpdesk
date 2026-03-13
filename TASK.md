# TASK: 답변 승인 시 솔라피 카카오 알림톡 자동 발송

## What
관리자가 답변을 승인하면, 질문 작성자에게 카카오 알림톡으로 "답변 완료" 알림을 자동 발송한다.

## Why
- 수강생이 답변이 달렸는지 매번 확인하러 들어올 필요 없음
- 카톡으로 바로 알려주면 답변 확인율 올라감

## 솔라피 API 정보
- API Key: `NCSOKHV1AEESY3NS`
- API Secret: `4IXME1RIGEOR0OZRCEDGSDQEZ7VIYEIB`
- PFID (채널ID): `_xdqCxin` (channelId는 `KA01PF260224053759051mFP88hSPjQv`)
- 템플릿 코드: `KA01TP2603110817364241yYm61nGS6W`
- 템플릿 내용 (고정, 치환문구 없음):
  ```
  안녕하세요, 자사몰 사관학교입니다.
  
  질문 게시판에 업로드 하신 질문에 답변이 완료되었습니다.
  
  아래 버튼을 통해 확인 부탁드립니다.
  ```
- 버튼: "Q&A 게시판" → https://bscamp.vercel.app/questions
- 인증: HMAC-SHA256 (apiKey + date + salt + signature)

## 솔라피 API 발송 예시
```
POST https://api.solapi.com/messages/v4/send
{
  "message": {
    "to": "01012345678",
    "from": "발신번호",
    "kakaoOptions": {
      "pfId": "_xdqCxin",
      "templateId": "KA01TP2603110817364241yYm61nGS6W",
      "disableSms": true
    }
  }
}
```

## 구현
1. `src/lib/solapi.ts` 신규 — 솔라피 HMAC 인증 + 알림톡 발송 함수
2. `src/actions/answers.ts`의 `approveAnswer()` — 승인 후 질문 작성자 phone 조회 → 알림톡 발송 (fire-and-forget)
3. 환경변수: `.env.local`에 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET` 추가

## 수강생 전화번호
- profiles 테이블에 phone 컬럼이 있는지 확인 필요
- 없으면 auth.users의 phone 확인
- 전화번호가 없는 수강생은 스킵 (에러 아님)

## Validation
- [ ] 답변 승인 시 질문 작성자에게 알림톡 발송
- [ ] 전화번호 없는 수강생은 조용히 스킵
- [ ] 발송 실패해도 승인 자체는 정상 처리 (fire-and-forget)
- [ ] `tsc --noEmit` 통과
- [ ] 기존 승인 기능 영향 없음

## 하지 말 것
- 솔라피 SDK(npm 패키지) 설치하지 말 것 — fetch + HMAC 직접 구현 (의존성 최소화)
- 발신번호(from) 필드: 알림톡은 from 없어도 됨 (카카오 채널이 발신자)
- 대체 SMS 발송 안 함 — `disableSms: true`
