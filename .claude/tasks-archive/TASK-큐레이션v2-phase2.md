# TASK: 큐레이션 v2 Phase 2 — 인박스 리뉴얼 + 토픽맵 + Soft Delete

> 기획서: `docs/proposals/curation-v2-spec.md`
> 레퍼런스 분석: `docs/proposals/curation-reference-analysis.md`
> 목업: https://mozzi-reports.vercel.app → 목업 탭 → #88
> Phase 0+1 Plan/Design: `docs/01-plan/features/curation-v2-p0p1.plan.md`, `docs/02-design/features/curation-v2-p0p1.design.md`
> 코드 리뷰 수정: `docs/01-plan/features/curation-v2-review-fixes.plan.md`

---

## 목표
큐레이션 탭의 외부 소스(블로그/YouTube/마케팅원론 등) 뷰를 리뉴얼하여, AI 핵심요약이 항상 보이고 토픽별 분류가 가능하며 삭제 복원이 되는 실용적 큐레이션 도구로 만든다.

## 빌드/테스트
- npm run build 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

## 현재 상태
- Phase 0+1 완료: `pipeline-sidebar.tsx` (섹션 분리), `curriculum-view.tsx` (시퀀스 뷰), `curation.ts` (백필 함수), 코드 리뷰 수정 (`74c1268`)
- 현재 큐레이션 뷰: `curation-tab.tsx` (250줄) + `curation-card.tsx` (146줄)
  - AI 요약이 **접혀있음** (클릭해야 펼침) → 안 읽게 됨
  - 토픽 분류 없이 날짜 그룹만 (오늘/어제/이번주/그 이전)
  - 삭제 = hard dismiss (복원 불가)
  - 생성물과의 연결 표시 없음
- DB `contents` 테이블: `curation_status` enum = `new | selected | dismissed | published`
- `key_topics`: string[] — 이미 존재하지만 토픽 그룹핑에 활용 안 됨
- 서버 액션: `curation.ts` (512줄) — getCurationContents, batchUpdateCurationStatus, getPipelineStats 등

---

## T1. 카드 v2 — AI 요약 항상 펼침 + 생성물 연결

### 이게 뭔지
기존 `curation-card.tsx`를 리뉴얼하여 AI 핵심요약이 접히지 않고 항상 보이게 하고, 해당 소스로 생성된 정보공유 글이 있으면 연결 링크를 표시한다.

### 왜 필요한지
현재 요약이 접혀있어서 대부분 안 읽는다. 요약이 카드의 핵심 가치인데 숨겨놓으면 의미 없다. Smith님: "크롤링 하더라도 핵심요약을 볼 수 있어야 해". 또한 이미 정보공유로 만든 소스인지 한눈에 알 수 없다.

### 파일
- `src/components/curation/curation-card.tsx` — 리뉴얼

### 현재 동작
- AI 요약 2줄 말줄임 + "더보기" 버튼 (기본 접힘)
- `keyTopics` 뱃지만 하단에 표시
- 생성물(정보공유) 연결 없음

### 기대 동작
- AI 핵심요약 **항상 펼침**: 불릿 형태(•)로 3줄 이내 표시. 접기/펼치기 버튼 제거
- 요약이 null이면 "AI 분석 대기중" 안내 (기존 "요약 없음" 대신)
- 생성물 연결: 해당 소스로 만든 정보공유가 있으면 카드 하단에 `↳ "글 제목" 발행됨` 링크 표시
  - 데이터: `contents` 테이블에서 `source_ref`로 역추적 (info_share 타입 콘텐츠가 해당 소스 id를 source_ref로 가짐)
- 소스 출처 표시: 도메인명 + 수집일 (예: `searchengineland.com · 3/6`)
- 액션 버튼: `[원문 보기]` `[스킵]` `[정보공유 생성]` — 카드 하단 인라인

### 하지 말 것
- `curation-tab.tsx` 구조 변경 (T2에서 함)
- DB 스키마 변경 (T3에서 함)
- 생성물 연결을 위한 별도 API 추가 — 기존 `getCurationContents` 응답에 JOIN으로 포함

---

## T2. 큐레이션 뷰 리뉴얼 — 인박스 + 토픽맵 서브뷰

### 이게 뭔지
기존 `curation-tab.tsx`를 래퍼 컴포넌트(`curation-view.tsx`)로 교체하고, 인박스 뷰(기본)와 토픽맵 뷰를 토글로 전환할 수 있게 한다.

### 왜 필요한지
현재는 날짜별 그룹 하나뿐이라 "어떤 주제가 풍부하고 빈약한지" 파악이 불가능하다. Smith님: "분류마다 마인드맵처럼 볼 수 있어야 해". 토픽맵을 추가하면 주제별 소스 분포를 한눈에 파악하고 빈 주제에 대한 수집 계획을 세울 수 있다.

### 파일
- `src/components/curation/curation-view.tsx` — 신규 (인박스+토픽맵 래퍼)
- `src/components/curation/topic-map-view.tsx` — 신규 (토픽 트리 뷰)
- `src/components/curation/curation-tab.tsx` — 수정 (인박스 뷰로 역할 축소)
- `src/app/(main)/admin/content/page.tsx` — 수정 (CurationView 사용)

### 현재 동작
- `curation-tab.tsx`가 필터 + 날짜 그룹 + 카드 리스트 전부 담당
- 뷰 전환 없음

### 기대 동작
- **뷰 토글 버튼**: `[📋 인박스]` `[🗂️ 토픽맵]` — 상단 필터 바 옆
- **상태 필터 탭**: `[전체 48] [신규 12] [생성됨 8] [발행됨 18] [스킵 3]` — curation_status 기반
- **인박스 뷰** (기본):
  - 기존 날짜 그룹 유지 + 중요도순 정렬 옵션 추가
  - 카드 v2 (T1) 사용
- **토픽맵 뷰**:
  - `key_topics` 기반 2-depth 트리 (대주제 > 콘텐츠)
  - 같은 토픽 가진 콘텐츠 그룹핑 (클라이언트사이드)
  - 토픽 헤더: 토픽명 + 콘텐츠 수 + 접기/펼치기
  - 토픽 내부: 카드 v2 리스트
  - 토픽 없는 콘텐츠: "미분류" 그룹으로
  - 토픽 그룹핑 로직: `key_topics[0]` 기준 1차 그룹 (MVP). 다수 토픽 가진 콘텐츠는 첫 번째 토픽 기준
- **벌크 바** (기존 유지+개선):
  - 선택 시 하단 고정 바: `✓ 2개 선택됨 [✕ 일괄 스킵] [✨ 정보공유 생성]`
  - 최대 4개 선택 제한 유지

### 하지 말 것
- 토픽 자동 분류 AI 호출 (기존 `key_topics` 데이터 그대로 사용)
- 드래그 앤 드롭 (향후)
- 칸반 뷰 (삭제 확정 — 정보공유 탭과 역할 중복)

---

## T3. Soft Delete + 삭제 콘텐츠 복원

### 이게 뭔지
현재 "스킵"만 있고 삭제/복원이 없다. `deleted_at` 컬럼 추가로 soft delete를 구현하고, 삭제된 콘텐츠를 복원할 수 있게 한다. 30일 후 자동 영구 삭제 cron도 추가한다.

### 왜 필요한지
실수로 중요한 소스를 날려버리면 복구가 안 된다. 큐레이션 기획서에서 확정된 사항: "soft delete + 복원 + 30일 자동 정리".

### 파일
- DB: `contents` 테이블에 `deleted_at timestamptz` 컬럼 추가 (Supabase Management API 또는 마이그레이션 SQL)
- `src/types/content.ts` — `deleted_at` 필드 추가
- `src/actions/curation.ts` — `softDeleteContents()`, `restoreContents()` 서버 액션 추가
- `src/components/curation/deleted-section.tsx` — 신규 (삭제된 콘텐츠 섹션)
- `src/app/api/cron/cleanup-deleted/route.ts` — 신규 (30일 자동 영구 삭제)
- `src/components/curation/curation-view.tsx` — 하단에 삭제 섹션 통합

### 현재 동작
- "스킵" = `curation_status`를 `dismissed`로 변경. 복원 불가.
- 삭제 기능 없음

### 기대 동작
- **삭제**: 체크박스 선택 → "삭제" 버튼 → `deleted_at = now()` 설정
  - 기존 `getCurationContents`에서 `deleted_at IS NULL` 조건 추가 (삭제된 건 기본 숨김)
- **삭제 섹션**: 큐레이션 뷰 하단에 접힌 섹션
  - `🗑️ 삭제된 콘텐츠 (3건)` — 클릭 시 펼침
  - 개별 복원 버튼 + 전체 복원 버튼
  - 복원 = `deleted_at = null`로 되돌림
- **자동 영구 삭제 Cron**: `/api/cron/cleanup-deleted`
  - `DELETE FROM contents WHERE deleted_at < now() - interval '30 days'`
  - Vercel Cron: 매일 04:00 KST (1회)
  - `CRON_SECRET` 인증
- **RLS 주의**: 서비스 클라이언트로 삭제 실행 (admin 확인 후)

### 하지 말 것
- `curation_status` enum 수정 — `deleted_at`으로 분리 관리 (status와 독립)
- 삭제 시 연관 knowledge_chunks 처리 (별도 태스크)
- cascade delete (soft delete이므로 관계 유지)

---

## 구현 순서

T1 (카드 v2) → T2 (뷰 리뉴얼) → T3 (Soft Delete)

T1이 T2의 카드 컴포넌트이므로 먼저. T3는 독립적이지만 T2의 curation-view.tsx에 통합되므로 마지막.

## 디자인 시스템

bscamp 기존 디자인 그대로:
- Primary: `#F75D5D` / BG: `#f8f9fc` / Card: `#fff` / Border: `#e2e8f0`
- Text: `#1a1a1a` / Muted: `#64748b` / Font: Pretendard / Radius: `0.75rem`
- 사이드바 Active: `bg-#fee2e2 text-#F75D5D`
- 토스트: sonner (기존 패턴)
- 아이콘: lucide-react (기존 패턴)

## 리뷰 결과
(에이전트팀 리뷰 후 기록)
