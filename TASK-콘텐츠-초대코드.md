# TASK: 콘텐츠 관리 + 초대코드 수정

---

## T1. 콘텐츠 탭 sourceType 원복

### 이게 뭔지
관리자 콘텐츠 탭에 큐레이션 원본(blueprint, lecture, crawl, youtube)까지 전부 노출되고 있다. 큐레이션에서 "정보공유 생성"한 것(info_share)만 보여야 한다.

### 왜 필요한지
콘텐츠 탭은 발행 관리용이다. 크롤링 원본이 여기 보이면 관리자가 혼란스럽다.

### 파일
- `src/app/(main)/admin/content/page.tsx` (SWR 쿼리 부분)

### 검증 기준
- 콘텐츠 탭 기본 상태에서 source_type이 info_share인 항목만 표시
- 큐레이션 탭에는 기존대로 크롤링+커리큘럼 원본 표시

### 하지 말 것
- 큐레이션 탭 쿼리 건드리지 마라
- getContents() 함수 자체를 수정하지 마라

---

## T2. 썸네일 표시 + 삭제 기능

### 이게 뭔지
정보공유 콘텐츠의 기존 썸네일이 표시되지 않고, 썸네일 업로드 후 삭제가 불가능하다 (변경만 가능).

### 왜 필요한지
관리자가 콘텐츠 썸네일을 관리할 수 없다.

### 파일
- `src/components/content/detail-sidebar.tsx` (썸네일 업로드/표시/삭제 UI)

### 검증 기준
- 기존 썸네일이 있는 콘텐츠에서 썸네일 이미지가 정상 표시
- "삭제" 버튼 클릭 시 썸네일 제거 (DB thumbnail_url = null + Storage 파일 삭제)
- 삭제 후 "이미지 없음" 플레이스홀더 표시

### 하지 말 것
- Storage 버킷 설정 건드리지 마라 (RLS 정책 이미 추가됨)

---

## T3. 초대코드 consume_invite_code RPC 함수 생성

### 이게 뭔지
회원가입 시 초대코드 사용 처리(`used_count` 증가)가 안 된다. DB에 `consume_invite_code` RPC 함수가 없다.

### 왜 필요한지
가입은 되지만 사용 카운트가 0으로 유지되어, max_uses 제한이 작동하지 않는다.

### 파일
- DB: `consume_invite_code` PostgreSQL 함수 생성 필요
- `src/actions/invites.ts` (호출부 — 현재 코드는 정상, DB 함수만 없음)

### 검증 기준
- 가입 완료 후 invite_codes 테이블의 해당 코드 used_count가 1 증가
- max_uses에 도달하면 validate API에서 "사용 한도 초과" 반환
- expires_at이 지난 코드는 validate API에서 "만료됨" 반환
- 존재하지 않는 코드는 "유효하지 않은 초대코드" 반환

### 하지 말 것
- validate API 로직 건드리지 마라 (이미 정상 작동)
- 가입 플로우 건드리지 마라

### 참고: RPC 함수가 해야 할 것
- invite_codes 테이블에서 코드 조회 (case-insensitive, ilike)
- 만료/사용량 체크
- used_count += 1
- 결과를 jsonb로 반환 (error 키)
- FOR UPDATE 행잠금으로 원자적 처리

---

## 빌드/테스트
- `npx tsc --noEmit` 통과 필수
- `npm run build` 성공 필수
