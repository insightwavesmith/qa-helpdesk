# TASK: 크론 수집 안정화 + 수강후기 탭 강화

## 목표
1. 데이터 수집 크론이 실패해도 아무도 모르는 구조를 고쳐서, 실패 시 즉시 알 수 있게 한다.
2. 수강후기 페이지를 강화해서 오프라인/졸업생/유튜브 후기를 체계적으로 쌓을 수 있게 한다.

## 빌드/테스트
- `npm run build` 성공 필수
- 테스트 계정: smith.kim@inwv.co / test1234! (관리자), student@test.com / test1234! (수강생)
- 프로덕션: https://bscamp.vercel.app

---

# Part A. 크론 수집 안정화

## A1. 크론 실행 이력 테이블 + 실패 알림

### 현재 동작
- 크론(collect-daily, collect-mixpanel, collect-benchmarks)이 실패하면 console.error만 찍힘
- 실행 이력이 어디에도 저장 안 됨
- 2/6~2/25 20일 공백이 발생했는데 아무도 몰랐음

### 기대 동작
1. `cron_runs` 테이블 생성:
   - id, cron_name (text), started_at (timestamptz), finished_at (timestamptz), status ('success'|'error'|'partial'), records_count (int), error_message (text)
2. 각 크론 시작 시 row INSERT, 완료 시 UPDATE (status, records_count, finished_at)
3. 에러 발생 시 status='error', error_message에 에러 내용 저장
4. 부분 실패 (일부 계정만 실패) 시 status='partial'
5. `/api/cron/health` 엔드포인트 추가:
   - 최근 24시간 내 collect-daily 실행 0건이면 → `{ healthy: false, missing: ["collect-daily"] }`
   - 관리자만 접근 가능 (requireAdmin)

### 하지 말 것
- 외부 알림 서비스 연동 (슬랙 webhook 등) — 나중에 별도로
- 기존 크론 로직 변경 — 이력 기록만 추가

## A2. collect-daily 재시도 로직

### 현재 동작
- Meta API 호출 실패 시 해당 계정 skip → 그날 데이터 영구 누락
- 재시도 없음

### 기대 동작
1. Meta API 호출 실패 시 최대 2회 재시도 (3초, 6초 대기)
2. 재시도 후에도 실패하면 cron_runs에 partial 기록
3. 429 (rate limit) 응답 시 Retry-After 헤더 존중

### 하지 말 것
- collect-mixpanel, collect-benchmarks는 건드리지 않음 (이미 재시도 있음)
- 전체 구조 변경 — 기존 try/catch 안에 재시도만 추가

## A3. collect-benchmarks 스케줄 수정

### 현재 동작
- vercel.json: `0 17 * * 1` (UTC 월요일 17시 = KST 화요일 02시)
- 코드 주석: "매주 월요일 KST 11:00" → 불일치

### 기대 동작
- 주석을 실제 스케줄에 맞게 수정: "매주 화요일 KST 02:00"
- 또는 Smith님 의도가 월요일이면 스케줄을 `0 2 * * 1` (UTC 월 02시 = KST 월 11시)로 변경

### 하지 말 것
- 벤치마크 수집 로직 변경

---

# Part B. 수강후기 탭 강화

## B1. 후기 작성폼에 기수/카테고리 추가

### 현재 동작
- 후기 작성 시 제목 + 본문 + 이미지(최대 3장)만 입력 가능
- 몇 기인지, 어떤 종류의 후기인지 구분 없음

### 기대 동작
1. reviews 테이블에 컬럼 추가:
   - `cohort` (text, nullable) — 기수 ("1기", "2기", ...)
   - `category` (text, default 'general') — 'general'(일반), 'graduation'(졸업), 'weekly'(주차별)
   - `rating` (int, nullable, 1~5) — 별점
2. 작성폼에 필드 추가:
   - 기수 선택 (드롭다운: 1기~5기, 직접입력)
   - 카테고리 선택 (일반후기 / 졸업후기 / 주차별 후기)
   - 별점 (1~5 별)
3. 기존 후기 데이터는 cohort=null, category='general'로 유지

### 하지 말 것
- 기존 후기 데이터 마이그레이션 — null 그대로
- 댓글/좋아요 기능 — Smith님 결정으로 불필요

## B2. 후기 목록 필터링 + 정렬

### 현재 동작
- 전체 후기가 시간순으로만 표시
- 필터 없음

### 기대 동작
1. 상단에 필터 UI:
   - 기수별 필터 (전체 / 1기 / 2기 / ...)
   - 카테고리별 필터 (전체 / 일반 / 졸업 / 주차별)
2. 정렬: 최신순 (기본) / 별점 높은순
3. 후기 카드에 기수 배지 + 별점 표시

### 하지 말 것
- 검색 기능 — 아직 불필요
- 무한 스크롤 — 기존 페이지네이션 유지

## B3. 유튜브 후기 영상 임베드

### 현재 동작
- 후기 = 텍스트 + 이미지만
- 유튜브 수료생 인터뷰 시리즈(Ep.1~9+)가 있지만 QA Helpdesk에서 볼 수 없음

### 기대 동작
1. 관리자가 후기에 유튜브 URL 추가 가능 (관리자 전용 기능)
   - reviews 테이블에 `youtube_url` (text, nullable) 컬럼 추가
   - 관리자 페이지에서 후기 등록 시 유튜브 URL 입력란
2. 후기 상세 페이지에서 유튜브 영상 임베드 표시
   - `<iframe>` 방식, 반응형 (16:9)
3. 후기 목록에서 영상 후기는 🎬 아이콘으로 구분
4. 관리자만 유튜브 후기 등록 가능 (수강생은 텍스트+이미지만)

### 하지 말 것
- 유튜브 API 연동 — URL만 저장하고 iframe 임베드
- 자동 크롤링 — 수동 등록

## B4. 관리자 후기 관리 페이지

### 현재 동작
- 관리자가 후기를 삭제만 할 수 있음
- 후기 등록/수정 불가

### 기대 동작
1. /admin/reviews 페이지 신규:
   - 전체 후기 목록 (작성자, 기수, 카테고리, 별점, 날짜)
   - 삭제 버튼 (기존)
   - 유튜브 후기 등록 버튼 → 제목, 유튜브 URL, 기수, 카테고리 입력
   - 후기 고정(pin) 기능 — 상단 고정 후기 지정
2. reviews 테이블에 `is_pinned` (boolean, default false) 컬럼
3. 고정된 후기는 목록 최상단에 표시

### 하지 말 것
- 수강생 후기 수정 기능 — 작성자 본인도 수정 불가 (삭제 후 재작성)
- 후기 승인 프로세스 — 바로 게시

---

## 참고 파일
- 크론: `src/app/api/cron/collect-daily/route.ts`, `collect-mixpanel/route.ts`, `collect-benchmarks/route.ts`
- 후기: `src/app/(main)/reviews/`, `src/actions/reviews.ts`
- 디자인: Primary #F75D5D, Pretendard 폰트, 라이트 모드
- 유튜브 채널: https://www.youtube.com/@1bpluschool
