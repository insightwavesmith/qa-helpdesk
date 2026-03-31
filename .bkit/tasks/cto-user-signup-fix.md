# FIX: 회원가입 후 수강생 관리 미노출 버그

## 원인

### 핵심 원인: `ensureProfile()` 사일런트 실패 → "유령 유저" 생성

회원가입 시 **Firebase Auth user 생성은 성공**하지만, **Cloud SQL `profiles` INSERT가 실패**해도 에러를 삼키고 리다이렉트를 진행한다.

**문제 코드** — `src/app/(auth)/signup/page.tsx:317-329`:
```javascript
try {
  await ensureProfile(uid, formData.email, {...});
} catch (profileErr) {
  console.error("[signup] ensureProfile failed:", profileErr);
  // ⚠️ 에러 무시! 사용자에게 알리지 않고 리다이렉트 진행
}
```

**결과:**
- Firebase Auth에는 유저 존재 → 로그인 가능
- Cloud SQL `profiles` 테이블에 row 없음 → 관리자 페이지에 미노출
- 미들웨어에서 `role = null` → `return response` (접근 제한 없이 통과)
- 사용자는 가입 성공으로 인식하지만 DB에 프로필 없는 "유령 유저" 상태

### 부가 원인: `ensureProfile()` 실패 가능 시나리오
1. Cloud SQL 연결 에러 (일시적 네트워크 문제)
2. 커스텀 쿼리빌더(`PostgresQueryBuilder`) INSERT 시 `as never` 캐스팅으로 타입 안전성 미보장
3. `role` enum 불일치 (DB enum vs 코드 값)
4. `ensureProfile`이 throw 대신 `{ error: "..." }` 반환 → catch에 안 걸림 (return value error 미처리)

### ⚠️ 4번이 실제 가장 유력한 원인

`ensureProfile()` (`src/actions/auth.ts:36-54`)는 실패 시 **throw하지 않고** `{ error: error.message }`를 반환한다:
```javascript
const { error } = await svc.from("profiles").insert({...});
if (error) {
  console.error("[ensureProfile] error:", error);
  return { error: error.message };  // ← throw가 아닌 return!
}
```

호출부에서는 **try-catch만** 사용하고 **return value를 체크하지 않는다**:
```javascript
try {
  await ensureProfile(uid, formData.email, {...});
  // ← 반환값 { error: "..." }를 무시!
} catch (profileErr) {
  // DB 에러는 여기 안 걸림 (throw 안 하니까)
}
```

**즉, DB INSERT 실패 시 에러가 아예 삼켜지는 구조.**

---

## 수정 방법

### 수정 1: 회원가입 페이지 — ensureProfile 반환값 체크 + 에러 표시

**파일:** `src/app/(auth)/signup/page.tsx`  
**위치:** 317-329줄

**변경 전:**
```javascript
// Phase 5: Cloud SQL 환경에서 profile 생성 (trigger 대체)
try {
  await ensureProfile(uid, formData.email, {
    name: metadata.name || "",
    phone: metadata.phone || undefined,
    shop_url: metadata.shop_url || undefined,
    shop_name: metadata.shop_name || undefined,
    business_number: metadata.business_number || undefined,
    cohort: metadata.cohort || undefined,
    invite_code: metadata.invite_code || undefined,
  });
} catch (profileErr) {
  console.error("[signup] ensureProfile failed:", profileErr);
}
```

**변경 후:**
```javascript
// Phase 5: Cloud SQL 환경에서 profile 생성 (trigger 대체)
try {
  const profileResult = await ensureProfile(uid, formData.email, {
    name: metadata.name || "",
    phone: metadata.phone || undefined,
    shop_url: metadata.shop_url || undefined,
    shop_name: metadata.shop_name || undefined,
    business_number: metadata.business_number || undefined,
    cohort: metadata.cohort || undefined,
    invite_code: metadata.invite_code || undefined,
  });

  if (profileResult?.error) {
    console.error("[signup] ensureProfile returned error:", profileResult.error);
    setError("프로필 생성에 실패했습니다. 다시 시도해 주세요.");
    // Firebase Auth 유저는 이미 생성됨 → 재가입 시 "이미 가입된 이메일" 에러 방지
    // 다음 로그인 시 미들웨어에서 profile 없음을 감지할 수 있도록 로그만 남김
    setLoading(false);
    return; // ← 리다이렉트 차단!
  }
} catch (profileErr) {
  console.error("[signup] ensureProfile exception:", profileErr);
  setError("프로필 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
  setLoading(false);
  return; // ← 리다이렉트 차단!
}
```

---

### 수정 2: 미들웨어 — profile 없는 유저 복구 유도

**파일:** `src/lib/firebase/middleware.ts`  
**위치:** 152-155줄

**변경 전:**
```javascript
// profile 없는 경우 → 접근 허용 (trigger 미완료 대비)
if (!role) {
  return response;
}
```

**변경 후:**
```javascript
// profile 없는 경우 → /signup으로 보내 재생성 유도
// (Firebase Auth는 있지만 profiles row가 없는 "유령 유저")
if (!role) {
  if (!isServerAction && !isPublicPath(pathname) && pathname !== "/pending") {
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    url.searchParams.set("reason", "profile_missing");
    return NextResponse.redirect(url);
  }
  return response;
}
```

---

### 수정 3: 기존 유령 유저 복구 스크립트

**신규 파일:** `scripts/fix-ghost-users.ts`

Firebase Auth에는 있지만 `profiles` 테이블에 없는 유저를 찾아서 복구하는 일회성 스크립트:

```typescript
/**
 * 유령 유저 복구 스크립트
 * Firebase Auth에 존재하지만 profiles 테이블에 row가 없는 유저를 찾아 프로필 생성
 *
 * 실행: npx tsx scripts/fix-ghost-users.ts
 */
import { getFirebaseAuth } from "../src/lib/firebase/admin";
import { getPool } from "../src/lib/db/pool";

async function fixGhostUsers() {
  const auth = getFirebaseAuth();
  const pool = getPool();

  // Firebase Auth 전체 유저 목록
  const listResult = await auth.listUsers(1000);
  const firebaseUsers = listResult.users;

  console.log(`Firebase Auth 유저 수: ${firebaseUsers.length}`);

  // profiles 테이블의 모든 id 조회
  const { rows: profiles } = await pool.query("SELECT id FROM profiles");
  const profileIds = new Set(profiles.map((r: { id: string }) => r.id));

  console.log(`profiles 테이블 row 수: ${profileIds.size}`);

  // 유령 유저 찾기
  const ghostUsers = firebaseUsers.filter((u) => !profileIds.has(u.uid));

  console.log(`유령 유저 수: ${ghostUsers.length}`);

  if (ghostUsers.length === 0) {
    console.log("유령 유저 없음. 종료.");
    return;
  }

  // 복구: profiles INSERT
  for (const ghost of ghostUsers) {
    console.log(`복구 중: ${ghost.uid} (${ghost.email})`);

    await pool.query(
      `INSERT INTO profiles (id, email, name, role, onboarding_status, onboarding_step)
       VALUES ($1, $2, $3, 'lead', 'not_started', 0)
       ON CONFLICT (id) DO NOTHING`,
      [ghost.uid, ghost.email || "", ghost.displayName || ""]
    );
  }

  console.log(`복구 완료: ${ghostUsers.length}명`);
  await pool.end();
}

fixGhostUsers().catch(console.error);
```

---

## 수정 우선순위

| 순서 | 수정 | 파일 | 긴급도 |
|------|------|------|--------|
| 1 | ensureProfile 반환값 체크 | `src/app/(auth)/signup/page.tsx` | 🔴 즉시 |
| 2 | 유령 유저 복구 스크립트 실행 | `scripts/fix-ghost-users.ts` | 🔴 즉시 |
| 3 | 미들웨어 profile 없는 유저 처리 | `src/lib/firebase/middleware.ts` | 🟡 권장 |

## 완료 기준
- [ ] 회원가입 후 `profiles` INSERT 실패 시 사용자에게 에러 표시
- [ ] 기존 유령 유저 복구 완료
- [ ] 관리자 "회원 관리" 페이지에서 모든 가입 유저 노출 확인
- [ ] `npm run build` 성공
