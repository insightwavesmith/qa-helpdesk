# TASK: 정보공유 페이지 테이블 CSS 개선

## 배경
정보공유(posts) 페이지의 마크다운 테이블이 읽기 불편함.
- 컬럼 너비가 글자량에 비례해서 들쭉날쭉
- 좌우 여백 부족, 답답함
- 표가 화면 꽉 채워서 가독성 저하
- 헤더와 데이터 행의 시각적 위계 구분 약함

## 레퍼런스 분석 결과
- **마켓핏랩**: 비교표를 이미지로 제작, HTML 테이블 미사용
- **리캐치**: 표 대신 다이어그램/인포그래픽 이미지 사용
- **공통점**: 깔끔한 여백, 명확한 시각적 위계, 중앙 정렬

## 수정 대상

### 파일: 정보공유 페이지의 마크다운 렌더러 CSS
MDXEditor 또는 마크다운 렌더링 컴포넌트의 테이블 스타일을 찾아서 수정.
- `src/` 내 `prose`, `markdown`, `mdx`, `table` 관련 CSS/컴포넌트 확인
- globals.css 또는 Tailwind prose 설정

### 수정 내용

1. **표 전체**: `max-width: 90%` + `margin: 0 auto` (중앙 정렬, 좌우 여백 확보)
2. **셀 padding**: `padding: 14px 20px` (현재보다 넉넉하게)
3. **헤더 행**: 배경색 `#f8f9fa`, `font-weight: 600`, `font-size: 13px`, `text-transform: uppercase`, `letter-spacing: 0.05em`, `color: #6b7280`
4. **데이터 행**: `font-size: 14px` 통일, `line-height: 1.6`
5. **데이터 행 첫 열**: `font-weight: 600` (구분 강조)
6. **짝수 행**: 배경색 `#fafbfc` (zebra stripe)
7. **테두리**: 외곽 `border: 1px solid #e5e7eb`, 내부는 하단 `border-bottom` 만
8. **모바일**: 기존 `overflow-x: auto` 유지

## 검증 기준
1. `npm run build` 성공
2. 정보공유 페이지에서 테이블이 있는 콘텐츠 확인 (case_study QA 글에 테이블 있음)
3. 데스크톱에서 표가 중앙 정렬 + 여백 확보
4. 모바일에서 가로 스크롤 정상 동작
