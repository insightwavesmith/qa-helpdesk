# TASK: UI/UX 개선 + 버그 수정 (7항목)

## 목표
메인페이지 레이아웃 변경, 정보공유 글 가독성 CSS 개선, 총가치각도기 버그 수정, 회원 관리 버그 수정을 한 번에 처리한다.

## 빌드/테스트
- `npm run build` 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)
- 확인 URL: https://bscamp.vercel.app

---

## T1. SummaryCards 하드코딩 데이터 제거

### 현재 동작
- `src/components/protractor/SummaryCards.tsx` 17~20줄에 더미 데이터가 하드코딩됨
  - 총 광고비: 834,500 / 총 클릭: 4,280 / 총 구매: 132 / ROAS: 2.85
- DB(daily_ad_insights)를 삭제해도 이 수치가 계속 표시됨

### 기대 동작
- SummaryCards가 실제 DB 데이터(daily_ad_insights)를 받아서 표시
- 데이터가 없으면 "데이터 없음" 또는 컴포넌트 미표시
- PerformanceTrendChart.tsx에도 하드코딩된 차트 데이터가 있으면 동일하게 처리

### 하지 말 것
- daily_ad_insights 테이블 구조 변경 금지
- 새 API 엔드포인트 만들지 말 것 — 기존 protractor API에서 데이터 전달

---

## T2. 총가치각도기 좌우 여백 수정

### 현재 동작
- 총가치각도기(/protractor) 페이지가 좌우 여백 없이 풀 너비로 표시됨
- 다른 페이지(대시보드 등)는 `max-w-6xl mx-auto px-4`로 제한됨

### 기대 동작
- 총가치각도기도 다른 페이지와 동일한 max-width + padding 적용
- 기준: `src/app/(main)/dashboard/student-home.tsx` → `max-w-6xl mx-auto px-4`

### 하지 말 것
- 다른 페이지의 여백을 변경하지 말 것

---

## T3. 회원 삭제 조건 수정

### 현재 동작
- `src/app/(main)/admin/members/member-detail-modal.tsx` 239줄
- `canDelete = profile.role === "lead" || profile.role === "member"`
- inactive/student 등은 삭제 버튼 비활성화

### 기대 동작
- inactive 상태 회원도 삭제 가능
- `canDelete = profile.role === "lead" || profile.role === "member" || profile.role === "inactive"`

### 하지 말 것
- 삭제 로직(handleDelete) 자체를 변경하지 말 것

---

## T4. 정보공유 글 CSS 개선

### 현재 동작
- 정보공유 글 상세 페이지에서 마크다운이 기본 스타일로 렌더링됨
- blockquote, 체크리스트, 숫자 강조 등 시각적 구분이 약함

### 기대 동작
- **blockquote**: 좌측 빨간 바(#F75D5D, 4px) + 연한 배경(#fef2f2) + padding
- **체크리스트** (✅, ☐, ☑): 배경 박스 + 체크 아이콘 스타일
- **숫자 강조**: h2 앞 번호(## 1. ~)에 빨간색 번호 스타일
- **인용문 출처**: blockquote 내 "—" 뒤 텍스트를 cite 스타일로
- **이미지 캡션**: 이미지 아래 볼드 텍스트를 캡션 스타일로

### 참고
- 목업 파일: docs/mockups/readability-ab.html (After 컬럼 참고)
- 정보공유 글 렌더링 위치: 마크다운 → HTML 변환 후 표시되는 CSS
- bscamp 기존 디자인 시스템 유지: Pretendard, #F75D5D, #f8f9fa

### 하지 말 것
- 마크다운 → HTML 변환 로직 변경 금지
- 다른 페이지의 글로벌 CSS에 영향 주지 말 것 — 정보공유 상세 페이지에만 적용

---

## T5. 정보공유 AI 프롬프트 개선

### 현재 동작
- `src/actions/contents.ts` 508~531줄 CONTENT_BASE_STYLE
- `src/actions/contents.ts` 533~548줄 education 타입 프롬프트
- 도입부 → 넘버링 h2 → 테이블 → blockquote → 3줄 요약 구조

### 기대 동작
- education 프롬프트에 추가:
  1. **상단 3줄 요약 박스**: 글 시작 전 `> **📌 핵심 요약**` blockquote로 3줄 요약
  2. **핵심 숫자 블록**: 섹션 시작 시 `- **6억 건** — 설명` 형태로 핵심 수치 먼저
  3. **체크리스트**: 실무 점검 항목은 `- ✅ ~하고 있나요?` 형태
  4. **섹션 구분**: `---` 구분선을 각 h2 앞에 필수
- 기존 구조(넘버링 h2, blockquote 하이라이트, 볼드 팁) 유지

### 하지 말 것
- CONTENT_BASE_STYLE의 메타 광고 지식 섹션 변경 금지
- 다른 타입(case_study, webinar 등) 프롬프트 변경 금지
- RAG 검색 로직(knowledge.ts) 변경 금지

---

## T6. 메인페이지 순서 변경

### 현재 동작
- `src/app/(main)/dashboard/student-home.tsx`
- 순서: 검색바 → 광고성과 → 공지사항 → 최근 Q&A → 정보공유 최신글

### 기대 동작
- 순서: **신뢰배너(새로 추가)** → 광고성과 → 공지사항 → 최근 Q&A → 정보공유 최신글
- 검색바("무엇이든 물어보세요") 제거
- 신뢰배너 구성:
  - 좌측: Meta Business Partners badge 이미지 (`/images/meta-partner/badge-light.png`, 높이 44px)
  - 우측: 제목 "Meta가 인증한 비즈니스 파트너" + 설명 "자사몰사관학교는 Meta Business Partner로서 검증된 메타 광고 교육을 제공합니다."
  - 스타일: `bg-[#f8faff] border border-[#e8edf5] rounded-xl p-5 flex items-center gap-5`

### 참고
- 목업 파일: docs/mockups/main-page.html
- 로고 파일: `public/images/meta-partner/badge-light.png` (이미 존재)

### 하지 말 것
- 광고성과 위젯(StudentAdSummary) 컴포넌트 내부 변경 금지
- 공지/QA/정보공유 컴포넌트 변경 금지
- 사이드바(Sidebar.tsx) 변경 금지

---

## T7. 프로필 카드 적용 (이메일 + 정보공유)

### 현재 동작
- 이메일 템플릿: `src/lib/email-default-template.ts` 37줄 — 80px 프로필 사진 + 이름/역할/설명
- 정보공유 글 하단: 프로필 카드 없음

### 기대 동작
- 이메일 프로필 카드:
  - 사진(80px 원형) + "스미스 / 자사몰사관학교 코치"
  - 설명: "Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+"
  - 하단: Meta Business Partners 인라인 로고 (`/images/meta-partner/inline-positive.png`, 높이 36px)
- 정보공유 글 상세 하단:
  - 동일한 프로필 카드 컴포넌트로 적용
  - border-top 구분선 + padding

### 참고
- 목업 파일: docs/mockups/profile-card.html
- 이미지: `public/images/meta-partner/inline-positive.png` (이미 존재)
- 프로필 사진: `public/images/meta-partner/profile-smith.png` (이미 존재)

### 하지 말 것
- 이메일 HTML 구조를 대폭 변경하지 말 것 — 프로필 영역만 수정
- 자격증 배지 넣지 말 것 — 인라인 로고만

---

## 리뷰 결과
(에이전트팀 리뷰 후 기록)

---

## T8. 관리자 후기 등록 폼 필드 누락

### 현재 동작
- `/admin/reviews` 후기 등록 폼에 제목 + 유튜브 URL + 기수 + 카테고리만 있음
- 별점(rating) 필드와 내용(content) 필드가 없음
- 관리자가 텍스트 후기를 직접 작성할 수 없음

### 기대 동작
- 후기 등록 폼에 **별점(1~5)** 선택 UI 추가 (별 아이콘 또는 드롭다운)
- **내용** 텍스트 영역 추가 (textarea, 최소 3줄)
- 유튜브 URL은 선택 입력, 내용은 필수 입력
- DB reviews 테이블에 이미 rating, content 컬럼 있음 — 폼에서 전달만 추가

### 하지 말 것
- reviews 테이블 스키마 변경 금지
- 수강생 후기 작성 폼 변경 금지

---

## T9. 관리자 후기 목록 필터 UI 누락

### 현재 동작
- `/admin/reviews` 목록에 필터 UI 없음
- 수강생 페이지에는 기수/카테고리 필터가 있음

### 기대 동작
- 관리자 후기 목록에 **기수 필터** (드롭다운) + **카테고리 필터** (드롭다운) 추가
- 수강생 페이지의 필터 UI와 동일한 스타일
- 필터 선택 시 목록 즉시 갱신 (클라이언트 필터링 OK)

### 하지 말 것
- 수강생 후기 페이지 변경 금지
- API 엔드포인트 추가 금지 — 기존 데이터에서 클라이언트 필터링

---

## T10. 이메일 프로필 카드 Meta 로고 누락

### 현재 동작
- `src/lib/email-default-template.ts` 이메일 프로필 카드에 "메타파트너 / 메타공식 프로페셔널" 텍스트만 표시
- Meta Business Partners 인라인 로고 이미지가 없음

### 기대 동작
- 프로필 카드 하단에 Meta Business Partners 인라인 로고 이미지 표시
- 이미지 URL: `https://bscamp.vercel.app/images/meta-partner/inline-positive.png` (절대 URL, 이메일이라 상대경로 불가)
- 높이 36px
- 텍스트는 "Meta가 인증한 비즈니스 파트너" (Smith님 확정 문구)
- "공식" 표현 사용 금지 (Meta 가이드라인)

### 하지 말 것
- 이메일 HTML 구조 대폭 변경 금지 — 프로필 카드 로고 영역만 수정
- 자격증 배지 넣지 말 것
