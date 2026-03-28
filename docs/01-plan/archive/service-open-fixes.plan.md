# 서비스 오픈 전 수정 + 용어 자동학습 — Plan

## 개요
서비스 오픈(3/9) 전 UI 수정 + DB 버그 수정 + 용어 자동 임베딩

## 범위

### T1. 로그인/회원가입 부제 삭제
- **파일**: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`
- **변경**: "자사몰사관학교 헬프데스크" 부제 `<p>` 태그 삭제
- **영향**: UI만 변경, 로직 무관

### T2. 정보공유 구분선 2줄→1줄
- **파일**: `src/components/posts/post-body.css`
- **원인 분석**: h2에 `border-top: 1px solid #eeeeee`가 있고, AI가 생성한 마크다운에서 `---` 뒤에 `## 제목`이 나옴 → hr 1줄 + h2 border-top 1줄 = 2줄 렌더링
- **변경**: CSS `hr + h2` 선택자로 h2의 border-top 제거
- **영향**: 기존 글 렌더링만 개선, 데이터 무변경

### T3. Posts 생성 시 type 누락 수정
- **파일**: `src/actions/posts.ts`
- **변경**: `createPost()` insert 객체에 `type: formData.category` 추가
- **영향**: DB constraint 오류 해결

### T4. 용어 자동학습 — Brave → knowledge_chunks glossary
- **파일**: `src/lib/domain-intelligence.ts`, `src/app/api/admin/curation/generate/route.ts`
- **변경**:
  1. Brave 용어 검색 성공 시 knowledge_chunks에 glossary로 비동기 저장
  2. 중복 체크 (같은 용어 glossary 존재 시 skip)
  3. curation generate의 searchChunks sourceTypes에 "glossary" 추가
- **영향**: 답변 파이프라인 속도 무영향 (fire-and-forget)

## 성공 기준
- [ ] npm run build 성공
- [ ] T1: 부제 텍스트 없음
- [ ] T2: 구분선 1줄만 표시
- [ ] T3: 정보공유 생성 시 type constraint 오류 없음
- [ ] T4: Brave 용어 검색 시 glossary 자동 저장

## 위험 요소
- T4: 임베딩 API 호출 추가 → fire-and-forget + try-catch로 기존 파이프라인 보호
- 기존 기능 깨짐 없음 확인 필수
