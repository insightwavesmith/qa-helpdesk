# T6. 메인페이지 순서 변경 — Plan

## 1. 개요
- **기능**: 학생 홈(student-home.tsx) 레이아웃 순서 변경 + 검색바 제거 + 신뢰배너 추가
- **해결하려는 문제**: 검색바가 첫 화면을 차지하며 핵심 정보 접근이 느림. Meta Business Partner 신뢰 요소 부재.
- **참고 목업**: `docs/mockups/main-page.html`

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: 검색바("궁금한 것이 있으신가요?" + 검색 입력필드) 완전 제거
- FR-02: 신뢰배너 추가 (최상단)
  - 좌측: Meta Business Partners badge 이미지 (`/images/meta-partner/badge-light.png`, 높이 44px)
  - 우측: 제목 "Meta가 인증한 비즈니스 파트너" + 설명 "자사몰사관학교는 Meta Business Partner로서 검증된 메타 광고 교육을 제공합니다."
  - 스타일: `bg-[#f8faff] border border-[#e8edf5] rounded-xl p-5 flex items-center gap-5`
- FR-03: 순서 변경: **신뢰배너** → 광고성과 → 공지사항 → 최근 Q&A → 정보공유 최신글

### 비기능적 요구사항
- StudentAdSummary 컴포넌트 내부 변경 금지
- 공지/QA/정보공유 컴포넌트 변경 금지
- Sidebar.tsx 변경 금지

## 3. 범위

### 포함
- `student-home.tsx`에서 검색바 섹션 제거
- 신뢰배너 JSX 추가
- 섹션 순서 재배치

### 제외
- StudentAdSummary 내부 변경
- 공지/QA/정보공유 섹션 내부 변경
- Sidebar 변경
- 새 컴포넌트 파일 생성 (인라인으로 구현)

## 4. 성공 기준
- [ ] 검색바가 메인페이지에 표시되지 않는다
- [ ] 신뢰배너가 최상단에 표시된다 (badge 이미지 + 텍스트)
- [ ] 순서: 신뢰배너 → 광고성과 → 공지 → Q&A → 정보공유
- [ ] 목업(main-page.html)과 시각적으로 유사하다
- [ ] 모바일에서 배너가 세로 정렬(flex-col)로 표시된다
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `student-home.tsx` 검색바 섹션 (104~123줄) 제거
2. 신뢰배너 JSX 작성 (목업 참고)
3. 섹션 순서 재배치: 신뢰배너 → 광고성과 → 공지 → QA → 정보공유
4. 모바일 반응형 확인
5. 사용하지 않는 import 정리 (Search 아이콘 등)
6. 빌드 확인
