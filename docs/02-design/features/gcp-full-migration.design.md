# GCP 완전 이관 설계서 — Phase 3-D / 4 / 5

## 1. 데이터 모델

### 변경 없음
기존 테이블 구조 유지. Auth 관련 변경만:

| 변경 | 현재 | 이후 |
|------|------|------|
| 사용자 ID | Supabase `auth.uid()` (UUID) | Firebase `uid` (string) |
| profiles.id | Supabase auth.users.id FK | Firebase UID 직접 저장 |
| RLS 정책 | `auth.uid()` 기반 241개 | 서버사이드 인증 (RLS 비활성화) |

### profiles 테이블 변경
```sql
-- Firebase UID는 문자열 (UUID 형식 아님)
-- 기존 id (uuid) → firebase_uid (text) 추가 또는 id 유지
ALTER TABLE profiles ADD COLUMN firebase_uid TEXT UNIQUE;
-- 마이그레이션 후 firebase_uid로 조회
CREATE INDEX idx_profiles_firebase_uid ON profiles(firebase_uid);
```

---

## 2. API 설계

### 2-1. Auth API (Phase 5 - 신규)

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/session` | Firebase ID Token → 세션 쿠키 생성 |
| POST | `/api/auth/logout` | 세션 쿠키 삭제 |
| GET | `/api/auth/me` | 현재 사용자 정보 (profiles 조회) |

#### POST /api/auth/session
```typescript
// Request
{ idToken: string } // Firebase Client SDK에서 받은 ID Token

// Response (Set-Cookie: __session)
{ ok: true, user: { id, email, role, name } }
```

#### POST /api/auth/logout
```typescript
// Response (Clear-Cookie: __session)
{ ok: true }
```

### 2-2. 브라우저 쿼리 → Server Action 전환 (Phase 4)

기존 createBrowserClient() 직접 쿼리를 Server Action으로 전환:

| 페이지 | 현재 | 전환 |
|--------|------|------|
| questions/page.tsx | supabase.from('questions').select() | getQuestions() Server Action |
| posts/page.tsx | supabase.from('posts').select() | getPosts() Server Action |
| reviews/page.tsx | supabase.from('reviews').select() | getReviews() Server Action |
| dashboard/page.tsx | supabase.from('profiles').select() | getDashboard() Server Action |

기존 Server Action들(`src/actions/`)은 이미 `createServiceClient()` 사용 → 변경 최소.

---

## 3. 컴포넌트 구조

### 3-1. 인증 아키텍처 (Phase 5)

```
브라우저                          서버
┌─────────────┐               ┌──────────────────┐
│ Firebase     │  ID Token     │ Firebase Admin    │
│ Client SDK   │ ──────────→  │ verifyIdToken()   │
│              │               │       ↓           │
│ onAuthState  │  Set-Cookie   │ 세션 쿠키 생성     │
│ Changed()    │ ←──────────  │ (5일 만료)        │
└─────────────┘               └──────────────────┘
                                      ↓
                              ┌──────────────────┐
                              │ Middleware         │
                              │ verifySession()    │
                              │ → profiles 조회    │
                              │ → role 라우팅      │
                              └──────────────────┘
```

### 3-2. 파일 구조 (신규)

```
src/lib/firebase/
├── admin.ts          ← Firebase Admin SDK 초기화
├── client.ts         ← Firebase Client SDK 초기화
├── auth.ts           ← getCurrentUser(), verifySession() 헬퍼
└── middleware.ts      ← 세션 쿠키 검증 + role 라우팅

src/lib/supabase/
├── server.ts         ← 유지 (DB 쿼리 Proxy → Cloud SQL)
├── client.ts         ← Phase 5 완료 후 삭제
└── middleware.ts      ← Phase 5 완료 후 삭제
```

### 3-3. 페이지 전환 패턴

**Before (createBrowserClient 직접 쿼리):**
```tsx
'use client';
import { createBrowserClient } from '@/lib/supabase/client';

export default function QuestionsPage() {
  const supabase = createBrowserClient();
  const [data, setData] = useState([]);

  useEffect(() => {
    supabase.from('questions').select('*').then(({ data }) => setData(data));
  }, []);
}
```

**After (Server Component + Server Action):**
```tsx
import { getQuestions } from '@/actions/questions';

export default async function QuestionsPage() {
  const { data } = await getQuestions();
  return <QuestionList data={data} />;
}
```

---

## 4. 에러 처리

| 시나리오 | 에러 코드 | 사용자 메시지 |
|----------|----------|-------------|
| Firebase 토큰 만료 | 401 | "세션이 만료되었습니다. 다시 로그인해주세요." |
| 세션 쿠키 없음 | 302 → /login | (리다이렉트) |
| Firebase Auth 서버 오류 | 500 | "인증 서버 오류. 잠시 후 다시 시도해주세요." |
| 비밀번호 불일치 | 400 | "이메일 또는 비밀번호가 올바르지 않습니다." |
| 이메일 중복 | 409 | "이미 가입된 이메일입니다." |
| Cloud Run 프론트 5xx | 503 | 정적 에러 페이지 |

---

## 5. 구현 순서

### Wave 1: Cloud Run 프론트 (Phase 3-D) — 1-2일
- [ ] D1: Dockerfile `NEXT_PUBLIC_SITE_URL` → `https://bscamp.app`
- [ ] D2: Cloud Run `bscamp-web` 서비스 배포
- [ ] D3: 환경변수 설정 (Vercel env → Cloud Run env)
- [ ] D4: bscamp.app 도메인 매핑
- [ ] D5: SSL 인증서 + 헬스체크 확인
- [ ] D6: 주요 페이지 동작 테스트

### Wave 2: RLS 비활성화 (Phase 4) — 0.5-1일
**[2026-03-24 분석 결과] createBrowserClient() 9개 전부 Auth 전용. 데이터 쿼리 0개.**
**브라우저→API Route 전환 불필요. 서버 SERVICE_ROLE 통일 이미 완료.**
- [ ] R1: RLS 비활성화 migration 작성 (ALTER TABLE ... DISABLE ROW LEVEL SECURITY)
- [ ] R2: Cloud SQL에서 migration 실행
- [ ] R3: 빌드 검증 + 기능 테스트

### Wave 3: Firebase Auth (Phase 5) — 2-3주
- [ ] F1: Firebase Admin/Client SDK 설치 + 초기화 모듈
- [ ] F2: 세션 미들웨어 작성 (Firebase verifySessionCookie)
- [ ] F3: `/api/auth/session`, `/api/auth/logout`, `/api/auth/me` 구현
- [ ] F4: 로그인 페이지 (signInWithEmailAndPassword)
- [ ] F5: 회원가입 페이지 (createUserWithEmailAndPassword + profiles insert)
- [ ] F6: Server Action/API Route 32곳 auth.getUser() → Firebase 전환
- [ ] F7: 비밀번호 리셋/변경 페이지
- [ ] F8: signOut 3곳 → Firebase signOut
- [ ] F9: 사용자 마이그레이션 스크립트
- [ ] F10: ANON_KEY + createBrowserClient 완전 제거
- [ ] F11: 빌드 검증 + 전체 기능 테스트

### Wave 4: 정리
- [ ] C1: Supabase Auth 관련 코드 삭제 (client.ts, middleware.ts)
- [ ] C2: Dockerfile에서 Supabase NEXT_PUBLIC 변수 제거
- [ ] C3: Vercel 서비스 종료
- [ ] C4: 최종 Gap 분석 + 완료 보고서
