# TASK: 수강생 질문 등록 시 슬랙 알림

## 배경
수강생이 bscamp에서 질문을 올리면, 관리자가 바로 알 수 있도록 슬랙 채널에 알림을 보내야 함.

## 요구사항

### 질문 생성 시 슬랙 채널에 알림 전송
- 질문이 DB에 저장되는 시점(질문 생성 API)에 슬랙 알림 발송
- 대상 채널: `C0AL8E8LUTT`
- 알림 내용: 질문 제목, 작성자 이름, 질문 링크(bscamp.vercel.app의 해당 질문 URL)
- 슬랙 API로 메시지 전송 (Incoming Webhook 또는 Bot Token + chat.postMessage)

### 구현 방식
- 환경변수: `SLACK_WEBHOOK_URL` 또는 기존 Slack Bot Token 활용
- 질문 생성 API에서 DB 저장 성공 후 비동기로 슬랙 전송 (실패해도 질문 생성은 성공)
- 간단한 포맷: "📩 새 질문이 등록됐습니다\n*{제목}*\n작성자: {이름}\n{URL}"

### 참조
- 질문 생성 관련 코드 찾아서 적절한 위치에 추가
- 슬랙 채널 ID: `C0AL8E8LUTT`

## 빌드 검증 + 커밋 + 푸시
- `npm run build` 통과
- 커밋 메시지: `feat: 수강생 질문 등록 시 슬랙 채널 알림 추가`
- main 브랜치에 푸시
