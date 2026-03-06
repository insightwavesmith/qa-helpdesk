# TASK: 서비스 오픈 전 수정 + 용어 자동학습

## 목표
서비스 오픈(3/9) 전 UI 수정 + DB 버그 수정 + 용어 자동 임베딩

## 빌드/테스트
- npm run build 성공 필수
- 테스트 URL: https://bscamp.vercel.app
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

---

## T1. "자사몰사관학교 헬프데스크" 부제 텍스트 삭제

### 파일
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/signup/page.tsx`

### 현재 동작
- 로그인/회원가입 페이지에 "자사몰사관학교" 로고 아래 "자사몰사관학교 헬프데스크" 부제 텍스트가 표시됨

### 기대 동작
- "자사몰사관학교 헬프데스크" 부제 텍스트 완전 삭제
- 로고와 그 아래 "로그인"/"회원가입" 제목만 남기기
- 레이아웃/간격 자연스럽게 유지

### 하지 말 것
- 로고 이미지 건드리지 말 것
- 회원가입/로그인 로직 변경 금지

---

## T2. 정보공유 글 구분선(---) 2줄 → 1줄

### 파일
- `src/app/api/admin/curation/generate/route.ts` (시스템 프롬프트)
- 또는 정보공유 본문 렌더링 컴포넌트

### 현재 동작
- 정보공유 글 본문에서 섹션 사이 구분선이 2줄로 렌더링됨

### 기대 동작
- 구분선이 1줄만 표시
- 원인 파악: 프롬프트에서 --- 앞뒤 빈줄 문제인지, CSS에서 연속 hr 간격 문제인지 확인
- 가장 안전한 접근: CSS로 연속 hr 간격 조정, 또는 프롬프트에서 --- 사용 규칙 명확화

### 하지 말 것
- 기존 글 내용 변경 금지

---

## T3. Posts 생성 시 type 컬럼 누락 수정

### 파일
- `src/actions/posts.ts`

### 현재 동작
- `createPost()` 함수에서 contents 테이블에 insert할 때 `type` 컬럼을 포함하지 않음
- DB에 `contents_type_check` constraint가 있어서 type이 NULL이면 거부됨
- 에러: "new row for relation contents violates check constraint contents_type_check"

### 기대 동작
- `createPost()` insert에 `type` 필드 추가
- category 값을 type에 그대로 복사: `type: formData.category`
- DB 허용 값: 'education', 'case_study', 'webinar', 'notice', 'promo'
- 한 줄 추가로 해결: insert 객체에 `type: formData.category` 추가

### 하지 말 것
- DB 스키마/constraint 변경 금지
- 기존 posts 로직 변경 최소화

---

## T4. 용어 자동학습 — Brave 검색 결과를 knowledge_chunks에 저장

### 파일
- `src/lib/domain-intelligence.ts`
- `src/lib/knowledge.ts` (임베딩 유틸 사용)

### 현재 동작
- `domain-intelligence.ts`에서 Brave로 용어 검색 (예: "ROAS 뜻") → termDefinitions에 저장
- 답변 생성에 사용 후 **버려짐** — 다음에 같은 용어 나오면 또 Brave 호출

### 기대 동작
- Brave로 용어 검색 성공 시, 결과를 `knowledge_chunks` 테이블에 자동 저장:
  - `source_type`: "glossary"
  - `lecture_name`: "자동학습 용어집"
  - `content`: "{용어}: {정의}" 형식
  - `embedding`: 해당 텍스트의 임베딩 벡터 생성
- 저장 전 중복 체크: 같은 용어가 이미 glossary에 있으면 skip
- 다음에 같은 용어 질문 시 → RAG가 glossary chunk를 찾아서 Brave 호출 불필요
- glossary 저장은 비동기(fire-and-forget)로 — 답변 생성 속도에 영향 없어야 함

### 구현 힌트
- `knowledge.ts`에 이미 `searchChunks` + 임베딩 생성 로직 있음 (재사용)
- Supabase service client로 직접 insert
- 임베딩: 기존 프로젝트에서 쓰는 임베딩 함수 사용 (OpenAI text-embedding 등)

### 하지 말 것
- 기존 domain-intelligence 분석 로직 변경 금지
- 답변 생성 파이프라인 속도 저하 금지 (비동기 처리)
- knowledge_chunks 스키마 변경 금지

### 추가: 정보공유 생성에서도 glossary 참조
- `src/app/api/admin/curation/generate/route.ts` 129번 줄
- searchChunks의 sourceTypes에 "glossary" 추가: `["lecture", "blueprint", "marketing_theory", "glossary"]`

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
