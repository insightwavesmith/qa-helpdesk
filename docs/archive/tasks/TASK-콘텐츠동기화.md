# TASK: 콘텐츠 category/source_type 동기화 — 관리자 생성 콘텐츠가 정상 분류되도록

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith.kim@inwv.co / test1234! (admin)

---

## T1. createContent()에서 category 자동 동기화

### 이게 뭔지
관리자 "새 콘텐츠" 모달에서 콘텐츠를 만들면 `type`만 저장되고 `category`가 비어있다. `type` 값을 `category`에도 자동으로 넣어준다.

### 왜 필요한지
수강생 정보공유 게시판(`/posts`)이 `category`로 필터링한다. category가 비어있으면 공지를 만들어도 공지 탭에 안 뜨고, 교육 목록에 섞이거나 아예 안 보인다.

### 파일
- `src/actions/contents.ts` — `createContent()` 함수
- `src/actions/contents.ts` — `updateContent()` 함수

### 검증 기준
- 관리자 모달에서 유형 "공지" 선택 → 직접 작성 → DB에 `type="notice"`, `category="notice"` 둘 다 저장됨
- 유형 "교육" → `type="education"`, `category="education"`
- 유형 "고객사례" → `type="case_study"`, `category="case_study"`
- updateContent에서 type 변경 시 category도 따라감

### 하지 말 것
- `category` 컬럼 삭제하거나 스키마 변경하지 마라 — 참조하는 곳 15개 파일
- `createPost()` 건드리지 마라 — 이미 정상 작동

---

## T2. 관리자 직접 생성 시 source_type = "manual" 설정

### 이게 뭔지
관리자 "새 콘텐츠" 모달에서 "직접 작성" 선택 시 `source_type`이 null로 저장된다. `"manual"`로 명시 설정한다.

### 왜 필요한지
콘텐츠 탭 기본 필터가 `info_share,manual`이다. source_type이 null이면 관리자가 직접 만든 콘텐츠가 콘텐츠 탭에서 안 보인다.

### 파일
- `src/components/content/new-content-modal.tsx` — `handleCreate()` → `handleCardClick("direct")` 경로

### 검증 기준
- "직접 작성"으로 생성 → DB에 `source_type="manual"` 저장
- URL/AI/파일 업로드 경로는 기존대로 각각 "url"/"ai"/"file" 유지
- 콘텐츠 탭 기본 필터(info_share,manual)에서 직접 작성 콘텐츠가 보임

### 하지 말 것
- 큐레이션 경로의 source_type 로직 건드리지 마라 (crawl/youtube/blueprint/lecture)
- 콘텐츠 탭 필터 Select 옵션 변경하지 마라

---

## T3. 기존 데이터 백필 — category 누락분 복구

### 이게 뭔지
기존 contents 중 `category`가 null인 행에 `type` 값을 복사한다.

### 왜 필요한지
이전에 관리자 모달로 생성된 콘텐츠들이 category 없이 저장됐다. 이걸 안 채우면 기존 콘텐츠가 게시판에서 계속 안 보인다.

### 파일
- `supabase/migrations/` — 새 마이그레이션 SQL 파일

### 검증 기준
- `SELECT count(*) FROM contents WHERE category IS NULL` → 0
- 기존 `category` 값이 있는 행은 건드리지 않음

### 하지 말 것
- category가 이미 있는 행을 덮어쓰지 마라
- contents 테이블 스키마(컬럼 추가/삭제) 변경하지 마라

---

## T4. /posts 게시판 카테고리 필터에 웨비나/홍보 추가

### 이게 뭔지
수강생 정보공유 게시판(`/posts`)의 기본 필터가 `["education", "case_study", "notice"]` 3개만 허용한다. `webinar`와 `promo`도 추가해서 5개 카테고리 전부 게시판에서 보이게 한다.

### 왜 필요한지
관리자가 웨비나/홍보 콘텐츠를 만들어도 게시판 필터에 안 잡혀서 수강생에게 안 보인다.

### 파일
- `src/actions/posts.ts` — `getPosts()` 기본 필터 (`query.in("category", [...])`)
- `src/app/(main)/posts/posts-redesign-client.tsx` — 카테고리 탭 UI

### 검증 기준
- `/posts` 페이지에서 웨비나/홍보 카테고리 탭이 보임
- `category="webinar"` 콘텐츠가 웨비나 탭에서 필터됨
- `category="promo"` 콘텐츠가 홍보 탭에서 필터됨
- 기존 교육/공지/고객사례 필터는 변경 없음

### 하지 말 것
- 게시판 레이아웃/디자인 변경하지 마라
- 카테고리 순서는 교육 → 공지 → 고객사례 → 웨비나 → 홍보 순서로
