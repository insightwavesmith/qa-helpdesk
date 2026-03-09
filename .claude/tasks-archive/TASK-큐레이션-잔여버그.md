# TASK: 큐레이션 잔여 버그 수정

## 목표
큐레이션 뷰에서 토픽맵 메타데이터 노출, AI 요약 파싱 실패, 마크다운 미렌더링 3가지 버그 수정

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin)

## T1. 토픽맵에 메타데이터 키 노출
### 파일
`src/lib/topic-utils.ts`, `src/components/curation/topic-map-view.tsx`, `src/components/curation/curation-card.tsx`
### 현재 동작
토픽맵/카드에서 `guide_type:학습가이드`, `section_index:0` 같은 내부 메타데이터가 토픽으로 표시됨
### 기대 동작
`isMetadataKey()` 또는 `filterValidTopics()`가 이런 값들을 걸러서 사용자에게 노출하지 않음. 실제 DB에서 key_topics에 어떤 형태로 저장되어 있는지 확인 후 패턴 추가.
### 하지 말 것
하드코딩 블랙리스트 금지. 구조 패턴 기반으로 해결할 것.

## T2. AI 요약 JSON 배열 형태 미파싱
### 파일
`src/components/curation/curation-card.tsx` (`formatSummary` 함수)
### 현재 동작
`["타겟팅 제한은..."]` 같은 JSON 배열 형태의 ai_summary가 파싱되지 않고 대괄호/따옴표 포함한 채 그대로 표시됨. 현재 formatSummary에 JSON 배열 처리 로직이 있지만 1건이 여전히 미파싱.
### 기대 동작
JSON 배열 형태 ai_summary도 정상적으로 불릿 리스트로 표시됨. DB에서 해당 1건의 실제 값을 확인하고, formatSummary가 처리 못하는 엣지케이스를 수정.
### 하지 말 것
다른 정상 작동하는 요약 포맷을 깨지 않을 것.

## T3. 마크다운 bold 미렌더링
### 파일
`src/components/curation/curation-card.tsx` (`formatSummary`, `renderInlineMarkdown` 함수)
### 현재 동작
2/22 이전 카드들에서 `**bold**` 텍스트가 렌더링되지 않고 `**` 마커가 그대로 보임. 원인 추정: `formatSummary` 내 불릿 스트리핑 regex `[*\-•◦\d.]+`가 `**`를 불릿으로 오인해서 앞쪽 `**`만 제거 → `renderInlineMarkdown`이 짝 못 맞춤.
### 기대 동작
`**bold**` 형태의 인라인 마크다운이 `<strong>` 태그로 정상 렌더링됨. 불릿 스트리핑은 마크다운 볼드 구문을 훼손하지 않아야 함.
### 하지 말 것
react-markdown 같은 무거운 라이브러리 추가 금지. 기존 `renderInlineMarkdown` 활용.

## 의존성
T1, T2, T3 모두 독립. 순서 무관.

## 완료 후 QA
브라우저 QA로 토픽맵 뷰, 인박스 뷰 카드 요약 표시 확인
