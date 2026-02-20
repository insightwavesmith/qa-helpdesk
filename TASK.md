# TASK.md — Phase 3b: 회원 관리 전체 정비
> 2026-02-20 | 가입 폼 수정 + lead 차단 + alumni 제거 + 회원관리 UI 보강 + 삭제 기능

## 목표
회원 가입~관리~전환 플로우 전체 정비:
1. 가입 폼: lead는 사업자정보 필수, student는 간소화
2. lead 역할은 /pending만 접근 (승인 전 전체 차단)
3. alumni 역할 코드 제거
4. 리드 회원 삭제 기능
5. 회원관리에 기수/광고계정/믹스패널 정보 표시 + 시크릿키 보안 마스킹
6. 수강생 전환 시 기수 지정
7. DB에 mixpanel_secret_key 컬럼 추가

## 레퍼런스
- 가입 폼: `src/app/(auth)/signup/page.tsx`
- 미들웨어: `src/lib/supabase/middleware.ts`
- 레이아웃: `src/app/(main)/layout.tsx`
- pending 페이지: `src/app/(auth)/pending/page.tsx` (이미 존재)
- 회원관리: `src/app/(main)/admin/members/members-client.tsx`
- 회원상세: `src/app/(main)/admin/members/member-detail-modal.tsx`
- 관리자 액션: `src/actions/admin.ts`

## 현재 코드

### 가입 폼 — student만 사업자정보 받음 (T1 문제)
```tsx
// src/app/(auth)/signup/page.tsx — handleSignup()
const metadata: Record<string, string | null> = {
  name: formData.name,  // lead: 이름만
};
if (isStudentMode) {
  // ❌ student에만 사업자정보 → 반대로 해야 함
  metadata.phone = formData.phone;
  metadata.shop_url = formData.shopUrl;
  metadata.shop_name = formData.shopName;
  metadata.business_number = formData.businessNumber;
}
```

UI도 `{isStudentMode && (...)}` 조건부 렌더링으로 사업자정보 숨김.
가입 후 리다이렉트: lead → `/dashboard` (❌ /pending이어야 함)

### 미들웨어 — lead가 대시보드 접근 가능 (T2 문제)
```ts
// src/lib/supabase/middleware.ts
if (role === "lead" || role === "member") {
  // ❌ lead와 member를 같이 처리 — lead는 /pending만 허용해야 함
  if (pathname.startsWith("/questions") || pathname.startsWith("/admin") || pathname.startsWith("/onboarding")) {
    url.pathname = "/dashboard";  // ❌ lead는 /pending으로
    return createRedirectWithCookies(url, supabaseResponse);
  }
  return supabaseResponse;  // ❌ 나머지 전부 허용
}
```

### 레이아웃 — lead에 admin 사이드바 (T2 관련)
```tsx
// src/app/(main)/layout.tsx
const usesSidebarLayout = role === "admin" || role === "lead" || role === "member";
// ❌ lead가 사이드바 레이아웃 → admin 메뉴 보임
```

### 회원관리 — 기수/삭제 미지원 (T4, T5, T6 문제)
```tsx
// members-client.tsx 테이블 헤더
<TableHead>이름</TableHead>
<TableHead>이메일</TableHead>
<TableHead>쇼핑몰</TableHead>
<TableHead>사업자번호</TableHead>
<TableHead>상태</TableHead>
<TableHead>가입일</TableHead>
<TableHead>관리</TableHead>
// ❌ "기수" 컬럼 없음
```

```tsx
// member-detail-modal.tsx — 비활성화만 있음
const handleDeactivate = async () => { ... };
// ❌ 실제 삭제(auth.users + profiles) 기능 없음
// ❌ 믹스패널 프로젝트ID, 시크릿키 표시 없음
// ❌ 메타 광고계정ID 표시 없음 (ad_accounts는 있지만 profiles.meta_account_id 미표시)
```

```tsx
// 수강생 전환 — 기수 지정 없음
const handleApproveAs = async (userId: string, role: "member" | "student") => {
  const { error } = await approveMember(userId, role);
  // ❌ cohort 파라미터 없음 → 수강생인데 기수=null
};
```

### DB profiles 컬럼 현황
```
id, email, name, phone, shop_url, shop_name, business_number,
role, cohort, category, monthly_ad_budget,
meta_account_id, mixpanel_project_id, mixpanel_board_id,
onboarding_status, onboarding_step, onboarding_completed,
invite_code_used, business_cert_url, reject_reason,
role_old, created_at, updated_at
```
❌ `mixpanel_secret_key` 컬럼 없음

### alumni 참조 파일 (T3)
```
src/types/database.ts — role union
src/types/index.ts — UserRole
src/types/supabase.ts — user_role enum
src/app/api/protractor/_shared.ts — ALLOWED_ROLES
src/app/(main)/admin/members/member-detail-modal.tsx — 뱃지/옵션
src/app/(main)/admin/members/members-client.tsx — 필터
src/app/(main)/dashboard/page.tsx — 주석
src/app/(main)/protractor/page.tsx — 분기
src/lib/supabase/middleware.ts — alumni 분기
src/app/api/admin/email/send/route.ts — 발송 대상
```

## 제약
- pending 페이지는 이미 존재 — 수정 불필요
- DB user_role enum에서 alumni 제거는 안 함 (기존 데이터 호환). 코드에서만 제거
- handle_new_user() trigger는 lead/student만 생성하므로 변경 불필요
- member 역할은 현재대로 유지 (대시보드 접근 가능)
- 회원 삭제 시 auth.users도 함께 삭제 (Supabase Admin API: `supabase.auth.admin.deleteUser()`)
- mixpanel_secret_key는 UI에서 `••••••••` 마스킹, 수정 시에만 표시
- 사업자등록증 업로드는 lead에게 표시 (선택)

## 태스크

### T1. 가입 폼 사업자정보 로직 반전 → Leader
- 파일: `src/app/(auth)/signup/page.tsx`
- 의존: 없음
- 변경:
  1. lead(초대코드 없음): 전화번호/자사몰URL/쇼핑몰이름/사업자등록번호 필수. 사업자등록증 업로드(선택)
  2. student(초대코드 있음): 이름+이메일+비밀번호만. 사업자정보 숨김
  3. handleSignup: lead → metadata에 사업자정보 포함 + `/pending` 리다이렉트
  4. handleSignup: student → metadata에 name+cohort+invite_code만 + `/onboarding` 리다이렉트
- 완료 기준:
  - [ ] lead 가입: 사업자정보 필수, /pending 리다이렉트
  - [ ] student 가입: 이름만, /onboarding 리다이렉트

### T2. lead → /pending 차단 + member/lead 레이아웃 수정 → Leader
- 파일: `src/lib/supabase/middleware.ts`, `src/app/(main)/layout.tsx`
- 의존: 없음
- 변경:
  1. 미들웨어: lead 분기를 member와 분리. lead는 /pending 외 모든 경로 → /pending 리다이렉트
  2. 레이아웃: `usesSidebarLayout`에서 lead **AND member** 제거. **admin만** 사이드바 사용
     - 현재: `usesSidebarLayout = admin || lead || member` ❌
     - 변경: `usesSidebarLayout = admin` (admin만)
     - member, student → StudentHeader(상단 탭) 사용. 사이드바 아님!
  3. StudentHeader navItems 확인 (이미 거의 맞음):
     - 현재: 홈, Q&A, 정보공유, 총가치각도기
     - member도 PROTRACTOR_ROLES에 포함시켜야 총가치각도기 접근 가능
     - 수강후기 메뉴는 이번 스코프 아님 (나중에 별도 추가)
- 완료 기준:
  - [ ] lead → /dashboard 시 /pending 리다이렉트
  - [ ] lead → /pending 정상 표시
  - [ ] member → StudentHeader(상단 탭) 사용 (사이드바 아님)
  - [ ] admin만 사이드바 레이아웃 사용
  - [ ] student 기존 동작 영향 없음

### T3. alumni 코드 제거 → Leader
- 파일: 위 10개 파일
- 의존: T2 완료 후
- 변경: alumni 참조 전부 제거. alumni 자리는 student로 대체
- 추가: `src/components/layout/student-header.tsx`의 `PROTRACTOR_ROLES`에서 alumni 제거 + **member 추가**
  - 현재: `["student", "alumni", "admin"]`
  - 변경: `["student", "member", "admin"]` (member도 총가치각도기 접근)
- 완료 기준:
  - [ ] `grep -r "alumni" src/` 결과 0건
  - [ ] PROTRACTOR_ROLES에 member 포함
  - [ ] npm run build 성공

### T4. 리드 회원 삭제 기능 → Leader
- 파일: `src/actions/admin.ts`, `src/app/(main)/admin/members/member-detail-modal.tsx`
- 의존: 없음
- 변경:
  1. actions/admin.ts에 `deleteMember(userId)` 추가: `createServiceClient()`로 profiles 삭제 + `supabase.auth.admin.deleteUser(userId)` 호출
  2. member-detail-modal.tsx에 "회원 삭제" 버튼 추가 (빨간색, confirm 필수)
  3. 삭제 대상: lead, member만. student/admin은 삭제 불가 (UI에서 비활성)
- 완료 기준:
  - [ ] lead 회원 상세 → "회원 삭제" 버튼 표시
  - [ ] 삭제 시 profiles + auth.users 모두 삭제
  - [ ] student/admin 삭제 버튼 비활성

### T5. 회원관리 UI 보강 — 기수 + 광고계정 + 믹스패널 + 시크릿키 → Leader
- 파일: `src/app/(main)/admin/members/members-client.tsx`, `src/app/(main)/admin/members/member-detail-modal.tsx`, `src/actions/admin.ts`
- 의존: T7 (DB 컬럼 추가) 완료 후
- 변경:
  1. 회원 목록 테이블에 "기수" 컬럼 추가
  2. 회원 상세 모달에 추가 정보 표시:
     - 기수 (cohort)
     - 메타 광고계정 ID (meta_account_id)
     - 믹스패널 프로젝트 ID (mixpanel_project_id)
     - 믹스패널 보드 ID (mixpanel_board_id)
     - 믹스패널 시크릿키 (mixpanel_secret_key) — `••••••••` 마스킹, "보기" 토글
  3. 프로필 수정 모드에서 위 필드 편집 가능
  4. getMemberDetail 쿼리에 위 컬럼 추가
- 완료 기준:
  - [ ] 회원 목록에 기수 컬럼 표시
  - [ ] 회원 상세에 광고계정/믹스패널 정보 표시
  - [ ] 시크릿키 마스킹 + 토글 동작

### T6. 수강생 전환 시 기수 + 믹스패널 + 광고계정 필수 입력 → Leader
- 파일: `src/actions/admin.ts`, `src/app/(main)/admin/members/members-client.tsx`, `src/app/(main)/admin/members/member-detail-modal.tsx`
- 의존: T7 (mixpanel_secret_key 컬럼)
- 변경:
  1. approveMember에 cohort, meta_account_id, mixpanel_project_id, mixpanel_secret_key 파라미터 추가
  2. "수강생 승인" 클릭 시 모달/다이얼로그 표시:
     - 기수 (필수)
     - Meta 광고계정 ID (필수)
     - 믹스패널 프로젝트 ID (필수)
     - 믹스패널 시크릿키 (필수)
  3. 모든 필드 입력 전 전환 버튼 비활성
  4. 전환 시 profiles에 기수 + 광고계정 + 믹스패널 정보 함께 업데이트
- 완료 기준:
  - [ ] "수강생 승인" 클릭 → 기수/광고계정/믹스패널 입력 모달
  - [ ] 필수 필드 빈 칸이면 전환 불가
  - [ ] 전환 후 profiles에 모든 값 저장

### T7. DB 마이그레이션 — mixpanel_secret_key 컬럼 추가 → Leader
- 파일: `supabase/migrations/00022_member_management.sql`
- 의존: 없음 (먼저 실행)
- 변경:
  ```sql
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mixpanel_secret_key TEXT;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS annual_revenue TEXT;
  ```
- 완료 기준:
  - [ ] 마이그레이션 파일 생성
  - [ ] 기존 데이터 영향 없음 (nullable)

### T8. 온보딩 Step 1에 브랜드명 추가 + Step 2에 믹스패널 필드 추가 → Leader
- 파일: `src/app/(auth)/onboarding/page.tsx`, `src/actions/onboarding.ts`
- 의존: T7 (mixpanel_secret_key 컬럼)
- 변경:
  **Step 1 (프로필):**
  1. StepProfile에 "브랜드명" 필드 추가 (DB: `shop_name` 컬럼, 이미 존재)
  2. saveOnboardingProfile에 shopName 파라미터 추가
  3. 현재 Step 1 필드: 이름, 쇼핑몰URL, 월광고예산, 카테고리
  4. 변경 후: 이름, **브랜드명**(shop_name), 쇼핑몰URL, **연매출**(annual_revenue, 신규), 월광고예산, 카테고리
  **Step 2 (광고계정):**
  5. StepAdAccount 컴포넌트에 믹스패널 프로젝트 ID + 시크릿키 입력 필드 추가
  6. saveAdAccount 액션에 mixpanel_project_id, mixpanel_secret_key 파라미터 추가
  7. "나중에 할게요, 건너뛰기" 유지 (온보딩 시점에는 선택, 수강생 전환 시 필수)
  8. 입력한 값은 profiles 테이블에 저장
- 현재 StepAdAccount:
  - Meta 광고계정 ID만 입력
  - saveAdAccount(accountId | null)
- 변경 후:
  - Meta 광고계정 ID + 믹스패널 프로젝트 ID + 믹스패널 시크릿키
  - saveAdAccount({ metaAccountId, mixpanelProjectId, mixpanelSecretKey })
- 완료 기준:
  - [ ] 온보딩 Step 1에 브랜드명 필드 표시 + profiles.shop_name에 저장
  - [ ] 온보딩 Step 2에 믹스패널 프로젝트ID, 시크릿키 필드 표시
  - [ ] 입력 시 profiles에 저장
  - [ ] 스킵 시 null로 저장 (정상 진행)

### T10. 수강후기 탭 신규 생성 → Leader
- 파일: 신규 생성 다수
- 의존: T2 완료 후 (StudentHeader에 메뉴 추가), T7 (DB 마이그레이션)
- 개요: QA(/questions)처럼 수강후기 게시판 탭 신규 생성
- 스펙:
  - **작성 권한**: student만 (admin은 읽기+삭제만)
  - **승인**: 불필요, 작성 즉시 공개
  - **별점**: 없음
  - **이미지 첨부**: 있음 (Supabase Storage)
  - **구조**: 목록 → 작성 → 상세 (정보공유 /posts와 유사)
- DB 마이그레이션 (`00022_member_management.sql`에 포함):
  ```sql
  CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_urls TEXT[] DEFAULT '{}',
    view_count INT DEFAULT 0,
    like_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Anyone can read reviews" ON reviews FOR SELECT USING (true);
  CREATE POLICY "Students can create reviews" ON reviews FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'student')
  );
  CREATE POLICY "Authors can update own reviews" ON reviews FOR UPDATE USING (author_id = auth.uid());
  CREATE POLICY "Admins can delete reviews" ON reviews FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
  ```
- 파일 구조 (신규):
  - `src/app/(main)/reviews/page.tsx` — 목록 페이지
  - `src/app/(main)/reviews/new/page.tsx` — 작성 페이지
  - `src/app/(main)/reviews/new/new-review-form.tsx` — 작성 폼 (이미지 업로드 포함)
  - `src/app/(main)/reviews/[id]/page.tsx` — 상세 페이지
  - `src/app/(main)/reviews/[id]/ReviewDetailClient.tsx` — 상세 클라이언트
  - `src/actions/reviews.ts` — 서버 액션 (CRUD + 이미지 업로드)
- StudentHeader에 메뉴 추가:
  - `src/components/layout/student-header.tsx` navItems에 `{ label: "수강후기", href: "/reviews" }` 추가
- 이미지 업로드:
  - Supabase Storage `review-images` 버킷 생성 (public)
  - 이미지 최대 3장, 각 5MB 이하
  - 업로드 후 public URL을 `image_urls` 배열에 저장
- 완료 기준:
  - [ ] /reviews 목록 페이지 표시
  - [ ] student만 "후기 작성" 버튼 표시
  - [ ] 작성 시 제목 + 내용 + 이미지(최대 3장) 입력
  - [ ] 작성 즉시 목록에 공개
  - [ ] 상세 페이지에서 이미지 표시
  - [ ] admin은 삭제 가능
  - [ ] StudentHeader에 "수강후기" 메뉴 표시
  - [ ] npm run build 성공
- **임베딩은 이번 스코프 아님**: 골든 스탠다드 작업 시 QA 승인 답변 + 수강후기 일괄 임베딩 예정 (source_type='review')

### T9. 온보딩 완료 화면 바로가기 버그 수정 → Leader
- 파일: `src/app/(auth)/onboarding/page.tsx`
- 의존: 없음
- 현상: Step 3 완료 화면에서 "Q&A 바로가기", "정보공유 바로가기" 버튼 클릭 시 이동 안 됨
- 원인: `completeOnboarding()`이 서버 쿠키 삭제하지만, `router.push()`로 이동 시 미들웨어가 아직 옛 캐시/상태로 `/onboarding`으로 리다이렉트
- 변경:
  1. StepComplete에서 `router.push()` 대신 `window.location.href` 사용 (풀 페이지 리로드로 미들웨어 재평가)
  2. 또는 `completeOnboarding()` 완료 후 `router.refresh()` 호출 후 push
- 완료 기준:
  - [ ] 온보딩 완료 후 "Q&A 바로가기" 클릭 → /questions 정상 이동
  - [ ] "정보공유 바로가기" 클릭 → /posts 정상 이동

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| 초대코드 없이 가입 (lead) | 사업자정보 필수 → /pending |
| 초대코드로 가입 (student) | 이름+이메일+비밀번호만 → /onboarding |
| 기존 lead 재로그인 | /pending 리다이렉트 |
| 기존 alumni 로그인 | DB에 alumni 남아있어도 student 취급 |
| member 로그인 | StudentHeader(상단 탭) 사용, 사이드바 아님 |
| lead 삭제 | auth.users + profiles 모두 삭제 |
| student 삭제 시도 | 버튼 비활성 (삭제 불가) |
| 수강생 전환 시 기수 미입력 | 전환 차단 (기수 필수) |
| 시크릿키 조회 | 기본 마스킹, 토글로 표시 |
| member → student 전환 | 기수+광고계정+믹스패널 입력 요구 후 전환 |
| 온보딩 Step 2 스킵 | 믹스패널/광고계정 null → 수강생 전환 시 필수 입력 |
| 온보딩 Step 2 입력 | 값 저장 → 수강생 전환 시 미리 채워짐 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-20-phase3b-member-management.html
- 리뷰 일시: 2026-02-20 18:30
- 변경 유형: 혼합 (프론트엔드 + 미들웨어 + DB + 타입)
- 피드백 요약: C-01(FK CASCADE 위험), C-03(reviews ON DELETE 미지정), C-05(alumni 기존 데이터)
- 반영 여부: 반영함 — CASCADE 대신 SET NULL, reviews.author_id ON DELETE SET NULL 추가, alumni→member 마이그레이션 SQL 추가

## 검증
☐ npm run build 성공
☐ grep -r "alumni" src/ 결과 0건
☐ lead 가입 → 사업자정보 필수 + /pending 리다이렉트
☐ student 가입 → 이름만 + /onboarding 리다이렉트
☐ lead 로그인 → /pending만 접근 가능
☐ 회원 목록에 기수 컬럼 표시
☐ 회원 상세에 광고계정/믹스패널/시크릿키 표시
☐ 시크릿키 마스킹 + 토글 동작
☐ lead 삭제 → auth.users + profiles 모두 삭제
☐ 수강생 전환 시 기수 + 광고계정 + 믹스패널 입력 필수 (빈 칸이면 전환 불가)
☐ 온보딩 Step 2에 믹스패널 프로젝트ID, 시크릿키 필드 표시
☐ member → StudentHeader(상단 탭) 사용, 사이드바 아님
☐ admin만 사이드바 사용
☐ /reviews 목록 + 작성 + 상세 동작
☐ student만 후기 작성 가능
☐ 이미지 업로드 + 표시 정상
☐ StudentHeader에 수강후기 메뉴 표시
☐ admin/student 기존 동작 영향 없음
