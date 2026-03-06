# 큐레이션 v2 Phase 0+1 코드 리뷰

> **리뷰 일시**: 2026-03-06
> **리뷰 대상**: Phase 0 (데이터 백필) + Phase 1 (사이드바 + CurriculumView + 듀얼모드)
> **참조 문서**: `docs/proposals/curation-v2-spec.md`, `docs/01-plan/features/curation-v2-p0p1.plan.md`, `docs/02-design/features/curation-v2-p0p1.design.md`

---

## 1. 스펙 일치도 (Gap 분석)

### Match Rate: 82%

### 1.1 Phase 0 — 데이터 백필

| 스펙 요구사항 | 구현 상태 | 비고 |
|--------------|-----------|------|
| ai_summary NULL 백필 | O 구현됨 | `backfillAiSummary()` — 3줄 요약 프롬프트 |
| importance_score 0 백필 | O 구현됨 | `backfillImportanceScore()` — AI 1~5 스코어링 |
| blueprint/lecture = 고정 5 | O 구현됨 | L467: `source_type === "blueprint" \|\| "lecture"` -> score 5 |
| key_topics 빈 배열 재분석 | X 누락 | Plan에서 Out-of-scope 처리됨. 스펙에는 명시적 요구 있음 |

### 1.2 Phase 1 — UI

| 스펙 요구사항 | 구현 상태 | 비고 |
|--------------|-----------|------|
| PipelineSidebar 섹션 분리 (커리큘럼/큐레이션/통계) | O 구현됨 | 3섹션 정상 분리 |
| CurriculumView 신규 | O 구현됨 | 레벨 파싱 + 진행률 바 |
| 듀얼모드 자동 전환 | O 구현됨 | `sidebarSource === "blueprint" \|\| "lecture"` 분기 |
| 반응형 (모바일 수평 탭) | O 구현됨 | `md:hidden` / `hidden md:block` 분기 |
| DB: sequence_order 컬럼 추가 | X 누락 | Plan에서 Out-of-scope 처리. 스펙 Phase 1 명시 |
| DB: curriculum_level 컬럼 추가 | X 누락 | title 파싱으로 대체 (설계서에 명시적 결정) |
| 커리큘럼 발행 상태 표시 (발행됨/다음 발행/잠금) | X 누락 | 스펙 3.1에 명시된 핵심 기능 |
| 중복 콘텐츠 표시 ("초급#2와 중급#3, 30% 중복") | X 누락 | 스펙 3.1에 명시. Phase 2+ 후속 예상 |
| 커리큘럼 시험 내용 제외 로직 | X 누락 | 스펙 3.1 "시험 내용 제외" |

### 1.3 누락 기능 목록

1. **key_topics 백필** — 스펙 Phase 0에 명시되었으나 Plan에서 제외
2. **sequence_order** — 시퀀스 순서 관리용 DB 컬럼. 현재 `created_at` 정렬로 대체
3. **커리큘럼 발행 상태** — 스펙의 핵심 UX (`발행됨 / 다음 발행 / 잠금`). 현재는 AI 요약 유무만 표시
4. **중복 콘텐츠 감지** — 스펙에는 있으나 복잡도 높아 후속 페이즈 적합

---

## 2. 코드 품질

### 2.1 TypeScript 타입 안전성

| 심각도 | 파일 | 라인 | 이슈 | 수정 제안 |
|--------|------|------|------|-----------|
| :yellow_circle: Warning | `curation.ts` | L30, 80, 101, 124, 160, 194, 203, 227, 270, 316, 342, 372, 407, 439, 495 | `(supabase as any)` 15회 사용. `eslint-disable` 주석으로 억제 | Supabase 타입이 `contents` 테이블의 신규 컬럼(`ai_summary`, `importance_score`, `curation_status`)을 반영하지 못해 발생. `database.ts` 타입 재생성(`supabase gen types`)으로 근본 해결 필요 |
| :yellow_circle: Warning | `curriculum-view.tsx` | L155 | `data as Content[]` 강제 캐스팅 | `getCurriculumContents` 반환 타입을 `Content[]`로 명시하면 캐스팅 불필요 |
| :blue_circle: Info | `content/page.tsx` | L93 | `data as Content[]` | 위와 동일 패턴 |

### 2.2 에러 처리

| 심각도 | 파일 | 라인 | 이슈 | 수정 제안 |
|--------|------|------|------|-----------|
| :yellow_circle: Warning | `curation.ts` | L389-390 | `backfillAiSummary`에서 `body_md`가 빈 문자열이면 의미 없는 요약 생성 | `if (!text.trim()) { failed++; continue; }` 가드 추가 |
| :yellow_circle: Warning | `curation.ts` | L471 | `backfillImportanceScore`에서 `body_md`가 빈 문자열이면 AI가 판단 불가 | 동일하게 빈 본문 가드 필요 |
| :yellow_circle: Warning | `curation.ts` | L484 | `parseInt(result.trim())` — AI 응답이 "4점" 같은 형태면 파싱 실패 -> 기본값 3 | 정규식 `/\d/`로 첫 숫자 추출하는 게 더 안정적 |
| :blue_circle: Info | `pipeline-sidebar.tsx` | L36-43 | `useEffect` 내 에러 처리 없음. `getPipelineStats()` 실패 시 빈 사이드바 | `.catch()` 추가하여 에러 상태 표시 권장 |
| :blue_circle: Info | `curriculum-view.tsx` | L157 | `catch` 블록에서 에러 무시 (`setContents([])`) | 에러 메시지를 사용자에게 표시하거나 toast 알림 권장 |

### 2.3 중복 코드

| 심각도 | 파일 | 라인 | 이슈 | 수정 제안 |
|--------|------|------|------|-----------|
| :blue_circle: Info | `curation.ts` | L253-262 vs `curriculum-view.tsx` L14-17 | `SOURCE_LABELS` 매핑이 두 파일에 중복 정의 | 공통 상수 파일로 추출 (예: `src/constants/curation.ts`) |
| :blue_circle: Info | `pipeline-sidebar.tsx` L17-26 vs `curation.ts` L253-262 | 소스별 설정(라벨, 아이콘, 색상)이 분산 | 통합 가능 |

### 2.4 네이밍 일관성

| 심각도 | 파일 | 라인 | 이슈 |
|--------|------|------|------|
| :blue_circle: Info | `curation.ts` | L360 | `delay()` — 범용 유틸이지만 모듈 내부 정의. `lib/utils.ts`에 이미 유사 함수 있는지 확인 필요 |
| :blue_circle: Info | `curation.ts` | L192 | `svc2` 변수명 — `serviceClient` 등 의미 있는 이름 권장 |

---

## 3. 보안

| 심각도 | 파일 | 라인 | 이슈 | 수정 제안 |
|--------|------|------|------|-----------|
| :red_circle: Critical | `curation.ts` | L364-428 | `backfillAiSummary()`는 `"use server"` 파일에 export된 서버 액션. `createServiceClient()`(RLS 우회)를 사용하지만 **함수 내부에 권한 체크 없음**. 클라이언트에서 직접 호출 가능 | `requireAdmin()` 또는 `requireStaff()` 호출 추가 필수 |
| :red_circle: Critical | `curation.ts` | L430-513 | `backfillImportanceScore()` 동일 문제. 권한 없이 `createServiceClient()` 사용 | 동일 수정 필요 |
| :yellow_circle: Warning | `backfill/route.ts` | L7-9 | API 라우트의 `requireAdmin()`은 정상 동작. 그러나 **서버 액션 자체가 무방비**이므로 API를 우회하여 직접 서버 액션 호출 가능 | 서버 액션 내부에도 권한 체크 이중 적용 |
| :yellow_circle: Warning | `backfill/route.ts` | L12 | `req.json()` 파싱 실패 시 unhandled exception | try-catch로 감싸고 400 반환 |
| :yellow_circle: Warning | `backfill/route.ts` | 전체 | Rate limit 없음. 반복 호출 시 Gemini API 비용 폭증 가능 | 동시 실행 방지 (DB lock 또는 in-memory flag) + 일일 호출 제한 |
| :blue_circle: Info | `curation.ts` | L107, L131 | `updateCurationStatus`, `batchUpdateCurationStatus` — id 유효성 검증 없음 (UUID 형식 등) | Zod 스키마로 입력 검증 권장 |

---

## 4. 성능

| 심각도 | 파일 | 라인 | 이슈 | 수정 제안 |
|--------|------|------|------|-----------|
| :yellow_circle: Warning | `curation.ts` | L271-274 | `getPipelineStats()` — 3개 쿼리가 **전체 행**을 SELECT 후 클라이언트에서 집계. contents 226건 + knowledge_chunks 1,912건 전부 전송 | DB에서 `GROUP BY source_type` 집계하거나, RPC 사용. 데이터 증가 시 성능 문제 |
| :yellow_circle: Warning | `curation.ts` | L317-322 | `getCurriculumContents()` — `select("*")` 전체 컬럼 조회. `body_md`(긴 텍스트)까지 포함 | 목록용으로는 `id, title, ai_summary, key_topics, created_at` 등 필요 컬럼만 선택 |
| :yellow_circle: Warning | `curriculum-view.tsx` | L124 | `body_md` 500자 슬라이스를 클라이언트에서 수행 — 전체 `body_md`가 이미 전송됨 | 서버에서 잘라서 보내거나, 확장 시 별도 API 호출 |
| :blue_circle: Info | `content/page.tsx` | L67-68 | 모듈 레벨 캐시 `_contentsCache` — SPA 내 뒤로가기 최적화 의도. 그러나 다른 탭에서 데이터 변경 시 stale 캐시 문제 | TTL 또는 invalidation 로직 추가 고려 |
| :blue_circle: Info | `pipeline-sidebar.tsx` | L36-43 | 사이드바 데이터가 마운트 시 1회만 로드. 큐레이션 작업 후 카운트가 갱신되지 않음 | 탭 전환 또는 액션 후 리패치 트리거 필요 |
| :blue_circle: Info | `curation.ts` | L419 | `backfillAiSummary` — 순차 처리 + 1초 딜레이. 30건 = 최소 30초. 대량 데이터 시 타임아웃 위험 | `maxDuration=300`(route.ts L5)으로 5분 허용. 현재 규모에서는 OK. 향후 배치 크기 제한 권장 |

---

## 5. UX

| 심각도 | 파일 | 라인 | 이슈 | 수정 제안 |
|--------|------|------|------|-----------|
| :yellow_circle: Warning | `content/page.tsx` | L213-233 | 모바일 수평 탭에 `webinar`, `papers`, `file` 소스 누락. 사이드바에는 존재 | 모바일 탭에도 동적으로 전체 소스 표시하거나, "더보기" 처리 |
| :yellow_circle: Warning | `curriculum-view.tsx` | L77-78 | `CurriculumItem`이 `<button>` 안에 인터랙티브 콘텐츠 없으나, 전체 영역이 클릭 가능. 접근성: `aria-expanded` 속성 누락 | `aria-expanded={expanded}` 추가 |
| :blue_circle: Info | `pipeline-sidebar.tsx` | L92 | 사이드바 폭 `w-[220px]` 고정. 긴 라벨(`마케팅원론` 등)이 잘릴 수 있음 | 현재 라벨 길이에서는 문제 없으나, 신규 소스 추가 시 주의 |
| :blue_circle: Info | `curriculum-view.tsx` | L26-31 | `parseLevel()` — 제목에 레벨 키워드가 없으면 전부 "전체" 그룹으로 분류. 블루프린트/강의 제목이 실제로 "초급/중급/고급"을 포함하는지 데이터 검증 필요 | 실 데이터 확인 후 분류 정확도 검증 |
| :blue_circle: Info | `content/page.tsx` | L260 | 콘텐츠 탭 stat cards `grid-cols-4` — 모바일에서 4열은 과도하게 좁음 | `grid-cols-2 md:grid-cols-4` 반응형 처리 권장 |
| :blue_circle: Info | `curriculum-view.tsx` | L179-189 | 빈 상태 처리 O (정상) | — |
| :blue_circle: Info | `pipeline-sidebar.tsx` | L46-52 | 로딩 상태 처리 O (정상) | — |

---

## 6. 종합 평가

### 잘 된 점
- **듀얼모드 분기 로직**: 사이드바 선택에 따른 조건부 렌더링이 깔끔하게 구현됨
- **백필 함수 설계**: rate limit(1초 딜레이), 개별 에러 처리, 결과 리포트 구조가 견고함
- **반응형 처리**: 데스크탑/모바일 분기가 적절히 구현됨
- **PipelineSidebar 3섹션 분리**: 스펙 의도대로 커리큘럼/큐레이션/통계 명확 구분
- **CurriculumView 진행률 바**: AI 요약 완료율 시각화가 직관적

### 개선 필요

| 우선순위 | 항목 | 이유 |
|----------|------|------|
| P0 | 백필 서버 액션 권한 체크 추가 | 보안 Critical — RLS 우회 함수가 무인증 노출 |
| P0 | `req.json()` try-catch | API 안정성 |
| P1 | `getPipelineStats()` DB 집계로 전환 | 데이터 증가 시 성능 병목 |
| P1 | `getCurriculumContents()` 컬럼 선택 | 불필요한 대량 데이터 전송 방지 |
| P1 | 모바일 소스 탭 동기화 | UX 일관성 (사이드바와 모바일 탭 소스 불일치) |
| P2 | `database.ts` 타입 재생성 | `as any` 15회 제거 -> 타입 안전성 확보 |
| P2 | SOURCE_LABELS 등 상수 통합 | 중복 제거 + 유지보수성 |
| P3 | 사이드바 데이터 리패치 | 실시간성 개선 |

---

## 7. 스펙 Gap 요약

| # | 스펙 항목 | 현재 상태 | 권장 조치 |
|---|-----------|-----------|-----------|
| G1 | key_topics 백필 | 미구현 (Plan에서 제외) | Phase 2에서 토픽맵과 함께 구현 |
| G2 | sequence_order DB 컬럼 | 미구현 (Plan에서 제외) | created_at 정렬로 현재 동작. 순서 커스텀 필요 시 추가 |
| G3 | 커리큘럼 발행 상태 (발행됨/다음/잠금) | 미구현 | Phase 2 이전에 구현 권장 (커리큘럼 뷰 핵심 기능) |
| G4 | 중복 콘텐츠 감지 | 미구현 | Phase 2+ (임베딩 유사도 기반) |
| G5 | 시험 내용 제외 | 미구현 | 데이터 태깅 또는 title 필터로 처리 가능 |
