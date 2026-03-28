# 버그수정: 자동완성 방지 + 시크릿키 마스킹 계획서

## 기능 ID
bugfix-autocomplete-secret

## 배경
QA에서 발견된 버그 2건:
1. 관리자 멤버 상세 수정폼에서 Chrome이 text+password 필드 조합을 로그인 폼으로 오인하여 자동완성값 삽입
2. 온보딩 Step2의 시크릿키 input이 type="text"로 되어 있어 평문 노출

## 범위
- T1: `member-detail-modal.tsx` — 수정폼 input에 autoComplete="off" + name 속성 추가
- T2: `onboarding/page.tsx` — 시크릿키 input type="password" + eye 토글 구현

## 성공 기준
- [ ] 수정폼 내 모든 input에 autoComplete="off" + 고유 name
- [ ] 시크릿키 type="password" + Eye/EyeOff 토글
- [ ] npm run build 성공
- [ ] 기존 기능 동작 유지

## 제약
- settings-form.tsx 수정 금지 (이미 정상)
- 폼 제출 로직, API 호출 변경 금지
- DB 스키마 변경 금지
