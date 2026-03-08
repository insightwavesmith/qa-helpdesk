# 서비스 오픈 전 수정사항 6건 설계서

## T1. Q&A 질문 삭제 (수강생 본인)
### 데이터 모델
- questions.author_id와 현재 user.id 비교
### API 설계
- `deleteQuestion(id)`: requireAdmin → author_id === user.id OR admin 허용
### 컴포넌트 구조
- `[id]/page.tsx`: userId 추출, isAdmin || isOwner 일 때 DeleteQuestionButton 노출
### 에러 처리
- 본인/admin 아닌 경우: "권한이 없습니다" 반환
### 구현 순서
1. questions.ts deleteQuestion 수정
2. [id]/page.tsx userId/isOwner 로직 추가

## T2. 수강후기 삭제 (본인)
### API 설계
- `deleteReview(id)`: admin OR author_id === user.id 허용
### 컴포넌트 구조
- ReviewDetailPage: isOwner 계산, ReviewDetailClient에 전달
- ReviewDetailClient: isAdmin || isOwner 일 때 삭제 버튼 노출
### 구현 순서
1. reviews.ts deleteReview 수정
2. [id]/page.tsx에서 userId 추출, isOwner 전달
3. ReviewDetailClient isOwner prop 추가

## T3. 총가치각도기 해석 가이드 삭제 + 바차트
### 컴포넌트 구조
- OverlapAnalysis.tsx: 해석 가이드 Card 제거
- 전체 조합 테이블 대신 수평 바차트로 변경
### 구현 순서
1. 해석 가이드 Card (L473-498) 삭제
2. BarChart 컴포넌트로 세트조합 중복률 시각화

## T4. 개인정보처리방침 링크
### 원인
- /privacy가 middleware PUBLIC_PATHS에 없음
### 구현 순서
1. middleware.ts PUBLIC_PATHS에 "/privacy" 추가

## T5. 더보기 추가 로드
### 분석
- 코드 로직 정상, 파라미터 전달 확인 필요
### 구현 순서
1. handleLoadMore 디버그 로깅 추가
2. 파라미터 전달 검증

## T6. 모니터링 등록(핀)
### 분석
- handlePinBrand 로직 정상, 런타임 에러 확인 필요
### 구현 순서
1. 에러 핸들링 강화
2. 디버그 로깅 추가
