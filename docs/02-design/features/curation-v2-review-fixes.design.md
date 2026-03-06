# 큐레이션 v2 코드 리뷰 이슈 수정 설계서

## 1. 데이터 모델
변경 없음. contents 테이블 기존 컬럼 활용 (ai_summary, curation_status, importance_score).

## 2. API 설계
변경 없음. 기존 backfill API 라우트 보강만.

## 3. 컴포넌트 구조

### T1: auth-utils.ts 타입 수정
```typescript
// Before
import type { SupabaseClient } from "@supabase/supabase-js";
export async function requireStaff(): Promise<SupabaseClient> { ... }
export async function requireAdmin(): Promise<SupabaseClient> { ... }

// After
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
export async function requireStaff(): Promise<SupabaseClient<Database>> { ... }
export async function requireAdmin(): Promise<SupabaseClient<Database>> { ... }
```

### T1: curation.ts as any 제거
- `(supabase as any)` → `supabase` 직접 사용 (15곳)
- `eslint-disable` 주석 제거 (15곳)
- `const s = supabase as any;` → `const s = supabase;` (2곳)

### T2: 빈 본문 가드
```typescript
// backfillAiSummary() 루프 시작부
const text = (row.body_md || "").slice(0, 3000);
if (!text.trim()) {
  failed++;
  errors.push(`${row.id}: 빈 본문 skip`);
  continue;
}

// backfillImportanceScore() AI 분기 내부
const text = (row.body_md || "").slice(0, 2000);
if (!text.trim()) {
  failed++;
  errors.push(`${row.id}: 빈 본문 skip`);
  continue;
}
```

### T3: 서버액션 인증 + API try-catch
```typescript
// backfillAiSummary(), backfillImportanceScore()
// createServiceClient() → auth-utils의 requireAdmin() 사용
import { requireAdmin } from "@/lib/auth-utils";
const supabase = await requireAdmin(); // SupabaseClient<Database> 반환 + 권한 체크

// route.ts: req.json() try-catch
try {
  const body = await req.json();
} catch {
  return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
}
```

### T4: 커리큘럼 발행 상태
```typescript
type PublishStatus = "published" | "next" | "locked";

function getPublishStatuses(items: Content[]): Map<string, PublishStatus> {
  const statuses = new Map<string, PublishStatus>();
  let foundNext = false;
  for (const item of items) {
    if (item.curation_status === "published" && !!item.ai_summary) {
      statuses.set(item.id, "published");
    } else if (!foundNext) {
      statuses.set(item.id, "next");
      foundNext = true;
    } else {
      statuses.set(item.id, "locked");
    }
  }
  return statuses;
}
```

UI 뱃지:
- 발행됨: CheckCircle 아이콘 + 녹색 뱃지
- 다음 발행: ArrowRight 아이콘 + 주황색 뱃지
- 잠금: Lock 아이콘 + 회색 뱃지

## 4. 에러 처리
- T2: 빈 본문 → failed++ + errors 배열에 사유 기록
- T3: 미인증 → throw Error (auth-utils), API → 401/400

## 5. 구현 순서
1. [x] auth-utils.ts 반환 타입 수정
2. [x] curation.ts as any 제거 + eslint-disable 제거
3. [x] curation.ts 빈 본문 가드 추가
4. [x] curation.ts 백필 함수 requireAdmin() 적용
5. [x] backfill/route.ts try-catch 추가
6. [x] curriculum-view.tsx 발행 상태 UI 추가
7. [x] tsc + build 검증
