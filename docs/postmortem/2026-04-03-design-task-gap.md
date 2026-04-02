# PM-007: Design → TASK 변환 시 누락 (2026-04-03)

## 메타데이터
- **심각도**: critical
- **카테고리**: process
- **상태**: resolved
- **관련 파일**: docs/02-design/features/brick-dashboard.design.md, docs/02-design/features/brick-dashboard-frontend.design.md

## 사고

### 상황
Brick Dashboard Design 문서가 2개 존재 (백엔드 308 TDD + 프론트엔드 145 TDD).
COO(모찌)가 CTO-2에게 프론트엔드 TASK만 전달하고 **백엔드 TASK를 생성하지 않음**.

### 결과
- CTO-2가 프론트엔드 145/145 TDD 완벽 구현
- 백엔드 API 38개 엔드포인트 0% 구현
- 프론트엔드에서 `/api/brick/*` 호출 시 전부 404
- "버튼이 안 눌린다" = UI는 있지만 서버가 없음

### 근본 원인
1. **TASK 분해 시 의존성 체크 안 함** — 프론트가 백엔드를 호출한다는 의존성을 COO가 확인 안 함
2. **Design 수 ≠ TASK 수 검증 없음** — Design 2개인데 TASK 1개만 생성
3. **연결 검증 단계 부재** — 145/145 TDD 통과 = mock 통과일 뿐, 실 API 연결 미확인

## 교훈

### 즉시 적용
- **Design 문서마다 TASK가 존재하는지 COO가 체크** (수동, Brick 전까지)
- **프론트 완료 시 실 API 연결 테스트 포함** (mock만 통과는 "완료" 아님)
- 통합 검증 Gate: 프론트 + 백엔드 둘 다 완료돼야 "사용성 테스트 가능" 판정

### 시스템 해결 (Brick)
- Design 블록 → Do 블록 자동 생성 (Design 수 = Do 블록 수 강제)
- 통합 테스트 Gate: 프론트 완료 + 백엔드 완료 → 실 연결 테스트 통과해야 체인 진행

## 관련 회고
- PM-004: 배포 후 런타임 검증 (배포 = 정상 착각 패턴 유사)

## 타임라인
- 04-02: CTO-2 프론트엔드 145/145 완료 보고
- 04-03 01:30: Smith님 "버튼이 안 눌린다" → COO 조사 → 백엔드 0% 발견
- 04-03 02:40: PM Design 2건 작성 → CTO-1 전달
- 04-03 07:46: CTO-1 백엔드 구현 착수
