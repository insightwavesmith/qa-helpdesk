# TASK: 전체 코드 QA

## 목표
qa-helpdesk 프로젝트의 전체 코드를 검수한다. 버그, 타입 에러, 보안 이슈, 미완성 코드를 찾아서 수정한다.

## QA 체크리스트

### 1. 빌드 + 타입 체크
- [ ] `npx tsc --noEmit` 타입 에러 0개
- [ ] `npm run build` 성공
- [ ] `npm run lint` 경고/에러 확인

### 2. API 라우트 검수
- `src/app/api/` 하위 모든 라우트 확인
- [ ] 인증 체크 누락 없는지 (admin 전용 API에 인증 있는지)
- [ ] 에러 핸들링 (try-catch, 적절한 status code)
- [ ] SQL 인젝션 가능성 (Supabase RLS 의존이면 OK)
- [ ] request body 유효성 검증
- [ ] createClient vs createServiceClient 사용 적절한지

### 3. 컴포넌트 검수
- `src/components/` 하위 모든 컴포넌트
- [ ] "use client" 필요한 곳에 있는지
- [ ] import 누락 없는지
- [ ] key prop 누락 없는지 (map 렌더링)
- [ ] 사용되지 않는 import/변수 제거
- [ ] 접근성 기본 (aria-label, alt 등)

### 4. 페이지 검수
- `src/app/(main)/` 하위 모든 페이지
- [ ] 권한 체크 (admin 페이지에 admin 체크 있는지)
- [ ] 로딩/에러/빈 상태 처리
- [ ] 하드코딩된 더미 데이터 없는지
- [ ] 날짜/시간 포맷 일관성

### 5. 보안 검수
- [ ] 서비스 키가 클라이언트에 노출되지 않는지
- [ ] 환경변수 사용 적절한지
- [ ] CORS/인증 설정
- [ ] RLS 정책 점검 (Supabase)

### 6. 디자인 시스템 일관성
- [ ] Primary 색상: #F75D5D (hover: #E54949) 일관 사용
- [ ] Pretendard 폰트 로드 확인
- [ ] light mode only (dark mode 코드 없는지)
- [ ] 한글 UI 일관성

### 7. 성능/최적화
- [ ] 불필요한 re-render 가능성
- [ ] 이미지 최적화 (next/image 사용)
- [ ] 큰 번들 import 체크 (dynamic import 필요한지)

## 알려진 버그 (반드시 수정)
- src/app/api/admin/email/ai-write/route.ts에서 topic이 없을 때 제목이 "[BS CAMP] 블루프린트 - 블루프린트"처럼 카테고리명이 중복됨. firstSectionTitle이 섹션이 없으면 topicLabel(=카테고리명)로 fallback되기 때문. 섹션이 없으면 제목에서 카테고리명만 쓰도록 수정.

## 수정 방법
- 발견한 이슈를 즉시 수정
- 수정 불가능한 이슈는 `docs/code-qa-report.md`에 기록
- 수정 완료 후:
  1. npm run build
  2. git add -A && git commit -m "fix: 전체 코드 QA 수정" && git push
  3. openclaw gateway wake --text "Done: 전체 코드 QA 완료" --mode now

## 주의사항
- UI 변경 X (코드 품질만)
- 기존 동작 깨뜨리지 않기
- 확실하지 않으면 수정 대신 리포트에 기록
- 에이전트팀 사용하지 말 것. 단일 에이전트로 순차 진행 (메모리 절약)
