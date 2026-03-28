# T4. 정보공유 글 CSS 개선 — Plan

## 1. 개요
- **기능**: 정보공유 글 상세 페이지의 마크다운 렌더링 CSS를 개선하여 가독성 향상
- **해결하려는 문제**: blockquote, 체크리스트, 숫자 강조, 인용 출처, 이미지 캡션 등의 시각적 구분이 약함
- **참고 목업**: `docs/mockups/readability-ab.html` (After 컬럼)

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **blockquote** — 좌측 빨간 바(#F75D5D, 4px) + 연한 배경(#fef2f2) + padding 적용
- FR-02: **체크리스트** (✅, ☐, ☑ 포함 항목) — 배경 박스 + 체크 아이콘 스타일 적용
- FR-03: **숫자 강조** — h2 앞 번호(## 1. ~)에 빨간색 번호 뱃지 스타일 적용
- FR-04: **인용문 출처** — blockquote 내 "—" 뒤 텍스트를 cite 스타일로 표시
- FR-05: **이미지 캡션** — 이미지 아래 볼드 텍스트를 figcaption 스타일로 표시

### 비기능적 요구사항
- 정보공유 상세 페이지에만 적용 (글로벌 CSS 오염 금지)
- 기존 디자인 시스템 유지: Pretendard, #F75D5D, #f8f9fa
- 마크다운 → HTML 변환 로직(post-body.tsx의 markdownToHtml) 변경 금지

## 3. 범위

### 포함
- `post-body.css`에 5가지 CSS 스타일 추가/수정
- 필요 시 `post-body.tsx`의 HTML 변환에서 CSS class 추가 (변환 로직 자체는 미변경)

### 제외
- markdownToHtml() 변환 로직 변경
- 다른 페이지 CSS 영향
- 마크다운 파서 교체

## 4. 성공 기준
- [ ] blockquote가 좌측 빨간 바 + 연한 배경으로 표시된다
- [ ] ✅/☐/☑ 포함 리스트가 체크리스트 스타일로 표시된다
- [ ] h2 앞 번호가 빨간색 뱃지 스타일로 표시된다
- [ ] blockquote 내 "—" 출처가 cite 스타일로 표시된다
- [ ] 이미지 아래 캡션이 작은 회색 텍스트로 표시된다
- [ ] 목업(readability-ab.html After)과 시각적으로 유사하다
- [ ] 다른 페이지의 CSS에 영향이 없다
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `post-body.css` 분석 — 기존 blockquote, h2, list, img 스타일 확인
2. blockquote CSS 수정 — 배경색 #fef2f2 → #fff5f5(목업 기준), border-left 4px #F75D5D
3. 체크리스트 CSS 추가 — ✅/☐/☑ 포함 li 선택자 or `.checklist` 클래스
4. h2 번호 뱃지 CSS — 목업의 SECTION 뱃지 + 번호 스타일 참고
5. cite 스타일 추가 — blockquote 내 "—" 출처 텍스트
6. figcaption 강화 — 이미지 캡션 스타일
7. 스코핑 확인 — `.post-body` 셀렉터 내에서만 적용되는지 검증
