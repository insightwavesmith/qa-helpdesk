# 서비스 오픈 전 수정 + 용어 자동학습 — 설계서

## 1. 데이터 모델
- T3: contents 테이블 `type` 컬럼 (기존) — 허용값: education, case_study, webinar, notice, promo
- T4: knowledge_chunks 테이블 (기존) — source_type="glossary", lecture_name="자동학습 용어집"

## 2. API 설계
- 변경 없음 (기존 server action + API route 내부 수정만)

## 3. 컴포넌트 구조

### T1: 부제 삭제
- login/page.tsx: `<p className="text-[#6B7280] font-medium">자사몰사관학교 헬프데스크</p>` 제거
- signup/page.tsx: 동일 `<p>` 태그 제거

### T2: 구분선 CSS
- post-body.css에 `hr + h2` 규칙 추가:
  ```css
  .post-body hr + h2 {
    border-top: none;
    padding-top: 0;
    margin-top: 16px;
  }
  ```

### T3: createPost type 추가
- posts.ts `createPost()` insert 객체에 `type: formData.category` 1줄 추가

### T4: 용어 자동학습
- domain-intelligence.ts에 `saveGlossaryToKnowledge()` 함수 추가:
  1. createServiceClient()로 Supabase 접속
  2. 중복 체크: knowledge_chunks에서 source_type="glossary", content LIKE "{용어}%" 검색
  3. 없으면 generateEmbedding()으로 벡터 생성 후 insert
  4. fire-and-forget: 호출 시 await 없이 .catch() 처리
- curation/generate/route.ts 129줄: sourceTypes에 "glossary" 추가

## 4. 에러 처리
- T4 저장 실패: console.warn 후 무시 (기존 동작 유지)
- T3 type 누락: category 값 그대로 복사 → 항상 유효

## 5. 구현 순서
- [x] T1: login/signup 부제 삭제 (2파일, 각 1줄)
- [x] T2: post-body.css hr+h2 규칙 추가 (1파일, 4줄)
- [x] T3: posts.ts type 추가 (1파일, 1줄)
- [x] T4a: domain-intelligence.ts glossary 저장 함수 추가
- [x] T4b: curation/generate sourceTypes에 glossary 추가
- [x] npm run build 확인
