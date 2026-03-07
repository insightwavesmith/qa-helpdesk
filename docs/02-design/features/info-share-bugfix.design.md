# 정보공유 오류수정 설계서

> Plan: `docs/01-plan/features/info-share-bugfix.plan.md`
> Research: `docs/research/info-share-bugfix.research.md`

---

## 1. 데이터 모델

### 1.1 DB 변경 없음

- `curation_status`는 `text` 타입 → 새 값 `"new"` 는 이미 사용 중 (기존 enum 값)
- 새 테이블/컬럼 추가 없음

### 1.2 타입 변경

```typescript
// src/actions/curation.ts — status union 확장
// Before
status: "selected" | "dismissed" | "published"
// After
status: "new" | "selected" | "dismissed" | "published"
```

---

## 2. API 설계

### 2.1 T1: updateCurationStatus / batchUpdateCurationStatus — status에 "new" 추가

#### updateCurationStatus (수정)

```typescript
// src/actions/curation.ts L212
export async function updateCurationStatus(
  id: string,
  status: "new" | "selected" | "dismissed" | "published"  // "new" 추가
)
```

변경: status 타입에 `"new"` 추가. 로직 변경 없음.

#### batchUpdateCurationStatus (수정)

```typescript
// src/actions/curation.ts L235
export async function batchUpdateCurationStatus(
  ids: string[],
  status: "new" | "selected" | "dismissed" | "published"  // "new" 추가
)
```

변경: status 타입에 `"new"` 추가. 로직 변경 없음.

### 2.2 T3: createInfoShareDraft — 원본 상태 변경 제거

#### createInfoShareDraft (수정)

```typescript
// src/actions/curation.ts L258
// 기존: 원본 curation_status -> "published" (L321~339)
// 변경: 원본 curation_status 업데이트 제거 (초안 생성 시 원본 상태 유지)
// 원본이 "published"가 되는 시점은 info_share가 실제 게시(published)될 때로 변경
```

변경 사항:
1. L321~339 블록 제거 (원본 콘텐츠 curation_status -> "published" 업데이트)
2. 원본은 기존 curation_status ("new" 또는 "selected") 유지
3. 생성된 info_share의 `curation_status`도 "published" 대신 "selected"로 변경 (L285)

```typescript
// Before (L278~288)
.insert({
  title,
  body_md: bodyMd,
  status: "draft",
  type: "education",
  category,
  source_type: "info_share",
  source_ref: sourceContentIds.join(","),
  curation_status: "published",  // <- 초안인데 published
  ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
})

// After
.insert({
  title,
  body_md: bodyMd,
  status: "draft",
  type: "education",
  category,
  source_type: "info_share",
  source_ref: sourceContentIds.join(","),
  curation_status: "selected",  // <- 초안은 selected
  ...(thumbnailUrl ? { thumbnail_url: thumbnailUrl } : {}),
})
```

---

## 3. 컴포넌트 구조

### 3.1 T1: 스킵 되돌리기 — curation-card.tsx, curation-view.tsx

#### CurationCard 수정 — 되돌리기 버튼 조건부 표시

```typescript
// curation-card.tsx — CurationCardProps 변경 없음 (onDismiss를 재활용)
// 추가 prop:
interface CurationCardProps {
  // ... 기존 props
  onRestore?: (id: string) => void;  // NEW: 되돌리기 핸들러
}
```

```tsx
// 하단 액션 버튼 영역 — curationStatus에 따라 버튼 분기
<div className="flex gap-1.5">
  {sourceRef && (
    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-gray-500"
      onClick={(e) => { e.stopPropagation(); window.open(sourceRef, "_blank"); }}>
      <ExternalLink className="h-3 w-3 mr-1" />
      원문 보기
    </Button>
  )}

  {curationStatus === "dismissed" ? (
    // 스킵 탭: 되돌리기 버튼
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
      onClick={(e) => {
        e.stopPropagation();
        onRestore?.(id);
      }}
    >
      <RotateCcw className="h-3 w-3 mr-1" />
      되돌리기
    </Button>
  ) : (
    // 기본: 스킵 + 정보공유 생성
    <>
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-gray-500"
        onClick={(e) => { e.stopPropagation(); onDismiss(id); }}>
        <X className="h-3 w-3 mr-1" />
        스킵
      </Button>
      <Button size="sm" className="h-7 text-xs px-2 bg-[#F75D5D] hover:bg-[#E54949] text-white"
        onClick={(e) => { e.stopPropagation(); onGenerate(id); }}>
        <Sparkles className="h-3 w-3 mr-1" />
        정보공유 생성
      </Button>
    </>
  )}
</div>
```

#### CurationTab 수정 — onRestore 전달

```typescript
// curation-tab.tsx — Props 확장
interface CurationTabProps {
  // ... 기존 props
  onRestore?: (id: string) => void;  // NEW
}
```

CurationCard 렌더 시 `onRestore` prop 전달.

#### CurationView 수정 — 되돌리기 핸들러

```typescript
// curation-view.tsx

// 되돌리기 핸들러 추가
const handleRestore = async (id?: string) => {
  const ids = id ? [id] : Array.from(selectedIds);
  if (ids.length === 0) return;
  const { error } = await batchUpdateCurationStatus(ids, "new");
  if (error) {
    toast.error("되돌리기에 실패했습니다.");
  } else {
    toast.success(`${ids.length}개 콘텐츠를 신규로 되돌렸습니다.`);
    setSelectedIds(new Set());
    loadContents();
    loadCounts();
  }
};
```

```tsx
// 벌크 바 — 스킵 탭일 때 "일괄 되돌리기" 표시
{selectedIds.size > 0 && (
  <div className="flex items-center justify-between py-2 px-3 bg-[#111827] rounded-lg text-white">
    <span className="text-xs font-medium">{selectedIds.size}개 선택됨</span>
    <div className="flex gap-2">
      <Button size="sm" variant="ghost" onClick={handleSoftDelete} disabled={deleting}
        className="text-xs text-white hover:bg-white/10 h-7 px-2">
        <Trash2 className="h-3.5 w-3.5 mr-1" />
        삭제
      </Button>

      {statusFilter === "dismissed" ? (
        // 스킵 탭: 일괄 되돌리기
        <Button size="sm" variant="ghost"
          onClick={() => handleRestore()}
          className="text-xs text-white hover:bg-white/10 h-7 px-2">
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          일괄 되돌리기
        </Button>
      ) : (
        // 기본: 일괄 스킵
        <Button size="sm" variant="ghost"
          onClick={() => handleDismiss()}
          disabled={dismissing}
          className="text-xs text-white hover:bg-white/10 h-7 px-2">
          <X className="h-3.5 w-3.5 mr-1" />
          일괄 스킵
        </Button>
      )}

      <Button size="sm" onClick={() => handleGenerate()}
        className="bg-[#F75D5D] hover:bg-[#E54949] text-xs h-7 px-2">
        <Sparkles className="h-3.5 w-3.5 mr-1" />
        정보공유 생성
      </Button>
    </div>
  </div>
)}
```

```tsx
// CurationTab에 onRestore 전달
<CurationTab
  contents={contents}
  loading={loading}
  selectedIds={selectedIds}
  onToggleSelect={toggleSelect}
  onDismiss={(id) => handleDismiss(id)}
  onGenerate={(id) => handleGenerate(id)}
  onRestore={(id) => handleRestore(id)}  // NEW
  emptyTitle={emptyMsg.title}
  emptyDesc={emptyMsg.desc}
/>
```

---

### 3.2 T2: 커리큘럼 잠금 해제 — curriculum-view.tsx, content/page.tsx

#### CurriculumView Props 확장

```typescript
interface CurriculumViewProps {
  sourceType: string;
  onGenerateInfoShare?: (selectedIds: string[]) => void;  // NEW
}
```

#### CurriculumItem 수정 — 발행 버튼 추가

```typescript
// CurriculumItem props 확장
function CurriculumItem({
  item,
  index,
  publishStatus,
  onGenerateInfoShare,  // NEW
}: {
  item: Content;
  index: number;
  publishStatus: PublishStatus;
  onGenerateInfoShare?: (selectedIds: string[]) => void;  // NEW
}) {
```

```tsx
// 확장 영역 하단에 "정보공유 생성" 버튼 추가
{expanded && (
  <div className="mt-3 pt-3 border-t border-gray-100">
    <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
      {(item.body_md || "").slice(0, 500)}
      {(item.body_md || "").length > 500 && "..."}
    </p>

    {/* 토픽 뱃지 (기존) */}
    {(() => {
      const validTopics = filterValidTopics(item.key_topics || []);
      return validTopics.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {validTopics.map((topic) => (
            <Badge key={topic} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
              {topic}
            </Badge>
          ))}
        </div>
      ) : null;
    })()}

    {/* 정보공유 생성 버튼 — 모든 상태에서 표시 (published 제외) */}
    {publishStatus !== "published" && onGenerateInfoShare && (
      <div className="flex justify-end mt-3">
        <Button
          size="sm"
          className="h-7 text-xs px-3 bg-[#F75D5D] hover:bg-[#E54949] text-white"
          onClick={(e) => {
            e.stopPropagation();
            onGenerateInfoShare([item.id]);
          }}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          정보공유 생성
        </Button>
      </div>
    )}
  </div>
)}
```

#### content/page.tsx 수정

```tsx
// Before
{sidebarSource === "blueprint" || sidebarSource === "lecture" ? (
  <CurriculumView sourceType={sidebarSource} />
) : (

// After
{sidebarSource === "blueprint" || sidebarSource === "lecture" ? (
  <CurriculumView
    sourceType={sidebarSource}
    onGenerateInfoShare={(ids) => setGenerateIds(ids)}  // NEW
  />
) : (
```

---

### 3.3 T4: 소스 전환 캐싱 — curation-view.tsx

#### 캐시 구조

```typescript
interface CacheEntry {
  contents: CurationContentWithLinks[];
  counts: CurationStatusCounts | null;
  timestamp: number;
}

// 캐시 키 생성
function makeCacheKey(source: string, status: string, score: string, period: string): string {
  return `${source}|${status}|${score}|${period}`;
}
```

#### 캐시 관리 (useRef)

```typescript
// curation-view.tsx 내부
const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
const CACHE_TTL = 5 * 60 * 1000; // 5분
```

#### loadContents 수정 — 캐시 체크 + stale-while-revalidate

```typescript
const loadContents = useCallback(async () => {
  const cacheKey = makeCacheKey(sourceFilter, statusFilter, scoreFilter, periodFilter);
  const cached = cacheRef.current.get(cacheKey);
  const now = Date.now();

  // 캐시 히트: 즉시 렌더
  if (cached && now - cached.timestamp < CACHE_TTL) {
    setContents(cached.contents);
    if (cached.counts) setStatusCounts(cached.counts);
    setLoading(false);
    return;
  }

  // 캐시 미스 또는 만료: API 호출
  // stale 데이터가 있으면 로딩 표시 안 함
  if (!cached) setLoading(true);

  try {
    const params: { /* ... 기존과 동일 */ } = {};
    // ... 기존 파라미터 설정 로직

    const [{ data }, counts] = await Promise.all([
      getCurationContents(params),
      getCurationStatusCounts(sourceFilter !== "all" ? sourceFilter : undefined),
    ]);

    setContents(data);
    setStatusCounts(counts);

    // 캐시 저장
    cacheRef.current.set(cacheKey, {
      contents: data,
      counts,
      timestamp: Date.now(),
    });
  } catch {
    setContents([]);
  } finally {
    setLoading(false);
  }
}, [sourceFilter, scoreFilter, periodFilter, statusFilter]);
```

#### 캐시 무효화 — 상태 변경 시

```typescript
// 캐시 무효화 함수
const invalidateCache = useCallback((source?: string) => {
  if (source) {
    // 특정 소스 관련 캐시만 삭제
    for (const key of cacheRef.current.keys()) {
      if (key.startsWith(`${source}|`) || key.startsWith("all|")) {
        cacheRef.current.delete(key);
      }
    }
  } else {
    // 전체 캐시 클리어
    cacheRef.current.clear();
  }
}, []);

// handleDismiss, handleRestore, handleGenerate, handleSoftDelete에서 호출
const handleDismiss = async (id?: string) => {
  // ... 기존 로직
  if (!error) {
    invalidateCache(sourceFilter);  // 캐시 무효화
    loadContents();
    loadCounts();
  }
};
```

#### 소스 변경 시 캐시 우선 사용

```typescript
// sourceFilter 변경 useEffect에서 캐시 체크
useEffect(() => {
  setStatusFilter("all");
  setSelectedIds(new Set());
  // loadContents는 useEffect dependency로 자동 호출됨
  // 캐시가 있으면 loadContents 내부에서 즉시 반환
}, [sourceFilter]);
```

---

### 3.4 T3: "발행됨" 상태 구분 — curation-card.tsx, curation-view.tsx

#### 생성물 연결 표시 수정

```tsx
// curation-card.tsx — 생성물 연결 영역
{linkedInfoShares.length > 0 && (
  <div className="flex items-center gap-1.5 text-xs mb-2">
    <CornerDownRight className="h-3 w-3 shrink-0 text-gray-400" />
    <span className="truncate text-gray-600">
      &quot;{linkedInfoShares[0].title}&quot;
    </span>
    {linkedInfoShares[0].status === "published" ? (
      <span className="text-green-600 shrink-0">게시 완료</span>
    ) : (
      <span className="text-orange-500 shrink-0">초안</span>
    )}
  </div>
)}
```

#### 발행됨 탭 빈 상태 메시지 개선

발행됨 탭에서 초안/게시가 구분되므로 추가 설명이 필요하지 않음. linked_info_shares의 status로 시각적 구분 충분.

---

## 4. 에러 처리

| 상황 | 에러 코드 | 사용자 메시지 | 처리 |
|------|-----------|-------------|------|
| batchUpdateCurationStatus("new") 실패 | DB error | "되돌리기에 실패했습니다." | toast.error |
| batchUpdateCurationStatus("dismissed") 실패 | DB error | "스킵 처리에 실패했습니다." | toast.error (기존) |
| 커리큘럼 발행 버튼 실패 | - | GeneratePreviewModal에서 처리 | 기존 모달 에러 핸들링 |
| 캐시 히트 후 백그라운드 갱신 실패 | Network error | (무시 - stale 데이터 유지) | 콘솔 에러만 |
| createInfoShareDraft 후 원본 상태 미변경 | - | - | 정상 동작 (원본 상태 유지) |

---

## 5. 구현 순서 — 체크리스트

### T1: 스킵 되돌리기 (독립)

- [ ] `curation.ts`: `updateCurationStatus` status union에 `"new"` 추가
- [ ] `curation.ts`: `batchUpdateCurationStatus` status union에 `"new"` 추가
- [ ] `curation-card.tsx`: `onRestore` prop 추가
- [ ] `curation-card.tsx`: `curationStatus === "dismissed"` 일 때 "되돌리기" 버튼 표시 (스킵/생성 버튼 대체)
- [ ] `curation-card.tsx`: `RotateCcw` 아이콘 import 추가
- [ ] `curation-tab.tsx`: `onRestore` prop 추가 + CurationCard에 전달
- [ ] `curation-view.tsx`: `handleRestore()` 핸들러 추가
- [ ] `curation-view.tsx`: 벌크 바 — `statusFilter === "dismissed"` 일 때 "일괄 되돌리기" 표시
- [ ] `curation-view.tsx`: CurationTab에 `onRestore` prop 전달
- [ ] `curation-view.tsx`: `RotateCcw` 아이콘 import 추가
- [ ] 빌드 확인

### T2: 커리큘럼 잠금 해제 (독립)

- [ ] `curriculum-view.tsx`: CurriculumViewProps에 `onGenerateInfoShare` prop 추가
- [ ] `curriculum-view.tsx`: CurriculumItem에 `onGenerateInfoShare` prop 전달
- [ ] `curriculum-view.tsx`: CurriculumItem 확장 영역에 "정보공유 생성" 버튼 추가
- [ ] `curriculum-view.tsx`: `publishStatus !== "published"` 조건으로 버튼 표시
- [ ] `curriculum-view.tsx`: `Button` 컴포넌트 import 추가
- [ ] `curriculum-view.tsx`: `Sparkles` 아이콘 import 추가
- [ ] `content/page.tsx`: CurriculumView에 `onGenerateInfoShare={(ids) => setGenerateIds(ids)}` 전달
- [ ] 빌드 확인

### T4: 소스 전환 캐싱 (독립)

- [ ] `curation-view.tsx`: `CacheEntry` 인터페이스 + `makeCacheKey()` 함수 정의
- [ ] `curation-view.tsx`: `cacheRef = useRef<Map<string, CacheEntry>>` 추가
- [ ] `curation-view.tsx`: `CACHE_TTL` 상수 정의 (5분)
- [ ] `curation-view.tsx`: `loadContents` 수정 — 캐시 체크 + stale-while-revalidate
- [ ] `curation-view.tsx`: `loadCounts`를 `loadContents`에 통합 (병렬 호출로 캐시 일관성)
- [ ] `curation-view.tsx`: `invalidateCache()` 함수 추가
- [ ] `curation-view.tsx`: `handleDismiss`, `handleSoftDelete`, `handleRestore`에 `invalidateCache()` 호출 추가
- [ ] `curation-view.tsx`: `handleGenerate` 후에도 캐시 무효화 필요 여부 확인 (모달 닫힐 때)
- [ ] 빌드 확인

### T3: "발행됨" 상태 구분 (마지막 — T1 의존)

- [ ] `curation.ts` `createInfoShareDraft`: 새 info_share의 `curation_status`를 `"selected"`로 변경
- [ ] `curation.ts` `createInfoShareDraft`: 원본 curation_status 업데이트 블록(L321~339) 제거
- [ ] `curation.ts` `createInfoShareDraft`: `createServiceClient()` import가 더 이상 불필요한지 확인 (다른 곳에서 사용 중이면 유지)
- [ ] `curation-card.tsx`: 생성물 연결 표시에 status 반영 ("게시 완료" / "초안")
- [ ] `curation.ts` `getInfoShareContents`: `curation_status` 필터를 `"published"`만 → `"published"` OR `"selected"` 로 확장 (info_share 목록에서 초안도 표시)
- [ ] 빌드 확인

---

## 6. 디자인 시스템 참조

| 요소 | 값 |
|------|-----|
| Primary | `#F75D5D` |
| Primary hover | `#E54949` |
| 되돌리기 버튼 | `text-blue-600 hover:text-blue-700 hover:bg-blue-50` |
| 초안 상태 텍스트 | `text-orange-500` |
| 게시 완료 텍스트 | `text-green-600` |
| 되돌리기 아이콘 | `RotateCcw` (lucide-react) |
| 생성 버튼 아이콘 | `Sparkles` (lucide-react) |
| 벌크 바 배경 | `bg-[#111827]` (기존) |
| 토스트 | sonner (기존) |
