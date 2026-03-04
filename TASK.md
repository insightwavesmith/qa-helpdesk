# TASK.md — T1 Border 수정 + Knowledge 페이지 버그 수정

## T1. TOC 카드 border 추가

### 목표
정보공유 글의 TOC 카드에 테두리(border) 추가

### 현재 동작
- TOC에 `bg-[#f9fafb] rounded-lg p-6 mb-8` 적용됨
- 배경색, 패딩, 라운딩은 있지만 **border가 없음** (0px)

### 기대 동작
- TOC 카드에 `border border-gray-200` 추가
- 배경 + 테두리로 카드 느낌 완성

### 하지 말 것
- TOC 이외의 리스트 스타일 변경 금지
- post-body.tsx의 기존 마크다운 렌더링 로직 변경 금지

---

## T3. Knowledge 페이지 차트 렌더링 버그

### 목표
/admin/knowledge 페이지의 "source_type별 Chunk 분포" 수평 막대 차트가 정상 렌더링되도록 수정

### 현재 동작
- Y축(source_type 라벨)과 X축(숫자)은 표시됨
- **막대(Bar) 자체가 시각적으로 안 보임**
- 데이터는 정상 (RPC로 확인됨)
- recharts `BarChart layout="vertical"` + `<Cell>` 조합의 silent render bug

### 기대 동작
- 각 source_type별 막대가 색상과 함께 정상 표시
- 기존 차트 라이브러리(recharts) 유지

### 하지 말 것
- recharts를 다른 차트 라이브러리로 교체 금지
- 다른 차트/컴포넌트 변경 금지
- knowledge_usage 테이블이나 데이터 수집 로직 변경 금지
