# T5. 관리자 초대코드 관리 UI Gap 분석

## Match Rate: 100%

## 일치 항목
- [x] /admin/invites 페이지 생성 (use client)
- [x] 초대코드 목록 테이블: code, cohort, used_count/max_uses, expires_at, 상태
- [x] 코드 생성 폼: 코드, 기수, 만료일, 최대 사용횟수
- [x] 코드 복사: 클립보드 복사 + toast.success
- [x] 코드 삭제: window.confirm 후 deleteInviteCode 호출
- [x] 상태 배지: 활성(green), 만료됨(red), 소진됨(yellow)
- [x] 사이드바에 "초대코드" 메뉴 추가 (admin 전용, Ticket 아이콘)
- [x] 브랜드 스타일: #F75D5D 버튼, rounded-xl 카드, shadow-sm, border-gray-200
- [x] 한국어 UI
- [x] server actions 사용: getInviteCodes, createInviteCode, deleteInviteCode
- [x] npm run build 성공

## 불일치 항목
없음.

## 수정 필요
없음.

## 추가 수정 (빌드 통과용)
- posts/[id]/page.tsx: relatedPosts.map 타입 어노테이션에서 shop_name 타입 매칭 수정
- posts/posts-redesign-client.tsx: PostData.author.shop_name에 `| null` 추가
- questions/questions-list-client.tsx: QuestionData.author.shop_name에 `| null` 추가
- 위 수정은 T0(DB 마이그레이션)에서 shop_name이 nullable로 변경된 것에 따른 타입 호환성 수정
