# 온보딩 blur 시 에러 표시 Plan

> 작성일: 2026-03-06

## 배경
T3에서 `submitted` 상태 + `isProfileValid` + 에러 메시지 UI를 추가했으나,
submit 버튼이 `disabled={!isProfileValid}`이므로 `setSubmitted(true)`가 실행되지 않아
에러 메시지가 절대 표시되지 않는 문제.

## 목표
- 4개 필수 필드(브랜드명, 쇼핑몰URL, 연매출, 월광고예산)에 blur 시 에러 표시
- 기존 disabled 로직, submitted 로직 유지

## 범위
- `src/app/(auth)/onboarding/page.tsx` — StepProfile 컴포넌트만 수정
- 새 컴포넌트/파일 추가 없음

## 성공 기준
- blur 후 미입력 필드에 '필수 항목입니다' 빨간 텍스트 + border-red-300 표시
- 값 입력 후 에러 자동 해제
- npm run build 성공
