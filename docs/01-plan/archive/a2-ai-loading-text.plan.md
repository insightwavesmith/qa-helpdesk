# A2. 정보공유 AI 생성 로딩 문구 변경 — Plan

> 작성: 2026-03-02

## 1. 개요
- **기능**: AI 글 생성 중 표시되는 로딩 문구에서 모델명(Sonnet) 노출 제거
- **해결하려는 문제**: "Sonnet이 정보공유를 생성하고 있습니다..." 로딩 텍스트에 모델명이 직접 노출됨. 고객에게 구체적 AI 모델명을 보여줄 필요 없음.

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: 로딩 텍스트를 "AI가 글을 생성중입니다."로 변경
- FR-02: 코드 주석에서도 "Sonnet" 참조 제거 (코드 가독성)

### 비기능적 요구사항
- AI 생성 로직(API 호출, 프롬프트) 변경 금지
- 다른 로딩 UI 수정 금지
- 모델 변수명(`claude-sonnet-4-6`)은 백엔드 API에만 존재하며 사용자 노출 아님 → 변경 불필요

## 3. 범위

### 포함
- `src/components/curation/generate-preview-modal.tsx`
  - Line 46: 주석 `// Sonnet 호출` → `// AI 호출`
  - Line 108: `"Sonnet이 정보공유를 생성하고 있습니다..."` → `"AI가 글을 생성중입니다."`

### 제외
- `src/app/api/admin/curation/generate/route.ts` — 모델명은 백엔드 내부용, 사용자 비노출
- AI 생성 로직 / 프롬프트 변경
- 다른 컴포넌트의 로딩 UI (email ai-write-dialog 등)

## 4. 성공 기준
- [ ] 로딩 시 "AI가 글을 생성중입니다." 표시
- [ ] 사용자에게 "Sonnet", "Claude" 등 모델명 노출 없음
- [ ] AI 생성 기능 정상 동작 (기존 로직 변경 없음)
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `generate-preview-modal.tsx` 주석 수정 (line 46)
2. `generate-preview-modal.tsx` 로딩 텍스트 수정 (line 108)
3. 빌드 확인
