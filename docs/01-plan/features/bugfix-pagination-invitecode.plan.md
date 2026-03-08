# 버그 수정: 경쟁사 분석기 페이지네이션 + 초대코드 사용량 — Plan

> 작성일: 2026-03-08
> 타입: 분석/리뷰 (코드 수정 금지)

---

## 개요

4차 수정 후에도 미해결된 2건의 버그에 대한 근본 원인 분석.

---

## 버그 1: 경쟁사 분석기 더보기 (페이지네이션) 실패

### 현상
- 30개 광고 표시 후 "더보기 (30/55)" 버튼 클릭
- 추가 광고가 나오지 않음
- SearchAPI.io 에러: `"Either q or page_id or location_id must be present"`

### 관련 파일 전체 목록
| 파일 | 역할 |
|------|------|
| `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` | handleLoadMore (줄 100-162), handleSearch (줄 67-97), handleBrandSelect (줄 196-228) |
| `src/app/(main)/protractor/competitor/components/ad-card-list.tsx` | 더보기 버튼 UI (줄 249-275) |
| `src/app/api/competitor/search/route.ts` | GET API 라우트 (줄 24-122) |
| `src/lib/competitor/meta-ad-library.ts` | searchMetaAds — SearchAPI.io 호출 (줄 144-221) |
| `src/lib/competitor/brand-dictionary.ts` | 한글→영문 변환 (lookupBrand, suggestEnglishName) |

### 데이터 흐름 추적

```
[프론트] 더보기 클릭
  → handleLoadMore() (competitor-dashboard.tsx:100)
  → URLSearchParams({ page_token: currentToken })  ← ⚠️ page_token만 전송
  → fetch("/api/competitor/search?page_token=XXX")

[API Route] search/route.ts:24
  → q = undefined, pageToken = "XXX", pageId = undefined
  → 검증 통과 (줄 37: !q && !pageId && !pageToken → false)
  → searchMetaAds({ searchTerms: "", pageToken: "XXX", searchPageIds: undefined })

[SearchAPI.io 호출] meta-ad-library.ts:158-182
  → if (params.pageToken) 분기 진입 (줄 162)
  → URL 파라미터: engine=meta_ad_library & api_key=XXX & page_token=XXX
  → ⛔ q/page_id/location_id 없음!

[SearchAPI.io 응답]
  → 400: "Either q or page_id or location_id must be present"

[에러 처리] meta-ad-library.ts:195-201
  → MetaAdError("검색 API 호출 실패: ...", "SEARCH_API_ERROR") throw

[프론트] competitor-dashboard.tsx:121-123
  → toast.error("더보기에 실패했습니다")
```

### 근본 원인 🔴

**`meta-ad-library.ts` 줄 162-166에서 `pageToken`이 있을 때 `page_token`만 전송하고 `q`/`page_id`를 제거한 것이 원인.**

SearchAPI.io meta_ad_library 엔진은 **`page_token`만으로는 요청을 수락하지 않는다.**
최소한 `q` 또는 `page_id` 중 하나가 반드시 포함되어야 한다.

이전 코드(3차 수정 전)에서는 `q`/`page_id`를 함께 보냈지만, `country`, `ad_active_status` 등 다른 파라미터까지 보내서 SearchAPI.io가 새 쿼리로 해석 → 첫 페이지 반환 → 중복만 발생했다.

4차 수정에서 이를 해결하려고 `page_token`만 보내는 방식으로 바꿨으나, 이번에는 SearchAPI.io 필수 파라미터 검증에 걸린 것.

**두 수정 모두 절반만 맞았다:**
- 3차: q/page_id 포함 ✅ + 불필요한 파라미터 포함 ❌ → 중복 반환
- 4차: 불필요한 파라미터 제거 ✅ + q/page_id까지 제거 ❌ → API 거부

### 수정 방안

**`src/lib/competitor/meta-ad-library.ts` 줄 162-182**

```typescript
// 현재 (버그):
if (params.pageToken) {
  url.searchParams.set("page_token", params.pageToken);
  // q/page_id 없음 → SearchAPI.io 거부
} else {
  // 새 검색 로직
}

// 수정안:
if (params.pageToken) {
  url.searchParams.set("page_token", params.pageToken);
  // SearchAPI.io는 page_token 사용 시에도 q 또는 page_id 필수
  // 단, country/ad_active_status 등 다른 파라미터는 보내지 않아야
  // SearchAPI.io가 새 쿼리로 해석하지 않음
  if (params.searchPageIds) {
    url.searchParams.set("page_id", params.searchPageIds);
  } else if (params.searchTerms) {
    url.searchParams.set("q", params.searchTerms);
  }
} else {
  // 새 검색 로직 (기존 유지)
}
```

**`src/app/(main)/protractor/competitor/competitor-dashboard.tsx` 줄 113-118**

현재 `handleLoadMore`는 `page_token`만 보내는데, 원래 검색어(q) 또는 page_id도 함께 보내야 한다:

```typescript
// 현재 (버그):
const fetchParams = new URLSearchParams({
  page_token: currentToken,
});

// 수정안:
const fetchParams = new URLSearchParams({
  page_token: currentToken,
});
// 원래 검색 컨텍스트 복원 (SearchAPI.io 필수)
if (searchPageId) {
  fetchParams.set("page_id", searchPageId);
} else if (searchQuery) {
  fetchParams.set("q", searchQuery);
}
```

**API route (`search/route.ts`)는 수정 불필요** — 이미 q/page_id/page_token 모두 파싱하고 있음.

### 성공 기준
- [ ] 키워드 검색 후 더보기 → 추가 광고 append
- [ ] 브랜드(page_id) 검색 후 더보기 → 추가 광고 append
- [ ] 중복 광고 자동 제거
- [ ] SearchAPI.io 에러 없음

---

## 버그 2: 초대코드 사용량(used_count) 소진 안 됨

### 현상
- bs-06 코드로 2명이 가입했는데 used_count가 0/50 그대로
- 만료일(expires_at) 지나도 자동 비활성화 안 됨

### 관련 파일 전체 목록
| 파일 | 역할 |
|------|------|
| `src/app/(auth)/signup/page.tsx` | 가입 폼 + consumeInviteCode 호출 (줄 352-366) |
| `src/app/api/invite/validate/route.ts` | 초대코드 검증 API (읽기만, used_count 미증가) |
| `src/actions/invites.ts` | useInviteCode 서버 액션 (줄 9-122) — used_count 증가 담당 |
| `src/app/(main)/admin/invites/page.tsx` | 관리자 초대코드 UI (사용량 표시) |
| `src/types/database.ts` | invite_codes 타입 (줄 1089-1129) |

### 데이터 흐름 추적

```
[프론트] 가입 폼에서 초대코드 입력
  → onBlur → validateInviteCode() (signup/page.tsx:201)
  → GET /api/invite/validate?code=bs-06
  → 유효하면 isStudentMode = true, inviteCohort = "6기"
  → (이 단계에서는 used_count 미증가 — 검증만)

[프론트] 가입 버튼 클릭
  → supabase.auth.signUp() → auth user 생성
  → if (isStudentMode && inviteCode.trim()) 조건 확인 (줄 352)
  → consumeInviteCode(userId, email, "bs-06") 호출 (줄 354)

[서버 액션] invites.ts:useInviteCode (줄 9-122)
  → createServiceClient() — RLS 우회
  → invite_codes 테이블에서 bs-06 조회 (줄 23-27)
  → 만료 체크 (줄 34), 사용량 체크 (줄 42)
  → used_count 업데이트 (줄 50-83):
    let updateQuery = svc.from("invite_codes")
      .update({ used_count: currentUsed + 1 })
      .ilike("code", "bs-06");
    → .eq("used_count", currentUsed) 추가 (낙관적 잠금)
    → .select("code").maybeSingle() 실행
  → 실패 시 폴백 (줄 70-83): WHERE 없이 직접 업데이트
  → profiles 업데이트 (줄 86-97)
  → student_registry 매칭 (줄 99-115)
```

### 근본 원인 분석 🔴

**4차 수정 (`const → let` 변경)은 올바르지만, 기존에 가입한 2명의 used_count는 이미 0으로 남아있다.**

#### 원인 A: 이전 버그의 잔재 (데이터 미수정)
3차 수정 전 코드에서 `const updateBuilder`로 선언하여 `.eq()` 재할당이 무시됨 → used_count가 절대 증가하지 않음. 4차에서 `let`으로 고쳤지만, **이미 가입한 2명의 used_count는 DB에 0으로 남아있다.** 수동 DB 수정이 필요.

#### 원인 B: silent failure (조용한 실패)
```typescript
// signup/page.tsx 줄 359-365
if (inviteResult?.error) {
  console.error("[signup] consumeInviteCode returned error:", inviteResult.error);
  // 에러가 발생해도 사용자에게 보여주지 않음!
}
// ...
} catch (inviteErr) {
  console.error("[signup] consumeInviteCode failed:", inviteErr);
  // 초대코드 처리 실패해도 가입은 완료 — 리다이렉트 계속 진행
}
```

**초대코드 사용 처리가 실패해도 가입은 성공하고, 에러는 console에만 기록된다.**
서버 로그를 확인하지 않으면 실패 여부를 알 수 없다.

#### 원인 C: 만료 자동 처리 미구현 🔴
DB 스키마에 `is_active` 필드 없음. 자동 비활성화 메커니즘 전무:

| 체크 포인트 | 구현 여부 |
|-------------|-----------|
| 가입 시 expires_at 만료 체크 | ✅ (invites.ts:34, validate/route.ts:51) |
| 가입 시 used_count 한도 체크 | ✅ (invites.ts:42, validate/route.ts:57) |
| DB 자동 만료 (Cron/Trigger) | ❌ 미구현 |
| is_active 필드 | ❌ 없음 |
| 관리자 UI 만료 표시 | ⚠️ 클라이언트 계산만 (isExpired 함수) |

**만료 처리는 검증 시점(가입 시)에만 체크한다.** 만료된 코드가 관리자 목록에서 "만료"로 표시되는 것은 순전히 프론트 JS 계산 (`new Date(expiresAt) < new Date()`)이며, DB에는 아무 변화 없다.

### 수정 방안

#### 1. DB 데이터 수동 수정 (즉시)
```sql
-- bs-06 코드로 가입한 사용자 수 확인
SELECT COUNT(*) FROM profiles WHERE invite_code_used ILIKE 'bs-06';

-- 실제 사용량으로 맞추기
UPDATE invite_codes
SET used_count = (SELECT COUNT(*) FROM profiles WHERE invite_code_used ILIKE 'bs-06')
WHERE code ILIKE 'bs-06';
```

#### 2. silent failure 해소 (`signup/page.tsx`)
```typescript
// 현재: console.error만 → 사용자 모름
// 수정: 관리자에게 알림 or 로그 테이블 INSERT
```

#### 3. 만료 자동 처리 (선택)
- **옵션 A**: Supabase Edge Function (cron) — 매일 `UPDATE invite_codes SET is_active = false WHERE expires_at < NOW()`
- **옵션 B**: 검증 시점 체크만으로 충분하다면 현재 상태 유지 (이미 가입 시 만료 체크 함)
- **옵션 C**: DB View 또는 computed column으로 `is_expired` 자동 계산

### 성공 기준
- [ ] bs-06 코드의 used_count가 실제 사용자 수와 일치
- [ ] 신규 가입 시 used_count가 +1 증가 확인
- [ ] (선택) 만료 자동 처리 구현 시 만료된 코드로 가입 불가 확인
