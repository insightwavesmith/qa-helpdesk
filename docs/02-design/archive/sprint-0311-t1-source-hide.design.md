# T1: QA 답변 소스 참조 숨기기 — 설계서

## 1. 데이터 모델
변경 없음. `answers.source_refs` JSONB 컬럼 그대로 유지.

## 2. API 설계
변경 없음. API 응답에 source_refs 포함은 유지 (관리자용).

## 3. 컴포넌트 구조
- `questions/[id]/page.tsx`: SourceReferences 렌더링 조건에 `isAdmin` 추가
- SourceReferences 컴포넌트 자체는 수정 없음
- AnswerCard.tsx: 미사용 컴포넌트이므로 수정 불필요

## 4. 에러 처리
- isAdmin이 false로 fallback되는 catch 블록 이미 존재 → 안전

## 5. 구현 순서
- [x] Plan 작성
- [x] Design 작성
- [ ] page.tsx 244줄 조건 수정
- [ ] 빌드 검증
