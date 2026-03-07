# 정보공유 오류수정 Gap 분석

> 분석일: 2026-03-07
> 설계서: `docs/02-design/features/info-share-bugfix.design.md`
> Plan: `docs/01-plan/features/info-share-bugfix.plan.md`

---

## Match Rate: 97%

---

## 일치 항목 (33/34 체크포인트)

### T1: 스킵 되돌리기 (11/11 — 100%)
- [x] `curation.ts`: `updateCurationStatus` status union에 `"new"` 추가
- [x] `curation.ts`: `batchUpdateCurationStatus` status union에 `"new"` 추가
- [x] `curation-card.tsx`: `onRestore` prop 추가
- [x] `curation-card.tsx`: `curationStatus === "dismissed"` 일 때 "되돌리기" 버튼 표시
- [x] `curation-card.tsx`: `RotateCcw` 아이콘 import 추가
- [x] `curation-tab.tsx`: `onRestore` prop 추가 + CurationCard에 전달
- [x] `curation-view.tsx`: `handleCurationRestore()` 핸들러 추가
- [x] `curation-view.tsx`: 벌크 바 — `statusFilter === "dismissed"` 일 때 "일괄 되돌리기" 표시
- [x] `curation-view.tsx`: CurationTab에 `onRestore` prop 전달
- [x] `curation-view.tsx`: `RotateCcw` 아이콘 import 추가
- [x] 빌드 확인 통과

### T2: 커리큘럼 잠금 해제 (8/8 — 100%)
- [x] `curriculum-view.tsx`: CurriculumViewProps에 `onGenerateInfoShare` prop 추가
- [x] `curriculum-view.tsx`: CurriculumItem에 `onGenerateInfoShare` prop 전달
- [x] `curriculum-view.tsx`: CurriculumItem 확장 영역에 "정보공유 생성" 버튼 추가
- [x] `curriculum-view.tsx`: `publishStatus !== "published"` 조건으로 버튼 표시
- [x] `curriculum-view.tsx`: `Button` 컴포넌트 import 추가
- [x] `curriculum-view.tsx`: `Sparkles` 아이콘 import 추가
- [x] `content/page.tsx`: CurriculumView에 `onGenerateInfoShare` 전달
- [x] 빌드 확인 통과

### T4: 소스 전환 캐싱 (9/9 — 100%)
- [x] `curation-view.tsx`: `CacheEntry` 인터페이스 + `makeCacheKey()` 함수 정의
- [x] `curation-view.tsx`: `cacheRef = useRef<Map<string, CacheEntry>>` 추가
- [x] `curation-view.tsx`: `CACHE_TTL` 상수 정의 (5분)
- [x] `curation-view.tsx`: `loadContents` 수정 — 캐시 체크 + stale-while-revalidate
- [x] `curation-view.tsx`: `loadCounts`를 `loadContents`에 통합 (병렬 호출로 캐시 일관성)
- [x] `curation-view.tsx`: `invalidateCache()` 함수 추가
- [x] `curation-view.tsx`: `handleDismiss`, `handleSoftDelete`, `handleCurationRestore`에 `invalidateCache()` 호출 추가
- [x] `curation-view.tsx`: `handleDeletedRestore`에도 캐시 무효화 추가
- [x] 빌드 확인 통과

### T3: "발행됨" 상태 구분 (5/6 — 83%)
- [x] `curation.ts` `createInfoShareDraft`: 새 info_share의 `curation_status`를 `"selected"`로 변경
- [x] `curation.ts` `createInfoShareDraft`: 원본 curation_status 업데이트 블록 제거
- [x] `curation.ts` `createInfoShareDraft`: `createServiceClient()` import 제거 (불필요)
- [x] `curation-card.tsx`: 생성물 연결 표시에 status 반영 ("게시 완료" / "초안")
- [x] `curation.ts` `getInfoShareContents`: `curation_status` 필터를 `"published"` OR `"selected"`로 확장
- [ ] `curation-view.tsx`: 발행됨 탭에서 카운트 표시 시 초안/게시 구분 안내 — 미구현 (설계서에도 "추가 설명이 필요하지 않음"으로 명시, linked_info_shares status로 시각적 구분 충분)

---

## 불일치 항목 (1/34)

| 항목 | 설계 | 구현 | 사유 |
|------|------|------|------|
| 발행됨 탭 안내 | "추가 설명이 필요하지 않음" | 미구현 | 설계서 자체가 불필요로 판단. linked_info_shares의 status로 시각적 구분 충분. |

---

## 추가 구현 (설계서 외)

- `handleDeletedRestore`에서도 캐시 무효화 추가 (일관성)
- 기존 `handleRestore` → `handleDeletedRestore`로 리네이밍 (새 `handleCurationRestore`와 구분)

---

## 빌드 검증 결과

- `npx tsc --noEmit`: 통과 (에러 0)
- `npm run lint`: 변경 파일 관련 새 에러 0 (기존 에러만 존재)
- `npm run build`: 성공

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/actions/curation.ts` | T1: status union "new" 추가, T3: createInfoShareDraft 원본 상태 미변경 + curation_status "selected", getInfoShareContents 필터 확장, createServiceClient import 제거 |
| `src/components/curation/curation-card.tsx` | T1: onRestore prop + 되돌리기 버튼, T3: 생성물 연결 초안/게시 구분 |
| `src/components/curation/curation-tab.tsx` | T1: onRestore prop 전달 |
| `src/components/curation/curation-view.tsx` | T1: handleCurationRestore + 벌크바 조건부, T4: 캐시 인프라 전체 |
| `src/components/curation/curriculum-view.tsx` | T2: onGenerateInfoShare prop + 발행 버튼 |
| `src/app/(main)/admin/content/page.tsx` | T2: CurriculumView에 onGenerateInfoShare 전달 |
