# 정보공유 오류수정 — 코드 리서치

> 작성일: 2026-03-07
> TASK: TASK-정보공유-오류수정.md (T1~T4)

---

## 1. 수정 대상 파일 목록

| 파일 | 역할 | 관련 태스크 |
|------|------|------------|
| `src/actions/curation.ts` | 서버 액션 (CRUD, 상태 변경) | T1, T3 |
| `src/components/curation/curation-view.tsx` | 큐레이션 메인 뷰 (상태 필터, 벌크 바, 데이터 로딩) | T1, T3, T4 |
| `src/components/curation/curation-card.tsx` | 개별 카드 UI (스킵/생성 버튼) | T1 |
| `src/components/curation/curation-tab.tsx` | 인박스 뷰 (날짜 그룹핑, 카드 렌더) | T1 |
| `src/components/curation/curriculum-view.tsx` | 커리큘럼 뷰 (블루프린트/강의 순차 발행) | T2 |
| `src/types/content.ts` | Content 타입 정의 | T3 |

---

## 2. 현재 동작 요약

### T1: 스킵 되돌리기 — 현재 불가

- `updateCurationStatus()` (L212~233): status 타입이 `"selected" | "dismissed" | "published"` — `"new"` 없음
- `batchUpdateCurationStatus()` (L235~256): 동일하게 `"new"` 미포함
- `curation-view.tsx` 스킵 탭에서 카드를 표시하지만 "되돌리기" 버튼 없음
- `curation-card.tsx`: 스킵 버튼(`onDismiss`)만 있고, 되돌리기 액션 없음

### T2: 커리큘럼 잠금 — 순차 강제

- `curriculum-view.tsx` L50~66 `getPublishStatuses()`:
  - published 항목 이후 첫 미발행 항목 = "next", 나머지 = "locked"
  - locked 항목은 `<button>` 이지만 클릭 시 expand만 가능, 발행 버튼 없음
- CurriculumItem 컴포넌트 (L92~179): publishStatus를 받아 뱃지만 표시. 발행 버튼 자체가 없음
- 발행은 별도 `onGenerateInfoShare` 콜백을 통해 이루어지지만, CurriculumView에는 이 prop이 없음

### T3: "발행됨" 상태 구분 — 초안도 published

- `createInfoShareDraft()` (L258~344):
  - 새 info_share 콘텐츠: `status: "draft"`, `curation_status: "published"` (L285~286)
  - 원본 콘텐츠: `curation_status: "published"` 로 업데이트 (L321~339)
  - 즉, 초안만 만들어도 원본이 바로 "발행됨"으로 변경됨
- `curation-card.tsx` L259~267: 생성물 연결 표시에서 status 무관하게 "발행됨" 텍스트 고정
- `curation-view.tsx` 발행됨 탭: `curationStatus: "published"` 로 필터만 하므로 초안/게시 구분 불가

### T4: 소스 전환 캐싱 — 매번 API 호출

- `curation-view.tsx` L59~89 `loadContents()`:
  - `sourceFilter` 변경 시 useEffect로 매번 `getCurationContents()` API 호출
  - 이전 소스 데이터 캐시 없음
  - L107~111: 소스 필터 변경 시 `statusFilter`도 리셋 → 전체 리로드
- 모듈 레벨 캐시는 `content/page.tsx` L67~68에만 존재 (콘텐츠 목록 탭용)

---

## 3. 의존성 그래프

```
content/page.tsx
  ├── PipelineSidebar → sidebarSource state → onSourceSelect
  ├── CurriculumView (blueprint/lecture) ← T2
  └── CurationView (그 외) ← T1, T3, T4
        ├── loadContents() → getCurationContents() ← T4
        ├── handleDismiss() → batchUpdateCurationStatus() ← T1
        ├── CurationTab → CurationCard ← T1
        └── DeletedSection

curation.ts (서버 액션)
  ├── updateCurationStatus() ← T1
  ├── batchUpdateCurationStatus() ← T1
  ├── createInfoShareDraft() ← T3
  └── getCurationContents() ← T3, T4
```

---

## 4. 태스크별 수정 영향 범위

### T1: 스킵 되돌리기
- **curation.ts**: `updateCurationStatus`, `batchUpdateCurationStatus`의 status union에 `"new"` 추가
- **curation-view.tsx**: 스킵 탭일 때 "되돌리기" 핸들러 추가
- **curation-card.tsx**: `curationStatus === "dismissed"` 일 때 "되돌리기" 버튼 표시 (스킵 버튼 대체)
- **curation-tab.tsx**: onRestore 콜백 전달
- 영향: 제한적 (status 타입만 확장, 기존 로직 미변경)

### T2: 커리큘럼 잠금 해제
- **curriculum-view.tsx**:
  - CurriculumItem에 발행 버튼 추가 (locked 상태여도 접근 가능)
  - Props에 `onGenerateInfoShare` 콜백 추가
  - 잠금 UI(뱃지)는 유지하되 발행 버튼은 비활성 해제
- **content/page.tsx**: CurriculumView에 `onGenerateInfoShare` prop 전달
- 영향: curriculum-view.tsx 집중 수정

### T3: "발행됨" 상태 구분
- **curation.ts** `createInfoShareDraft()`: 원본 상태를 "published" 대신 "draft_created" 같은 중간 상태로 변경하거나, 원본 상태는 변경하지 않고 linked_info_shares의 status로 구분
  - 주의: curation_status enum이 DB에 text로 저장됨 → 새 값 추가 자유
  - 하지만 기존 "published" 데이터와의 호환성 고려 필요
- **curation-view.tsx**: 발행됨 탭에서 초안/게시 구분 UI
- **curation-card.tsx**: linked_info_shares status에 따라 "초안"/"게시됨" 구분 표시
- 영향: 상태 체계 변경 → T1, T2와 충돌 가능 (마지막 작업)

### T4: 소스 전환 캐싱
- **curation-view.tsx**:
  - useRef로 소스별 캐시 Map 유지: `Map<string, { data, counts, timestamp }>`
  - loadContents에서 캐시 히트 시 API 스킵
  - 캐시 무효화: 상태 변경(스킵/생성/삭제) 시 해당 소스 캐시 제거
  - TTL 또는 stale-while-revalidate 패턴 적용 가능
- 영향: curation-view.tsx 내부 변경만, 외부 API 미변경

---

## 5. 기존 관련 문서

- `docs/02-design/features/curation-v2-phase2.design.md`: Phase 2 설계서 (카드v2, 뷰리뉴얼, Soft Delete)
- `docs/01-plan/features/curation-v2-review-fixes.plan.md`: 커리큘럼 발행 상태 3종 (발행됨/다음발행/잠금)
- `.pdca-status.json`: curation-v2-phase2 = "designing", curation-v2-bugfix = "designing"
