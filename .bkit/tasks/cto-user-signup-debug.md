# TASK: 회원가입 후 수강생 관리 미노출 버그 조사

## 증상
- bscamp.app에서 회원가입 완료해도 관리자 페이지 "수강생 관리"에서 해당 유저가 뜨지 않음

## 조사 항목

### 1. 수강생 관리 쿼리 확인
- 관리자 페이지 수강생 목록 API 경로 찾기 (`src/app/api/admin/` 또는 `src/app/api/students/`)
- 어떤 조건으로 유저를 필터링하는지 (role, status, enrolled 등)

### 2. 회원가입 플로우 확인
- 회원가입 시 DB에 뭘 쓰는지 (`users` 테이블 또는 `students` 테이블)
- 관리자 쿼리가 기대하는 컬럼/값과 회원가입이 실제로 쓰는 값 불일치 여부

### 3. Cloud SQL 스키마 확인
- `users`, `students`, `enrollments` 테이블 구조
- 회원가입 후 실제 DB에 row가 생기는지

## 결과물
- 원인 파악 후 TASK 파일에 수정 방법 기재
- `/Users/smith/projects/bscamp/.bkit/tasks/cto-user-signup-fix.md` 로 저장

## 완료 기준
- 원인 명확히 특정
- 수정 방법 구체적으로 기술 (파일 경로 + 변경 내용)

## COO 의견
COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
