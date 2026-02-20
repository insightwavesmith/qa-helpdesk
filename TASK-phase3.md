# TASK.md — Phase 3: 회원가입 리팩토링 + 초대코드 + 미들웨어 + 온보딩
> 2026-02-20 | 수강생/일반 가입 분리, 역할별 접근제어, student 온보딩 4단계

## 목표
1. 가입 경로 2개 분리: 초대코드 수강생(student) vs 일반가입(lead→member)
2. 미들웨어에서 역할별 라우팅 + student 온보딩 강제 리다이렉트
3. 온보딩 4단계 UI (/onboarding) — student 전용, 완료 전까지 사이트 접근 차단
4. 관리자: 초대코드 생성/관리 + lead→student 수동 전환

## 레퍼런스
- 기획서: `https://mozzi-reports.vercel.app/reports/architecture/2026-02-20-phase3-4-planning.html`
- 온보딩 목업: 기획서 섹션 4 (Step 0~3 시각 목업 포함)
- 결정사항 D1~D6 + C1~C4: 기획서 섹션 11 (전부 확정)

## 현재 코드

### profiles.role — DB enum (이미 변경됨)
```ts
// src/types/supabase.ts
user_role: "lead" | "member" | "student" | "alumni" | "admin"
// ✅ enum 이미 존재. 하지만 가입 시 기본값이 아직 old 방식
```

### profiles 관련 컬럼 (이미 존재)
```ts
// DB에 이미 있는 컬럼:
onboarding_completed: boolean | null   // → onboarding_status로 교체 필요
onboarding_step: number | null         // 유지 (단계 추적용)
role_old: string | null                // 마이그레이션 히스토리
```

### invite_codes 테이블 (이미 존재)
```ts
// src/types/supabase.ts — 테이블 존재, 데이터 없음
invite_codes: {
  code: string,
  cohort: string | null,
  created_by: string | null,
  expires_at: string | null,
  max_uses: number | null,
  used_count: number | null,
}
```

### student_registry 테이블 (이미 존재)
```ts
// 수강생 78명 데이터 (카페24에서 import)
student_registry: {
  name: string,
  email: string | null,
  phone: string | null,
  cohort: string | null,
  shop_name: string | null,
  shop_url: string | null,
  matched_profile_id: string | null,  // 매칭되면 profile UUID
}
```

### 현재 가입 흐름 (signup/page.tsx)
```tsx
// src/app/(auth)/signup/page.tsx — 현재 문제점:
// 1. 전체 사업정보 입력 필수 (일반 가입자에게 과도)
// 2. role=pending으로 가입 → 관리자 수동 승인 → approved
// 3. 초대코드 없음
// 4. student_registry 매칭 없음

// supabase.auth.signUp() → metadata에 name, phone, shop_url 등 전달
// → auth trigger가 profiles INSERT (role='pending')
```

### 현재 미들웨어 (middleware.ts)
```ts
// src/lib/supabase/middleware.ts — 현재:
// - 인증 없으면 → /login (public paths 제외)
// - 인증 있으면 /login, /signup → /dashboard
// ⚠️ role 체크 없음. pending이든 student든 /dashboard 접근 가능
// ⚠️ onboarding 리다이렉트 없음
```

### 대시보드 라우팅 (dashboard/page.tsx)
```tsx
// src/app/(main)/dashboard/page.tsx
if (role === "admin") return <AdminDashboard />;
if (role === "member") return <MemberDashboard />;
return <StudentHome />;  // student, alumni 모두
// ⚠️ lead, pending에 대한 처리 없음
```

## 제약
- invite_codes, student_registry 테이블 스키마 변경 최소화 (이미 존재)
- 기존 profiles 데이터 (가입자 7명) 깨지지 않아야 함
- Supabase Auth trigger 수정 시 SECURITY DEFINER + search_path 필수
- 초대코드 형식: 기수당 1개 (예: BS6-2026). D1 확정
- alumni = student 동일 권한. 별도 분기 불필요. D3 확정
- 비회원 정보공유 3개 미리보기는 Phase 4로 보류 (D4)
- member = Q&A 접근 불가 (정보공유/공지/뉴스레터만). D2 확정

## 태스크

### T0. DB 마이그레이션 → backend-dev
- 파일: `supabase/migrations/00021_phase3_signup.sql` (신규)
- 의존: 없음
- 완료 기준:
  - [ ] profiles에 `onboarding_status text DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started','in_progress','completed'))` 추가
  - [ ] profiles에 `invite_code_used text` 추가 (어떤 초대코드로 가입했는지)
  - [ ] auth trigger 수정: 가입 시 raw_user_meta_data에 invite_code 있으면 role='student', 없으면 role='lead'
  - [ ] invite_codes 테이블에 RLS 정책 추가 (admin만 CRUD, 가입 시 code 검증은 service role)
  - [ ] student_registry에 RLS 정책 추가 (admin만 조회/수정)
  - [ ] `npx supabase gen types` 실행

### T1. 가입 폼 리팩토링 → frontend-dev
- 파일: `src/app/(auth)/signup/page.tsx` (수정)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] 가입 페이지에 초대코드 입력 필드 추가 (상단, 선택사항)
  - [ ] 초대코드 입력 시:
    - API로 코드 유효성 검증 (exists + not expired + used_count < max_uses)
    - 유효하면 "수강생 가입 모드" 활성화 → 전체 사업정보 폼 표시
    - 무효하면 에러 메시지 "유효하지 않은 초대코드입니다"
  - [ ] 초대코드 없이 가입 시:
    - 간소화 폼: 이메일 + 비밀번호 + 이름만 (사업정보 숨김)
    - role=lead로 가입
  - [ ] signUp() options.data에 `invite_code` 포함 (있을 때만)
  - [ ] 가입 성공 후:
    - 초대코드 있으면(student) → /onboarding 으로 이동
    - 초대코드 없으면(lead) → /dashboard 으로 이동 (pending 페이지 불필요)
  - [ ] 기존 UI 스타일 유지 (브랜드 컬러 #F75D5D, 카드 레이아웃)

### T2. 초대코드 검증 API + student_registry 매칭 → backend-dev
- 파일: `src/app/api/invite/validate/route.ts` (신규), `src/app/api/invite/use/route.ts` (신규)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] `POST /api/invite/validate` — code 검증 (exists, not expired, uses 여유)
    - 응답: `{ valid: boolean, cohort?: string, error?: string }`
  - [ ] `POST /api/invite/use` — 가입 완료 후 호출 (server action에서)
    - invite_codes.used_count += 1
    - profiles.invite_code_used = code
    - profiles.cohort = invite_codes.cohort
    - student_registry 이메일 매칭 시도:
      - email 일치 → matched_profile_id = profile.id
      - 불일치 → 로그만 (수동 매칭 대기)
  - [ ] 에러 핸들링: 코드 만료, 사용 초과, 코드 없음

### T3. 미들웨어 역할 분기 → backend-dev
- 파일: `src/lib/supabase/middleware.ts` (수정)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] 로그인 후 role 조회 (profiles 테이블 SELECT)
  - [ ] 역할별 라우팅:
    - `lead` → /dashboard 허용 (MemberDashboard — 정보공유/공지/뉴스레터만, Q&A 접근 불가)
    - `member` → /dashboard 허용 (MemberDashboard — 정보공유/공지/뉴스레터만, Q&A 접근 불가)
    - `student`/`alumni` + onboarding_status != 'completed' → /onboarding 강제 리다이렉트
    - `student`/`alumni` + onboarding 완료 → 전체 접근
    - `admin` → 전체 접근
  - [ ] /onboarding은 student/alumni만 접근 가능
  - [ ] /admin/* 은 admin만 접근 가능
  - [ ] /questions/* 은 student/alumni/admin만 접근 가능 (lead/member → /dashboard 리다이렉트)
  - [ ] 미들웨어 성능: role 조회 캐싱 (cookie 또는 session)
  - [ ] 공개 경로 업데이트: /login, /signup, /subscribe, /unsubscribe + 정보공유 미리보기(Phase 4)

### T4. 온보딩 4단계 UI → frontend-dev
- 파일: `src/app/(auth)/onboarding/page.tsx` (신규), `src/actions/onboarding.ts` (신규)
- 의존: T0, T3 완료 후
- 완료 기준:
  - [ ] /onboarding 페이지 — 4단계 진행 UI
  - [ ] Step 0 (환영): 이름 + 기수 표시, 서비스 소개 (Q&A, 정보공유, 총가치각도기), "시작하기" 버튼
  - [ ] Step 1 (프로필 확인): 이름, 쇼핑몰 URL, 월 광고예산, 카테고리 — 확인/수정 후 "저장"
  - [ ] Step 2 (광고계정): Meta 광고 계정 ID 입력 안내, "연결" 또는 "건너뛰기"
  - [ ] Step 3 (완료): 완료 메시지, Q&A 바로가기 + 정보공유 바로가기 버튼
  - [ ] 각 단계에서 onboarding_step 업데이트 (0→1→2→3)
  - [ ] Step 3 완료 시 onboarding_status = 'completed'
  - [ ] 중간에 나가면 in_progress 상태, 다음 접속 시 마지막 step부터 이어서
  - [ ] 모바일 반응형 (375px~)
  - [ ] 브랜드 스타일 (#F75D5D, 카드, rounded-xl)
  - [ ] 기획서 목업 참고 (섹션 4)

### T5. 관리자: 초대코드 관리 UI → frontend-dev
- 파일: `src/app/(main)/admin/invites/page.tsx` (신규), `src/actions/invites.ts` (신규)
- 의존: T0 완료 후
- 완료 기준:
  - [ ] /admin/invites 페이지 — 초대코드 목록 + 생성
  - [ ] 코드 생성: 기수 선택, 만료일, 최대 사용 횟수 입력
  - [ ] 코드 목록: code, cohort, used_count/max_uses, expires_at, 복사 버튼
  - [ ] 사이드바에 "초대코드" 메뉴 추가 (admin만)
  - [ ] 코드 삭제/비활성화

### T6. 대시보드 라우팅 수정 → frontend-dev
- 파일: `src/app/(main)/dashboard/page.tsx` (수정)
- 의존: T3 완료 후
- 완료 기준:
  - [ ] lead → MemberDashboard (정보공유/공지/뉴스레터만, Q&A 메뉴 숨김)
  - [ ] member → MemberDashboard (정보공유/공지/뉴스레터만, Q&A 메뉴 숨김)
  - [ ] student/alumni → StudentHome (기존 그대로)
  - [ ] pending (레거시) → /pending 리다이렉트
  - [ ] rejected → 에러 메시지 페이지

## 엣지 케이스
| 상황 | 기대 동작 |
|------|-----------|
| 만료된 초대코드로 가입 시도 | "초대코드가 만료되었습니다" 에러 |
| 사용 횟수 초과된 코드 | "초대코드 사용 한도를 초과했습니다" 에러 |
| 존재하지 않는 코드 | "유효하지 않은 초대코드입니다" 에러 |
| 코드 없이 가입 → lead | 간소화 폼, /dashboard에서 정보공유/공지/뉴스레터만 (Q&A 접근 불가) |
| student가 온보딩 중간에 브라우저 닫음 | 다음 로그인 시 /onboarding, 마지막 step부터 |
| student가 URL 직접 입력 (/dashboard) | 미들웨어가 /onboarding으로 리다이렉트 |
| lead가 /admin 접근 시도 | 미들웨어가 /dashboard로 리다이렉트 |
| lead/member가 /questions 접근 시도 | 미들웨어가 /dashboard로 리다이렉트 |
| 기존 가입자 (role=approved/pending) | 레거시 처리: approved→member, pending→pending 유지 |
| student_registry에 이메일 없는 수강생 | 매칭 실패 → 관리자 수동 매칭 대기 |
| 동시에 같은 코드로 2명 가입 | used_count 원자적 증가 (UPDATE ... SET used_count = used_count + 1) |
| 온보딩 Step 1에서 프로필 수정 | profiles 테이블 UPDATE, 기존 데이터 유지 |
| 관리자가 lead를 student로 수동 전환 | onboarding_status = 'not_started' 세팅 → 다음 로그인 시 온보딩 |

## 리뷰 보고서
- 보고서 파일: mozzi-reports/public/reports/review/2026-02-20-phase3-signup-review.html
- 리뷰 일시:
- 변경 유형: 혼합 (프론트엔드 UI + 백엔드 + DB + 미들웨어)
- 피드백 요약:
- 반영 여부:

## 검증
☐ npm run build 성공
☐ 기존 가입자 (7명) 로그인 정상
☐ T1 검증: 초대코드 입력 → 수강생 폼 활성화 → student로 가입
☐ T1 검증: 코드 없이 가입 → 간소화 폼 → lead로 가입
☐ T2 검증: 유효한 코드 → student_registry 이메일 매칭 → matched_profile_id 설정
☐ T2 검증: 잘못된 코드 → 에러 메시지
☐ T3 검증: student + 온보딩 미완료 → /onboarding 리다이렉트
☐ T3 검증: lead → /dashboard 접근 가능 (정보공유/공지/뉴스레터만)
☐ T3 검증: lead → /questions 접근 불가 (리다이렉트)
☐ T3 검증: lead → /admin 접근 불가
☐ T4 검증: 온보딩 4단계 진행 → onboarding_status 'completed'
☐ T4 검증: 중간에 나가기 → 다음 접속 시 이어서
☐ T5 검증: 관리자 초대코드 생성 + 코드 복사
☐ T6 검증: lead/member/student/admin 각각 맞는 대시보드 표시
☐ 모바일(375px) 가입폼 + 온보딩 정상 렌더링
