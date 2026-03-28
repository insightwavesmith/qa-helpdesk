# T3. 회원 삭제 조건 수정 — Plan

## 1. 개요
- **기능**: inactive 상태 회원도 삭제 가능하도록 조건 수정
- **해결하려는 문제**: `canDelete` 조건에 "inactive"가 빠져있어 비활성 회원을 삭제할 수 없음

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: inactive 역할의 회원에게도 삭제 버튼이 활성화되어야 한다
- FR-02: 기존 lead, member 역할의 삭제 가능 조건은 유지

### 비기능적 요구사항
- 삭제 로직(handleDelete) 자체는 변경하지 않음
- 1줄 변경으로 완료 가능한 최소 변경

## 3. 범위

### 포함
- `member-detail-modal.tsx` 239줄의 `canDelete` 조건에 `"inactive"` 추가

### 제외
- handleDelete 로직 변경
- 다른 역할(admin, student, alumni 등)의 삭제 조건 변경
- 회원 목록 UI 변경

## 4. 성공 기준
- [ ] inactive 상태 회원의 상세 모달에서 삭제 버튼이 활성화된다
- [ ] lead, member 역할의 삭제 가능 여부는 기존과 동일하다
- [ ] admin, student 등 다른 역할은 삭제 불가 상태 유지
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `member-detail-modal.tsx` 239줄 수정
2. 빌드 확인
