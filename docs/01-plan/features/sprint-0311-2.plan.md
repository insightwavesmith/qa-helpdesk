# Sprint 0311-2 Plan (3건 병렬)

## T1: 답변 수정 UI 개선
- **이게 뭔지**: 답변 수정 시 답변 작성 폼과 동일한 UI (큰 textarea + 이미지 첨부) 사용
- **왜 필요한지**: 현재 수정 UI는 작은 textarea만 있고 이미지 첨부 불가
- **구현 내용**:
  1. `answer-edit-button.tsx`를 답변 작성 폼(`answer-form.tsx`)과 동일한 UI로 변경
  2. 이미지 업로드 컴포넌트 재활용
  3. `updateAnswerByAuthor` 액션에 `imageUrls` 파라미터 추가
  4. 기존 이미지 표시 + 삭제/추가 가능

## T2: 수강생 관리 탭에 광고관리자 바로가기
- **이게 뭔지**: 회원 목록에서 Meta Ads Manager 바로가기 버튼 추가
- **왜 필요한지**: 관리자가 수강생 광고관리자에 바로 접근하고 싶음
- **구현 내용**:
  1. `members-client.tsx` 테이블에 "광고관리자" 열 추가
  2. `getMembers()` 에서 ad_accounts JOIN하여 account_id 가져오기
  3. URL: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={account_id}`
  4. 계정 없으면 미표시, 여러 개면 첫 번째 사용

## T3: 믹스패널 Phase 2 이벤트 추가
- **이게 뭔지**: Phase 1에서 빠진 나머지 이벤트를 모두 추가
- **왜 필요한지**: 택소노미 전체 커버 필요
- **구현 내용**: TASK-sprint-0311-2.md 참조 (인증/QA/각도기/경쟁사/콘텐츠/커뮤니티/설정/관리자 이벤트)

## 성공 기준
- `npm run build` 통과
- 각 기능 정상 동작
