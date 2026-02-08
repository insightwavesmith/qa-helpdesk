# TASK: 빠른 수정 5건 (Smith님 피드백)

## 배경
Smith님이 직접 학생/관리자 화면을 확인하고 피드백. 빠르게 수정 가능한 5건 먼저 처리.

---

### T1. 알림 벨 아이콘 제거
- **현상**: 우상단 알림 벨 아이콘이 있지만 클릭해도 아무것도 안 뜸. 기능 자체가 없음
- **수정**: 알림 벨 아이콘 + 버튼 완전 제거. 관리자/학생 모두
- **파일**: `src/components/layout/` 또는 `src/app/(main)/layout.tsx` 내 알림 관련 컴포넌트
- **완료 기준**: 헤더에 알림 벨 안 보임
- dependsOn: 없음

### T2. Q&A 탭 분기 처리
- **현상**: 질문 게시판에서 "내 질문", "답변완료", "답변대기" 탭 클릭해도 필터링 안 됨
- **파일**: `src/app/(main)/questions/questions-list-client.tsx`
- **수정**: 각 탭별 필터링 로직 구현
  - "전체": 모든 질문
  - "내 질문": 현재 로그인 사용자가 작성한 질문만 (author_id 필터)
  - "답변완료": status가 'answered' 또는 'closed'인 것
  - "답변대기": status가 'open'인 것
- **완료 기준**: 각 탭 클릭 시 해당 조건으로 필터링됨
- dependsOn: 없음

### T3. Q&A 카테고리 고객 친화 변경
- **현상**: 현재 카테고리가 수업 커리큘럼 기반 (콘텐츠 기획, 체험단, 메타 온보딩 등). 커머스 대표님들에게 어려운 용어
- **수정**: DB categories 테이블 업데이트. 기존 카테고리를 고객 친화적으로 변경
  - 기존 11개 → 새로운 카테고리:
    1. 메타 광고 기초 (광고관리자, 비즈니스설정 등)
    2. 광고 성과 개선 (ROAS, 전환율, 타겟팅 등)
    3. 광고 계정 문제 (계정정지, 정책위반, 결제 등)
    4. 픽셀·CAPI (설치, 이벤트, 전환추적)
    5. 자사몰 운영 (상품페이지, 결제, 배송 등)
    6. 크리에이티브 (소재제작, 카피, 이미지/영상)
    7. 기타
  - **주의**: 기존 질문에 연결된 category_id가 있을 수 있으니, 기존 카테고리는 UPDATE(이름 변경)로 처리. DELETE하면 FK 깨짐
  - Supabase service role key 사용
- **완료 기준**: 질문 작성 시 새 카테고리 표시, 기존 질문 깨지지 않음
- dependsOn: 없음

### T4. AI 작성 카테고리 안 뜨는 버그
- **현상**: 이메일 발송에서 "AI 작성" 클릭 → 카테고리 선택 드롭다운이 빈 목록
- **파일**: AI 작성 관련 컴포넌트 (이메일 에디터 내)
- **수정**: 콘텐츠 카테고리 목록을 DB에서 가져오거나, 하드코딩된 목록 사용
- **완료 기준**: AI 작성 클릭 시 카테고리 드롭다운에 항목 표시
- dependsOn: 없음

### T5. BS CAMP 로고 자간 수정
- **현상**: 상단 BS CAMP 로고에서 BS와 CAMP 사이 자간(letter-spacing)이 너무 넓음
- **파일**: 수강생 헤더 컴포넌트 (`src/components/layout/student-header.tsx` 또는 유사)
- **수정**: BS CAMP 로고 텍스트의 letter-spacing 줄이기. 또는 word-spacing 조절
- **완료 기준**: BS CAMP가 자연스러운 간격으로 표시
- dependsOn: 없음

---

## 우선순위
1. T1 (알림 벨 제거) — 가장 간단
2. T5 (로고 자간) — CSS만
3. T2 (Q&A 탭 분기) — 핵심 기능
4. T3 (카테고리 변경) — DB 작업 주의
5. T4 (AI 작성 카테고리) — 버그 수정

## 테스트 계정
- admin: smith@test.com / test1234!
- student: student@test.com / test1234!

## DB 접근
- Supabase URL: https://symvlrsmkjlztoopbnht.supabase.co
- Service role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bXZscnNta2psenRvb3Bibmh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTYwODYyMiwiZXhwIjoyMDgxMTg0NjIyfQ.FJLi7AiKw98JqUqPdkj2MBj9fDW6ZSsfgzUDVSFKc8Q
