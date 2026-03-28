# 수정사항 2차 (0308) 설계서

## 1. 데이터 모델
변경 없음 (기존 competitor_monitors 테이블 사용)

## 2. API 설계
변경 없음 (기존 /api/competitor/search, /api/competitor/monitors 사용)

## 3. 컴포넌트 구조

### T1: privacy/page.tsx
- 섹션 3 ul에 자사몰/광고 데이터 li 2개 추가

### T2: competitor-dashboard.tsx
- `handleLoadMore`에 toast 피드백 추가
  - 성공: `toast.success("광고 N건 추가 로드")`
  - 결과 0건: `toast.info("더 이상 결과가 없습니다")`
  - 실패: `toast.error(에러메시지)`
- console.log 제거 (디버그 로깅 정리)

### T3: competitor-dashboard.tsx + ad-card.tsx
- `handlePinBrand`에 toast 피드백 추가
  - 성공: `toast.success("브랜드명 모니터링 등록 완료")`
  - 중복: `toast.warning("이미 등록된 브랜드")`
  - 한도: `toast.warning("최대 10개")`
  - 실패: `toast.error(에러메시지)`
- console.log 제거

## 4. 에러 처리
- toast로 즉각 피드백 (기존 error 배너 대신)
- API 에러 시 toast.error + setError(null)로 기존 에러 배너 미사용

## 5. 구현 순서
1. T1: privacy 페이지 수정
2. T2: handleLoadMore toast 추가
3. T3: handlePinBrand toast 추가
4. console.log 디버그 코드 정리
5. 빌드 검증
