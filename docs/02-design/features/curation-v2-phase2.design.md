# 큐레이션 v2 Phase 2 설계서 — 인박스 리뉴얼 + 토픽맵 + Soft Delete

> Plan: `docs/01-plan/features/curation-v2-phase2.plan.md`
> Phase 0+1 Design: `docs/02-design/features/curation-v2-p0p1.design.md`

---

## 1. 데이터 모델

### 1.1 DB 변경 — deleted_at 컬럼 추가 (T3)

```sql
-- contents 테이블에 soft delete 컬럼 추가
ALTER TABLE contents ADD COLUMN deleted_at timestamptz DEFAULT NULL;

-- 삭제된 콘텐츠 조회 성능을 위한 부분 인덱스
CREATE INDEX idx_contents_deleted_at
  ON contents (deleted_at)
  WHERE deleted_at IS NOT NULL;
```

- `deleted_at IS NULL` = 활성 상태 (삭제 안 됨)
- `deleted_at IS NOT NULL` = 소프트 삭제됨
- `curation_status` enum은 변경하지 않음 (deleted_at과 독립 관리)

### 1.2 Cron — 30일 자동 영구 삭제

```sql
-- Cron에서 실행할 쿼리
DELETE FROM contents
WHERE deleted_at IS NOT NULL
  AND deleted_at < now() - interval '30 days';
```

- Vercel Cron: 매일 04:00 KST (UTC 19:00)
- `vercel.json` 설정:
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-deleted",
      "schedule": "0 19 * * *"
    }
  ]
}
```

### 1.3 타입 변경 — Content 인터페이스

```typescript
// src/types/content.ts — 추가 필드
export interface Content {
  // ... 기존 필드 유지
  deleted_at: string | null;  // T3: soft delete timestamp
}
```

### 1.4 생성물 연결 데이터 구조 (T1)

기존 `contents` 테이블의 `source_ref` 필드를 활용한 self-join.
정보공유(source_type='info_share')의 source_ref에는 원본 콘텐츠 id가 콤마로 저장됨.

```typescript
// 생성물 연결 정보
interface LinkedInfoShare {
  id: string;
  title: string;
  status: string;
}

// 카드에 전달할 확장 타입
interface CurationContentWithLinks extends Content {
  linked_info_shares: LinkedInfoShare[];
}
```

역추적 전략: getCurationContents에서 info_share 타입 콘텐츠를 별도 조회 후, source_ref 파싱하여 Map<원본id, LinkedInfoShare[]> 구성.

---

## 2. API 설계

### 2.1 기존 서버 액션 수정

#### getCurationContents (수정)

```typescript
// src/actions/curation.ts
export async function getCurationContents({
  source,
  minScore,
  period,
  showDismissed = false,
  curationStatus,    // NEW: 상태 필터 ('new' | 'selected' | 'dismissed' | 'published')
  page = 1,
  pageSize = 100,
}: {
  source?: string;
  minScore?: number;
  period?: string;
  showDismissed?: boolean;
  curationStatus?: string;  // NEW
  page?: number;
  pageSize?: number;
} = {}): Promise<{
  data: CurationContentWithLinks[];  // 생성물 연결 포함
  count: number;
  error: string | null;
}>
```

변경사항:
1. `deleted_at IS NULL` 조건 추가 (T3)
2. `curationStatus` 파라미터로 상태 필터링 (T2)
3. 응답에 `linked_info_shares` 포함 (T1)

#### 생성물 연결 조회 로직 (T1)

```typescript
// getCurationContents 내부에서 실행
async function getLinkedInfoShares(
  supabase: SupabaseClient,
  contentIds: string[]
): Promise<Map<string, LinkedInfoShare[]>> {
  // info_share 타입 콘텐츠 중 source_ref에 해당 id가 포함된 것 조회
  const { data: infoShares } = await supabase
    .from("contents")
    .select("id, title, status, source_ref")
    .eq("source_type", "info_share")
    .not("source_ref", "is", null);

  const linkMap = new Map<string, LinkedInfoShare[]>();

  for (const share of infoShares || []) {
    const sourceIds = (share.source_ref || "").split(",").map(s => s.trim());
    for (const sourceId of sourceIds) {
      if (contentIds.includes(sourceId)) {
        if (!linkMap.has(sourceId)) linkMap.set(sourceId, []);
        linkMap.get(sourceId)!.push({
          id: share.id,
          title: share.title,
          status: share.status,
        });
      }
    }
  }

  return linkMap;
}
```

### 2.2 신규 서버 액션

#### getCurationStatusCounts (T2)

```typescript
export async function getCurationStatusCounts(
  source?: string
): Promise<{
  total: number;
  new: number;
  selected: number;
  dismissed: number;
  published: number;
}>
```

- source 필터 적용
- `deleted_at IS NULL` 조건
- `source_type != 'info_share'` 조건
- 4개 상태별 count 쿼리 병렬 실행

#### softDeleteContents (T3)

```typescript
export async function softDeleteContents(
  ids: string[]
): Promise<{ error: string | null }>
```

- `requireStaff()` 인증
- `deleted_at = new Date().toISOString()` 설정
- `revalidatePath("/admin/content")`

#### restoreContents (T3)

```typescript
export async function restoreContents(
  ids: string[]
): Promise<{ error: string | null }>
```

- `requireStaff()` 인증
- `deleted_at = null` 설정
- `revalidatePath("/admin/content")`

#### getDeletedContents (T3)

```typescript
export async function getDeletedContents(
  source?: string
): Promise<{ data: Content[]; count: number; error: string | null }>
```

- `deleted_at IS NOT NULL` 조건
- `source_type != 'info_share'` 조건
- `deleted_at DESC` 정렬 (최근 삭제 순)

### 2.3 Cron API (T3)

```typescript
// src/app/api/cron/cleanup-deleted/route.ts
export async function GET(request: Request) {
  // 1. CRON_SECRET 검증
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. 30일 지난 삭제 콘텐츠 영구 삭제
  const supabase = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data, error } = await supabase
    .from("contents")
    .delete()
    .lt("deleted_at", thirtyDaysAgo)
    .select("id");

  // 3. 결과 반환
  return Response.json({
    deleted: data?.length || 0,
    error: error?.message || null,
  });
}
```

---

## 3. 컴포넌트 구조

### 3.1 컴포넌트 트리

```
content/page.tsx
  TabsContent[curation]
    PipelineSidebar (기존 유지)
    조건부:
      blueprint|lecture -> CurriculumView (기존 유지)
      그 외 -> CurationView (NEW - T2)
                ├── 상태 필터 탭 (StatusFilterTabs)
                ├── 뷰 토글 (ViewToggle: 인박스 | 토픽맵)
                ├── 인박스 뷰: CurationTab (수정 - 카드 v2 사용)
                │     └── CurationCard v2 (수정 - T1)
                ├── 토픽맵 뷰: TopicMapView (NEW - T2)
                │     ├── TopicGroup (접기/펼치기)
                │     │     └── CurationCard v2
                │     └── "미분류" TopicGroup
                ├── 벌크 바 (BulkActionBar)
                └── DeletedSection (NEW - T3)
```

### 3.2 CurationCard v2 (T1) — `curation-card.tsx` 리뉴얼

#### Props 변경

```typescript
interface CurationCardProps {
  id: string;
  title: string;
  aiSummary: string | null;
  bodyMd: string | null;
  importanceScore: number;
  keyTopics: string[];
  sourceType: string | null;
  sourceRef: string | null;
  createdAt: string;
  curationStatus: string;           // NEW: 상태 표시용
  linkedInfoShares: LinkedInfoShare[];  // NEW: 생성물 연결
  selected: boolean;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;        // NEW: 개별 스킵
  onGenerate: (id: string) => void;       // NEW: 개별 정보공유 생성
  onOpenOriginal?: (url: string) => void; // NEW: 원문 보기
}
```

#### 레이아웃 구조

```
┌─ [Checkbox] [SourceIcon] 제목                    [Stars] [수집일] ─┐
│                                                                     │
│  ┌─ AI 핵심요약 ─────────────────────────────────────────────┐     │
│  │ * 요약 불릿 1                                               │     │
│  │ * 요약 불릿 2                                               │     │
│  │ * 요약 불릿 3                                               │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                     │
│  (생성물 연결 - 있을 때만)                                          │
│  ↳ "글 제목" 발행됨                                                │
│                                                                     │
│  [토픽1] [토픽2] [토픽3]                                           │
│  ──────────────────────────────────────────────────────────────── │
│  도메인명 * M/d            [원문 보기] [스킵] [정보공유 생성]       │
└─────────────────────────────────────────────────────────────────┘
```

#### AI 요약 표시 로직

```typescript
function formatSummary(aiSummary: string | null): string[] {
  if (!aiSummary) return [];

  // 이미 불릿 형태인 경우 (*, -, ., 숫자.) 줄별 분리
  const lines = aiSummary.split("\n").filter(l => l.trim());

  if (lines.length >= 2) {
    // 불릿 마커 제거 후 반환
    return lines.slice(0, 3).map(l =>
      l.replace(/^[\s]*[*\-\d.]+[\s]*/, "").trim()
    );
  }

  // 단일 문장이면 그대로 1줄 반환
  return [aiSummary.trim()];
}
```

- 요약 있음: 불릿 리스트로 렌더링 (최대 3줄)
- 요약 없음: "AI 분석 대기중" 회색 이탤릭 안내

#### 수집일 표시

```typescript
// "3/6" 형식
const dateStr = new Date(createdAt).toLocaleDateString("ko-KR", {
  month: "numeric",
  day: "numeric",
});
```

#### 도메인 추출

```typescript
function extractDomain(sourceRef: string | null): string | null {
  if (!sourceRef) return null;
  try {
    const url = new URL(sourceRef);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
```

#### 생성물 연결 표시

```tsx
{linkedInfoShares.length > 0 && (
  <div className="flex items-center gap-1.5 text-xs text-green-700 mt-2">
    <CornerDownRight className="h-3 w-3 shrink-0" />
    <Link
      href={`/admin/content/${linkedInfoShares[0].id}?from=curation`}
      className="hover:underline truncate"
      onClick={(e) => e.stopPropagation()}
    >
      &quot;{linkedInfoShares[0].title}&quot;
    </Link>
    <span className="text-green-600 shrink-0">발행됨</span>
  </div>
)}
```

#### 인라인 액션 버튼

```tsx
<div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
  <div className="flex items-center gap-1 text-xs text-gray-400">
    {domain && <span>{domain}</span>}
    {domain && <span>*</span>}
    <span>{dateStr}</span>
  </div>
  <div className="flex gap-1.5">
    {sourceRef && (
      <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-gray-500">
        <ExternalLink className="h-3 w-3 mr-1" />
        원문 보기
      </Button>
    )}
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
  </div>
</div>
```

### 3.3 CurationView (T2) — `curation-view.tsx` 신규

#### Props

```typescript
interface CurationViewProps {
  sourceFilter: string;  // 사이드바에서 선택된 소스 ("all" | "crawl" | "youtube" | ...)
  onGenerateInfoShare: (selectedIds: string[]) => void;
}
```

#### 상태

```typescript
const [viewMode, setViewMode] = useState<"inbox" | "topicmap">("inbox");
const [statusFilter, setStatusFilter] = useState<string>("all");
const [statusCounts, setStatusCounts] = useState<StatusCounts | null>(null);
const [contents, setContents] = useState<CurationContentWithLinks[]>([]);
const [deletedContents, setDeletedContents] = useState<Content[]>([]);
const [loading, setLoading] = useState(true);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

#### 레이아웃 구조

```
┌─ 상태 필터 탭 ───────────────────────────────────────────────────┐
│ [전체 48] [신규 12] [생성됨 8] [발행됨 18] [스킵 3]               │
└─────────────────────────────────────────────────────────────────┘

┌─ 필터 바 + 뷰 토글 ─────────────────────────────────────────────┐
│ [중요도 v] [기간 v]                    [인박스] [토픽맵]          │
└─────────────────────────────────────────────────────────────────┘

┌─ 콘텐츠 영역 (인박스 OR 토픽맵) ──────────────────────────────────┐
│  ...                                                              │
└─────────────────────────────────────────────────────────────────┘

┌─ 벌크 바 (선택 시 표시) ──────────────────────────────────────────┐
│ ✓ 2개 선택됨     [삭제] [일괄 스킵] [정보공유 생성]               │
└─────────────────────────────────────────────────────────────────┘

┌─ 삭제된 콘텐츠 (접힌 섹션) ──────────────────────────────────────┐
│ 🗑 삭제된 콘텐츠 (3건)  [v 펼치기]                                │
└─────────────────────────────────────────────────────────────────┘
```

#### 상태 필터 탭

```tsx
const STATUS_TABS = [
  { key: "all", label: "전체" },
  { key: "new", label: "신규" },
  { key: "selected", label: "생성됨" },
  { key: "published", label: "발행됨" },
  { key: "dismissed", label: "스킵" },
] as const;
```

- 각 탭에 카운트 뱃지 표시
- 활성 탭: `border-b-2 border-[#F75D5D] text-[#F75D5D]`

#### 뷰 토글

```tsx
<div className="flex border rounded-lg overflow-hidden">
  <button
    className={`px-3 py-1.5 text-xs font-medium ${
      viewMode === "inbox" ? "bg-[#F75D5D] text-white" : "text-gray-600 hover:bg-gray-50"
    }`}
    onClick={() => setViewMode("inbox")}
  >
    <List className="h-3.5 w-3.5 mr-1 inline" />
    인박스
  </button>
  <button
    className={`px-3 py-1.5 text-xs font-medium ${
      viewMode === "topicmap" ? "bg-[#F75D5D] text-white" : "text-gray-600 hover:bg-gray-50"
    }`}
    onClick={() => setViewMode("topicmap")}
  >
    <FolderTree className="h-3.5 w-3.5 mr-1 inline" />
    토픽맵
  </button>
</div>
```

### 3.4 TopicMapView (T2) — `topic-map-view.tsx` 신규

#### Props

```typescript
interface TopicMapViewProps {
  contents: CurationContentWithLinks[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  onGenerate: (id: string) => void;
}
```

#### 토픽 그룹핑 로직

```typescript
interface TopicGroup {
  topic: string;
  items: CurationContentWithLinks[];
}

function groupByTopic(contents: CurationContentWithLinks[]): TopicGroup[] {
  const groups: Record<string, CurationContentWithLinks[]> = {};

  for (const item of contents) {
    // key_topics[0] 기준 1차 그룹 (MVP)
    const topic = (item.key_topics && item.key_topics.length > 0)
      ? item.key_topics[0]
      : "미분류";

    if (!groups[topic]) groups[topic] = [];
    groups[topic].push(item);
  }

  // 콘텐츠 수 내림차순 정렬, "미분류"는 항상 마지막
  return Object.entries(groups)
    .sort(([a, itemsA], [b, itemsB]) => {
      if (a === "미분류") return 1;
      if (b === "미분류") return -1;
      return itemsB.length - itemsA.length;
    })
    .map(([topic, items]) => ({ topic, items }));
}
```

#### 토픽 그룹 컴포넌트

```tsx
function TopicGroupSection({
  group,
  defaultOpen = true,
  selectedIds,
  onToggleSelect,
  onDismiss,
  onGenerate,
}: {
  group: TopicGroup;
  defaultOpen?: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onDismiss: (id: string) => void;
  onGenerate: (id: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 토픽 헤더 */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#F75D5D]" />
          <span className="text-sm font-semibold text-[#111827]">{group.topic}</span>
          <Badge variant="secondary" className="text-[10px] h-5">
            {group.items.length}
          </Badge>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {/* 카드 리스트 */}
      {open && (
        <div className="p-3 space-y-2">
          {group.items.map((item) => (
            <CurationCard
              key={item.id}
              {...mapContentToCardProps(item)}
              selected={selectedIds.has(item.id)}
              onToggle={onToggleSelect}
              onDismiss={onDismiss}
              onGenerate={onGenerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### 3.5 DeletedSection (T3) — `deleted-section.tsx` 신규

#### Props

```typescript
interface DeletedSectionProps {
  sourceFilter: string;
  onRestore: () => void;  // 복원 후 상위 데이터 새로고침
}
```

#### 레이아웃

```
┌─ 삭제된 콘텐츠 (3건)                         [전체 복원] [v] ─┐
│                                                                 │
│  (펼침 시)                                                      │
│  ┌─ 제목 1                              [복원] ─┐              │
│  │  삭제일: 3/5 (25일 후 영구 삭제)              │              │
│  └───────────────────────────────────────────┘              │
│  ┌─ 제목 2                              [복원] ─┐              │
│  │  삭제일: 3/1 (21일 후 영구 삭제)              │              │
│  └───────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

#### 남은 기간 계산

```typescript
function daysUntilPermanentDelete(deletedAt: string): number {
  const deletedDate = new Date(deletedAt);
  const permanentDate = new Date(deletedDate.getTime() + 30 * 86400000);
  const now = new Date();
  return Math.max(0, Math.ceil((permanentDate.getTime() - now.getTime()) / 86400000));
}
```

### 3.6 content/page.tsx 수정 (T2)

기존 CurationTab 직접 사용을 CurationView로 교체:

```tsx
// Before
{sidebarSource === "blueprint" || sidebarSource === "lecture" ? (
  <CurriculumView sourceType={sidebarSource} />
) : (
  <CurationTab
    onGenerateInfoShare={(ids) => setGenerateIds(ids)}
    externalSourceFilter={sidebarSource}
  />
)}

// After
{sidebarSource === "blueprint" || sidebarSource === "lecture" ? (
  <CurriculumView sourceType={sidebarSource} />
) : (
  <CurationView
    sourceFilter={sidebarSource}
    onGenerateInfoShare={(ids) => setGenerateIds(ids)}
  />
)}
```

import 추가: `CurationView` from `@/components/curation/curation-view`
import 제거: `CurationTab` (CurationView 내부에서 사용)

---

## 4. 에러 처리

| 상황 | 에러 코드 | 사용자 메시지 | 처리 |
|------|-----------|-------------|------|
| getCurationContents 실패 | DB error | "콘텐츠를 불러올 수 없습니다" | toast.error + 빈 목록 |
| softDeleteContents 실패 | DB error | "삭제에 실패했습니다" | toast.error |
| restoreContents 실패 | DB error | "복원에 실패했습니다" | toast.error |
| 생성물 조회 실패 | DB error | (무시) | linked_info_shares = [] |
| Cron CRON_SECRET 불일치 | 401 | - | JSON { error: "Unauthorized" } |
| Cron 영구 삭제 실패 | DB error | - | JSON { error: message } |
| key_topics 빈 배열 | - | - | 토픽맵에서 "미분류" 그룹 |
| aiSummary null | - | "AI 분석 대기중" | 이탤릭 안내 텍스트 |
| sourceRef URL 파싱 실패 | - | - | 도메인 미표시 (null) |
| 소스별 빈 상태 | - | 소스에 맞는 안내 문구 | 빈 상태 일러스트 + 문구 |

### 빈 상태 핸들링

```typescript
const EMPTY_STATE_MESSAGES: Record<string, { title: string; desc: string }> = {
  all: { title: "새로운 콘텐츠가 없습니다", desc: "크롤러가 수집한 콘텐츠가 여기에 표시됩니다." },
  youtube: { title: "YouTube 콘텐츠가 없습니다", desc: "YouTube 소스가 수집되면 여기에 표시됩니다." },
  crawl: { title: "블로그 콘텐츠가 없습니다", desc: "블로그 크롤링 결과가 여기에 표시됩니다." },
  marketing_theory: { title: "마케팅원론 콘텐츠가 없습니다", desc: "마케팅원론 소스가 등록되면 여기에 표시됩니다." },
  // 기타 소스별 메시지
};
```

---

## 5. 구현 순서 — 체크리스트

### T1: 카드 v2 (의존성: 없음)

- [ ] `curation.ts`: getLinkedInfoShares 헬퍼 함수 작성
- [ ] `curation.ts`: getCurationContents에 생성물 연결 데이터 추가 (info_share source_ref 역추적)
- [ ] `curation-card.tsx`: Props 확장 (linkedInfoShares, onDismiss, onGenerate, curationStatus)
- [ ] `curation-card.tsx`: AI 요약 항상 펼침 (expanded 상태 제거, formatSummary 불릿 파싱)
- [ ] `curation-card.tsx`: 요약 null -> "AI 분석 대기중" 안내
- [ ] `curation-card.tsx`: 생성물 연결 표시 (CornerDownRight 아이콘 + 링크)
- [ ] `curation-card.tsx`: 소스 출처 (도메인 + 수집일 M/d)
- [ ] `curation-card.tsx`: 인라인 액션 버튼 3개 (원문 보기, 스킵, 정보공유 생성)
- [ ] `curation-tab.tsx`: CurationCard에 새 props 전달 (onDismiss, onGenerate, linkedInfoShares)
- [ ] 빌드 확인

### T2: 큐레이션 뷰 리뉴얼 (의존성: T1)

- [ ] `curation.ts`: getCurationStatusCounts 서버 액션 추가
- [ ] `curation.ts`: getCurationContents에 curationStatus 필터 파라미터 추가
- [ ] `curation-view.tsx`: 신규 파일 — CurationView 컴포넌트
  - [ ] 상태 필터 탭 (StatusFilterTabs)
  - [ ] 뷰 토글 (인박스/토픽맵)
  - [ ] 인박스 뷰 렌더링 (CurationTab 활용)
  - [ ] 토픽맵 뷰 렌더링 (TopicMapView)
  - [ ] 벌크 바 (선택 관리 + 일괄 액션)
  - [ ] 빈 상태 핸들링
- [ ] `topic-map-view.tsx`: 신규 파일 — TopicMapView 컴포넌트
  - [ ] groupByTopic 함수 (key_topics[0] 기준)
  - [ ] TopicGroupSection (접기/펼치기)
  - [ ] "미분류" 그룹
- [ ] `curation-tab.tsx`: 인박스 뷰 역할로 축소 (필터/벌크 바를 CurationView로 이동)
- [ ] `content/page.tsx`: CurationView 사용으로 교체
- [ ] 빌드 확인

### T3: Soft Delete + 삭제 콘텐츠 복원 (의존성: T2)

- [ ] DB 마이그레이션: `ALTER TABLE contents ADD COLUMN deleted_at timestamptz DEFAULT NULL`
- [ ] DB 마이그레이션: `CREATE INDEX idx_contents_deleted_at ON contents (deleted_at) WHERE deleted_at IS NOT NULL`
- [ ] `content.ts`: Content 인터페이스에 `deleted_at: string | null` 추가
- [ ] `curation.ts`: softDeleteContents 서버 액션 추가
- [ ] `curation.ts`: restoreContents 서버 액션 추가
- [ ] `curation.ts`: getDeletedContents 서버 액션 추가
- [ ] `curation.ts`: getCurationContents에 `deleted_at IS NULL` 조건 추가
- [ ] `curation.ts`: getCurationStatusCounts에 `deleted_at IS NULL` 조건 추가
- [ ] `deleted-section.tsx`: 신규 파일 — 삭제된 콘텐츠 아코디언 섹션
  - [ ] 접힌 상태 기본 + 펼침 시 카드 리스트
  - [ ] 개별 복원 버튼
  - [ ] 전체 복원 버튼
  - [ ] 남은 일수 표시 ("N일 후 영구 삭제")
- [ ] `curation-view.tsx`: 하단에 DeletedSection 통합
- [ ] `curation-view.tsx`: 벌크 바에 "삭제" 버튼 추가
- [ ] `cleanup-deleted/route.ts`: 신규 — Cron 엔드포인트
  - [ ] CRON_SECRET 인증
  - [ ] 30일 지난 deleted_at 레코드 영구 DELETE
  - [ ] 결과 JSON 반환
- [ ] `vercel.json`: cron 스케줄 추가 (매일 19:00 UTC = 04:00 KST)
- [ ] 빌드 확인

---

## 6. 디자인 시스템 참조

| 요소 | 값 |
|------|-----|
| Primary | `#F75D5D` |
| Primary hover | `#E54949` |
| Background | `#f8f9fc` |
| Card | `#fff` |
| Border | `#e2e8f0` (gray-200) |
| Text main | `#1a1a1a` (foreground) / `#111827` (gray-900) |
| Text muted | `#64748b` (gray-500) |
| Text faint | `#9ca3af` (gray-400) |
| Font | Pretendard |
| Radius | `0.75rem` |
| Active tab/button | `bg-[#F75D5D] text-white` 또는 `border-[#F75D5D] text-[#F75D5D]` |
| 토스트 | sonner |
| 아이콘 | lucide-react |
| AI 요약 배경 | `bg-blue-50/50` 또는 `bg-gray-50` (카드 내) |
| 생성물 연결 색상 | `text-green-700` |
| 삭제 섹션 색상 | `text-red-500` (아이콘), `bg-red-50` (배경) |
