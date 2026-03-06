# 서비스 오픈 전 수정 + 용어 자동학습 — Gap 분석

## Match Rate: 100%

## 일치 항목

### T1. 로그인/회원가입 부제 삭제 ✅
- **설계**: `<p>자사몰사관학교 헬프데스크</p>` 태그 삭제
- **구현**: login/page.tsx, signup/page.tsx 모두 해당 `<p>` 태그 삭제
- **100% 일치**

### T2. 정보공유 구분선 2줄→1줄 ✅
- **설계**: CSS `hr + h2` 선택자로 border-top 제거
- **구현**: post-body.css에 `.post-body hr + h2 { border-top: none; padding-top: 0; margin-top: 16px; }` 추가
- **원인**: `---` hr + h2의 border-top이 2줄로 보이는 문제 → CSS로 깔끔하게 해결
- **100% 일치**

### T3. createPost type 추가 ✅
- **설계**: insert 객체에 `type: formData.category` 1줄 추가
- **구현**: posts.ts createPost() insert에 `type: formData.category` 추가
- **100% 일치**

### T4. 용어 자동학습 ✅
- **설계**: saveGlossaryToKnowledge() 함수 + fire-and-forget 호출 + sourceTypes glossary 추가
- **구현**:
  1. domain-intelligence.ts에 `saveGlossaryToKnowledge()` 함수 추가 (중복 체크 + 임베딩 생성 + insert)
  2. termDefinitions 수집 후 `.catch()` 패턴으로 fire-and-forget 호출
  3. curation/generate/route.ts sourceTypes에 "glossary" 추가
- **100% 일치**

## 불일치 항목
없음

## 수정 필요
없음

## 빌드 검증
- `npm run build` ✅ 성공 (Compiled successfully, 69 pages generated)
- TypeScript 에러 0개
- Lint 에러 0개
