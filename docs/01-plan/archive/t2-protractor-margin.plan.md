# T2. 총가치각도기 좌우 여백 수정 — Plan

## 1. 개요
- **기능**: 총가치각도기(/protractor) 페이지에 다른 페이지와 동일한 max-width + padding 적용
- **해결하려는 문제**: protractor 페이지가 좌우 여백 없이 풀 너비로 표시되어 다른 페이지와 레이아웃이 불일치

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: protractor 페이지에 `max-w-6xl mx-auto px-4` 적용하여 다른 페이지(student-home 등)와 동일한 여백 확보
- FR-02: 내부 컴포넌트(SummaryCards, DiagnosticPanel 등)의 레이아웃은 기존대로 유지

### 비기능적 요구사항
- 다른 페이지의 여백을 변경하지 말 것
- 모바일/태블릿에서도 적절한 여백 유지

## 3. 범위

### 포함
- protractor 관련 페이지/레이아웃에 max-width + padding 래퍼 추가

### 제외
- 다른 페이지 레이아웃 변경
- protractor 내부 컴포넌트 스타일 변경

## 4. 성공 기준
- [ ] protractor 페이지 좌우 여백이 student-home.tsx와 동일하다 (`max-w-6xl mx-auto px-4`)
- [ ] 내부 콘텐츠 레이아웃이 깨지지 않는다
- [ ] 다른 페이지 여백에 영향이 없다
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `student-home.tsx`의 최상위 wrapper 클래스 확인 → `max-w-6xl mx-auto px-4 py-8`
2. protractor의 real-dashboard.tsx, sample-dashboard.tsx에 동일 wrapper 적용 (또는 protractor layout.tsx에 적용)
3. 기존 sample-dashboard의 `-m-6 mb-0` 같은 offset 스타일 충돌 여부 확인
4. 빌드 및 시각 확인
