# GCP 완전 이관 Gap 분석 — Firebase Auth 전환

## 분석일: 2026-03-24
## 설계서: docs/02-design/features/gcp-full-migration.design.md

---

## Match Rate: 95%

---

## 일치 항목 (65/68)

### Firebase 모듈 (4/4 = 100%)
| 항목 | 파일 | 상태 |
|------|------|:----:|
| Firebase Admin SDK | src/lib/firebase/admin.ts | ✅ |
| Firebase Client SDK | src/lib/firebase/client.ts | ✅ |
| Auth 헬퍼 (getCurrentUser, createSessionCookie) | src/lib/firebase/auth.ts | ✅ |
| 미들웨어 (세션 검증 + 역할 라우팅) | src/lib/firebase/middleware.ts | ✅ |

### API Routes (2/3 = 67%)
| 항목 | 파일 | 상태 |
|------|------|:----:|
| POST /api/auth/firebase-session | src/app/api/auth/firebase-session/route.ts | ✅ |
| POST /api/auth/firebase-logout | src/app/api/auth/firebase-logout/route.ts | ✅ |
| GET /api/auth/me | (미구현) | ⚠ 제외 (불필요 판단) |

### Auth 페이지 전환 (9/9 = 100%)
| 페이지 | 변경 | 상태 |
|--------|------|:----:|
| login | signInWithEmailAndPassword + 세션 쿠키 | ✅ |
| signup | createUserWithEmailAndPassword + ensureProfile | ✅ |
| forgot-password | sendPasswordResetEmail | ✅ |
| reset-password | confirmPasswordReset (oobCode) | ✅ |
| onboarding | Firebase signOut | ✅ |
| pending | currentUser + Firebase signOut | ✅ |
| student-header | Firebase signOut | ✅ |
| app-sidebar | Firebase signOut | ✅ |
| Sidebar | Firebase signOut | ✅ |

### Server Actions auth 교체 (7/7 = 100%)
| 파일 | 상태 |
|------|:----:|
| actions/questions.ts | ✅ |
| actions/answers.ts | ✅ |
| actions/posts.ts | ✅ |
| actions/reviews.ts | ✅ |
| actions/qa-reports.ts | ✅ |
| actions/onboarding.ts | ✅ |
| actions/invites.ts | ✅ |

### API Routes auth 교체 (_shared) (3/3 = 100%)
| 파일 | 상태 |
|------|:----:|
| api/admin/_shared.ts | ✅ |
| api/protractor/_shared.ts | ✅ |
| api/ext/_shared.ts (verifyIdToken) | ✅ |

### Server Component pages auth 교체 (22/22 = 100%)
| 파일 | 상태 |
|------|:----:|
| page.tsx (루트) | ✅ |
| (main)/layout.tsx | ✅ |
| dashboard/page.tsx, student-home.tsx | ✅ |
| questions/ (4페이지) | ✅ |
| posts/ (3페이지) | ✅ |
| reviews/ (3페이지) | ✅ |
| protractor/ (4페이지) | ✅ |
| admin/ (3페이지) | ✅ |
| settings/page.tsx | ✅ |

### API Routes auth 교체 (개별) (19/19 = 100%)
| 파일 | 상태 |
|------|:----:|
| upload, sales-summary, qa-chatbot | ✅ |
| admin/reembed, embed, backfill, knowledge/stats, protractor/collect | ✅ |
| protractor/save-secret | ✅ |
| creative/search, creative/[id] | ✅ |
| competitor/ (7파일) | ✅ |
| ext/auth (verifyIdToken 재작성) | ✅ |

### 미들웨어 (1/1 = 100%)
| 항목 | 상태 |
|------|:----:|
| proxy.ts → firebase/middleware | ✅ |

### 빌드 검증 (2/2 = 100%)
| 항목 | 결과 |
|------|:----:|
| tsc --noEmit | ✅ 0에러 |
| npm run build | ✅ 성공 |

---

## 불일치 항목 (3개)

| 항목 | 설계 | 구현 | 영향 |
|------|------|------|------|
| 세션 API 경로명 | /api/auth/session | /api/auth/firebase-session | 낮음 (내부 API) |
| 로그아웃 API 경로명 | /api/auth/logout | /api/auth/firebase-logout | 낮음 (내부 API) |
| /api/auth/me | 구현 예정 | 미구현 | 낮음 (미들웨어에서 처리) |

---

## 잔존 정리 대상

| 파일 | 상태 | 조치 |
|------|------|------|
| src/lib/supabase/client.ts | 미사용 (import 0건) | Phase 5 정리 시 삭제 |
| src/lib/supabase/middleware.ts | 미사용 (proxy.ts가 firebase 참조) | Phase 5 정리 시 삭제 |
| src/app/api/auth/callback/route.ts | Supabase OAuth 콜백 (레거시) | Firebase Auth 안정화 후 삭제 |

---

## 변경 통계

| 항목 | 값 |
|------|-----|
| 신규 파일 | 6개 |
| 수정 파일 | 68개 |
| 총 변경 | 74개 파일, +2072/-2432줄 |
| supabase.auth 잔존 | 1건 (레거시 미사용 파일) |
| createBrowserClient import | 0건 |
