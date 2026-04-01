# Plan: 답변검토 + 회원관리 미노출 문제 해결

> 작성: 2026-04-01 | CTO Team | L2

## 문제 정의

1. **답변검토 미노출**: Smith님이 QA 수정했는데 답변검토 메뉴가 안 보임
2. **회원관리에서 기윤서님 미노출**: 이메일 가입했는데 회원관리에서 안 보임

## 조사 결과 요약

### 문제 1: 답변검토 미노출
- **코드 상태**: 정상 (Sidebar.tsx, 페이지, 권한 체크 모두 정상)
- **원인 추정**: Smith님 계정 role이 admin/assistant가 아님
- **확인 필요**: profiles 테이블에서 Smith님 role 값

### 문제 2: 기윤서님 회원 미노출  
- **코드 상태**: 정상 (getMembers 쿼리, ensureProfile 로직 정상)
- **원인 추정**: ensureProfile 실패로 profiles 테이블 미생성
- **확인 필요**: profiles + Firebase 양쪽에서 기윤서님 계정 존재 여부

## 해결 방안

### Phase 1: 데이터 상태 확인
1. **Smith님 role 확인**: `SELECT role FROM profiles WHERE email = 'smith@...'`
2. **기윤서님 계정 확인**: 
   - DB: `SELECT * FROM profiles WHERE name LIKE '%기윤서%' OR email LIKE '%기윤서%'`
   - Firebase Console: 기윤서님 이메일로 검색

### Phase 2: 데이터 수정
1. **Smith님 role 수정** (필요 시): `UPDATE profiles SET role = 'admin' WHERE ...`
2. **기윤서님 계정 처리** (상황별):
   - Firebase에만 존재 → profiles 수동 INSERT 또는 Firebase 삭제 후 재가입
   - 양쪽 다 없음 → 재가입 안내
   - profiles에만 존재 → Firebase 계정 생성 또는 profiles 정리

## 완료 기준

- [ ] Smith님이 답변검토 메뉴 확인 가능
- [ ] 기윤서님이 회원관리에서 정상 노출
- [ ] 두 계정 모두 정상 로그인 가능
- [ ] 동일 문제 재발 방지책 수립

## 위험도

- **낮음**: 코드 변경 없이 데이터 수정만으로 해결 가능
- **주의사항**: profiles 테이블 직접 수정 시 데이터 백업 필요

## 예상 소요시간

- 데이터 확인: 10분
- 데이터 수정: 10분
- 검증: 10분
- 총 30분