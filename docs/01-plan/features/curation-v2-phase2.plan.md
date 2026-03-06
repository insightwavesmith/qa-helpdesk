# 큐레이션 v2 Phase 2 Plan — 인박스 리뉴얼 + 토픽맵 + Soft Delete

> 기획서: `docs/proposals/curation-v2-spec.md`
> Phase 0+1 Plan: `docs/01-plan/features/curation-v2-p0p1.plan.md`
> Phase 0+1 Design: `docs/02-design/features/curation-v2-p0p1.design.md`
> 코드 리뷰 수정: `docs/01-plan/features/curation-v2-review-fixes.plan.md`
> TASK: `TASK-큐레이션v2-phase2.md`

---

## 1. 요구사항

큐레이션 탭의 외부 소스(블로그/YouTube/마케팅원론 등) 뷰를 리뉴얼하여:
1. AI 핵심요약이 항상 보이고 (접히지 않음)
2. 생성물(정보공유)과의 연결이 카드에 표시되고
3. 토픽별 분류(토픽맵)가 가능하며
4. 삭제 시 복원이 가능한 (Soft Delete) 실용적 큐레이션 도구로 만든다.

## 2. 현재 상태 (Phase 0+1 완료 기준)

### 완료된 것
- `pipeline-sidebar.tsx` (176줄): 커리큘럼/큐레이션 소스 섹션 분리
- `curriculum-view.tsx` (281줄): 시퀀스 뷰 + 발행 상태 3종
- `curation.ts` (512줄): 서버 액션 (getCurationContents, backfill, getCurriculumContents 등)
- 코드 리뷰 수정 (`74c1268`): as any 제거, 빈 본문 가드, requireAdmin, 발행 상태

### 현재 문제점
- `curation-card.tsx` (146줄): AI 요약이 접혀있어 안 읽게 됨 (line-clamp-2 + "더보기")
- `curation-tab.tsx` (250줄): 날짜 그룹만 지원, 토픽 분류/뷰 전환 없음
- 삭제 = hard dismiss (curation_status='dismissed'), 복원 불가
- 생성물과의 연결 표시 없음 (source_ref 데이터는 있지만 UI 미표시)

### DB 현황
- `contents` 테이블: `curation_status` enum = `new | selected | dismissed | published`
- `key_topics`: string[] — 존재하지만 토픽 그룹핑에 활용 안 됨
- `source_ref`: 정보공유 콘텐츠가 원본 소스 id를 콤마로 저장 (역추적 가능)
- `deleted_at` 컬럼: 없음 (추가 필요)

## 3. 범위

### In-scope
- **T1**: 카드 v2 — AI 요약 항상 펼침 + 생성물 연결 + 인라인 액션
- **T2**: 큐레이션 뷰 리뉴얼 — 인박스 + 토픽맵 서브뷰 + 상태 필터 탭
- **T3**: Soft Delete — deleted_at 컬럼 + 삭제/복원 UI + 30일 자동 정리 Cron

### Out-of-scope
- 토픽 자동 분류 AI 호출 (기존 key_topics 데이터 그대로 사용)
- 드래그 앤 드롭
- 칸반 뷰 (삭제 확정 — 정보공유 탭과 역할 중복)
- 삭제 시 연관 knowledge_chunks 처리 (별도 태스크)
- key_topics 재분석/백필
- curation_status enum 수정 (deleted_at으로 분리 관리)

## 4. 성공 기준

1. 카드 v2: AI 요약이 항상 불릿 형태로 표시됨 (접기/펼치기 버튼 없음)
2. 카드 v2: 생성물 연결 — 해당 소스로 만든 정보공유가 있으면 `"글 제목" 발행됨` 링크 표시
3. 카드 v2: 소스 출처 = 도메인명 + 수집일, 인라인 액션 버튼 3개
4. 뷰 토글: 인박스 / 토픽맵 버튼으로 전환 가능
5. 상태 필터 탭: 전체/신규/생성됨/발행됨/스킵 카운트 표시 + 필터링
6. 토픽맵: key_topics[0] 기준 그룹핑, 토픽 헤더에 콘텐츠 수 + 접기/펼치기
7. 토픽맵: 토픽 없는 콘텐츠는 "미분류" 그룹
8. Soft Delete: 삭제 시 deleted_at 설정, 기본 목록에서 숨김
9. Soft Delete: 삭제 섹션에서 개별/전체 복원 가능
10. Cron: 30일 지난 삭제 콘텐츠 영구 삭제 (/api/cron/cleanup-deleted)
11. 기존 CurationTab + CurriculumView + PipelineSidebar 정상 동작
12. `npm run build` 성공

## 5. 구현 순서

```
T1 (카드 v2) → T2 (뷰 리뉴얼) → T3 (Soft Delete)
```

### T1: 카드 v2 — AI 요약 항상 펼침 + 생성물 연결

**수정 파일:**
- `src/components/curation/curation-card.tsx` — 리뉴얼

**서버 액션 수정:**
- `src/actions/curation.ts` — getCurationContents 응답에 생성물 정보 JOIN 추가

**변경 내용:**
1. AI 요약 항상 펼침: 불릿 형태(bullet point)로 3줄 이내 표시. expanded 상태 + 접기/펼치기 버튼 제거
2. 요약 null이면 "AI 분석 대기중" 안내
3. 생성물 연결: contents 테이블 self-join (source_ref LIKE '%{id}%')
4. 소스 출처: 도메인명 (source_ref에서 추출 또는 title 기반) + 수집일 (M/d 형식)
5. 인라인 액션: [원문 보기] [스킵] [정보공유 생성] — 카드 하단
6. CurationCardProps 확장: linkedInfoShare 정보 추가

### T2: 큐레이션 뷰 리뉴얼 — 인박스 + 토픽맵

**신규 파일:**
- `src/components/curation/curation-view.tsx` — 인박스 + 토픽맵 래퍼
- `src/components/curation/topic-map-view.tsx` — 토픽 트리 뷰

**수정 파일:**
- `src/components/curation/curation-tab.tsx` — 인박스 뷰로 역할 축소 (내부 필터 일부 curation-view로 이동)
- `src/app/(main)/admin/content/page.tsx` — CurationView 사용으로 교체

**변경 내용:**
1. CurationView 래퍼: 상단에 뷰 토글 + 상태 필터 탭, 하단에 선택한 뷰 렌더
2. 뷰 토글 버튼: 인박스 / 토픽맵
3. 상태 필터 탭: 전체/신규/생성됨/발행됨/스킵 (curation_status 기반 카운트)
4. 인박스 뷰: 기존 curation-tab.tsx 활용 (카드 v2 사용)
5. 토픽맵 뷰: key_topics[0] 기준 1차 그룹, 미분류 그룹
6. 벌크 바 유지 + 개선

**서버 액션 수정:**
- `src/actions/curation.ts` — getCurationContents에 curation_status 필터 파라미터 추가, 상태별 카운트 쿼리 추가

### T3: Soft Delete + 삭제 콘텐츠 복원

**DB 변경:**
- `contents` 테이블에 `deleted_at timestamptz` 컬럼 추가 (NULL = 삭제 안 됨)

**신규 파일:**
- `src/components/curation/deleted-section.tsx` — 삭제된 콘텐츠 섹션
- `src/app/api/cron/cleanup-deleted/route.ts` — 30일 자동 영구 삭제

**수정 파일:**
- `src/types/content.ts` — deleted_at 필드 추가
- `src/actions/curation.ts` — softDeleteContents(), restoreContents() 추가, 기존 쿼리에 deleted_at IS NULL 조건
- `src/components/curation/curation-view.tsx` — 하단에 삭제 섹션 통합

**변경 내용:**
1. 삭제: 체크박스 선택 -> "삭제" 버튼 -> deleted_at = now()
2. 기존 getCurationContents에 deleted_at IS NULL 조건 추가
3. 삭제 섹션: 큐레이션 뷰 하단에 접힌 아코디언
4. 복원: deleted_at = null로 되돌림
5. Cron: 매일 04:00 KST, CRON_SECRET 인증, 30일 지난 건 영구 삭제
6. RLS: 서비스 클라이언트(createServiceClient) 사용

## 6. 의존성 그래프

```
T1 (카드 v2)
  ├─ curation-card.tsx (수정)
  └─ curation.ts getCurationContents (생성물 JOIN 추가)

T2 (뷰 리뉴얼) — T1에 의존
  ├─ curation-view.tsx (신규, 카드 v2 사용)
  ├─ topic-map-view.tsx (신규, 카드 v2 사용)
  ├─ curation-tab.tsx (수정, 인박스 역할로 축소)
  ├─ content/page.tsx (수정, CurationView 사용)
  └─ curation.ts (상태 필터 + 카운트 쿼리)

T3 (Soft Delete) — T2에 의존
  ├─ DB: deleted_at 컬럼 추가
  ├─ content.ts 타입 (수정)
  ├─ curation.ts (softDelete/restore 액션 + IS NULL 조건)
  ├─ deleted-section.tsx (신규)
  ├─ curation-view.tsx (수정, 삭제 섹션 통합)
  └─ cleanup-deleted/route.ts (신규 Cron)
```

## 7. 리스크

| 리스크 | 확률 | 대응 |
|--------|------|------|
| 생성물 역추적 쿼리 성능 | 중 | source_ref LIKE 대신 별도 쿼리 후 클라이언트 매칭, 또는 한 번에 info_share 전체 source_ref 조회 후 Map 구성 |
| key_topics 빈 배열 비율 | 중 | 토픽맵에서 "미분류" 그룹으로 처리, 빈 배열이 많으면 인박스 뷰가 기본 |
| deleted_at 마이그레이션 | 저 | nullable 컬럼 추가이므로 무중단, 기존 데이터 영향 없음 |
| Cron CRON_SECRET 미설정 | 저 | 환경변수 체크 + 401 반환 |
