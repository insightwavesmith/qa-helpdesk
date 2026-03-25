/**
 * 미들웨어용 Firebase 세션 검증 + 역할 기반 라우팅
 * src/lib/supabase/middleware.ts를 Firebase 기반으로 재작성
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/auth";

// 공개 경로 (인증 불필요)
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/pending",
  "/subscribe",
  "/unsubscribe",
  "/api/invite/validate",
  "/forgot-password",
  "/reset-password",
  "/api/auth/callback",
  "/api/auth/firebase-session",
  "/api/auth/firebase-logout",
  "/api/og",
  "/api/cron",
  "/api/internal",
  "/api/competitor",
  "/privacy",
  "/sitemap.xml",
  "/robots.txt",
];

// 정적 파일 및 공개 경로 매칭 ("/"는 middleware에서 직접 처리)
function isPublicPath(pathname: string): boolean {
  if (pathname.endsWith(".html")) return true;
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

// role 캐싱 cookie 이름
const ROLE_COOKIE = "x-user-role";
const ONBOARDING_COOKIE = "x-onboarding-status";
const COOKIE_MAX_AGE = 300; // 5분

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  // 1. Firebase 세션 쿠키 검증
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  let uid: string | null = null;

  if (sessionCookie) {
    try {
      // 런타임에서만 firebase-admin import (Edge Runtime 비호환 방지)
      const { getFirebaseAuth } = await import("@/lib/firebase/admin");
      const auth = getFirebaseAuth();
      const decoded = await auth.verifySessionCookie(sessionCookie, true);
      uid = decoded.uid;
    } catch {
      // 쿠키 무효 → 미인증 처리
      uid = null;
    }
  }

  const pathname = request.nextUrl.pathname;

  // 2. 공개 경로 체크: 미인증 사용자는 공개 경로만 접근 가능
  if (!uid && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 미인증 사용자의 공개 경로 접근 → 그대로 통과
  if (!uid) {
    return response;
  }

  // --- 이하 인증된 사용자 ---

  // Server Action 요청은 리다이렉트하지 않음 (Next-Action 헤더 존재)
  const isServerAction = request.headers.has("Next-Action");

  // 3. 인증된 사용자의 /login, /signup, / 접근 → /dashboard 리다이렉트
  if (
    !isServerAction &&
    (pathname === "/login" || pathname === "/signup" || pathname === "/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // 4. role + onboarding_status 조회 (cookie 캐싱 우선)
  let role = request.cookies.get(ROLE_COOKIE)?.value || null;
  let onboardingStatus =
    request.cookies.get(ONBOARDING_COOKIE)?.value || null;

  if (!role) {
    // cookie 없음 → profiles 조회
    try {
      const { query } = await import("@/lib/db/pool");
      const result = await query(
        "SELECT role, onboarding_status FROM profiles WHERE id = $1 LIMIT 1",
        [uid]
      );
      const profile: { role: string; onboarding_status: string } | null = result.rows[0] || null;

      if (profile) {
        const fetchedRole = profile.role as string;
        const fetchedStatus =
          (profile.onboarding_status as string) ?? "not_started";

        role = fetchedRole;
        onboardingStatus = fetchedStatus;

        // ⚠ httpOnly 추가 금지: client-side logout에서 document.cookie로 삭제 필요
        response.cookies.set(ROLE_COOKIE, fetchedRole, {
          path: "/",
          maxAge: COOKIE_MAX_AGE,
        });
        response.cookies.set(ONBOARDING_COOKIE, fetchedStatus, {
          path: "/",
          maxAge: COOKIE_MAX_AGE,
        });
      }
    } catch {
      // 런타임 에러 → PASS
    }
  }

  // profile 없는 경우 → 접근 허용 (trigger 미완료 대비)
  if (!role) {
    return response;
  }

  // 5. 역할별 라우팅

  // 인증 플로우 경로는 역할 라우팅 우회
  const AUTH_FLOW_PATHS = ["/reset-password", "/forgot-password"];
  if (AUTH_FLOW_PATHS.some((p) => pathname.startsWith(p))) {
    return response;
  }

  // admin / assistant → 전체 접근 허용
  if (role === "admin" || role === "assistant") {
    return response;
  }

  // student
  if (role === "student") {
    if (onboardingStatus !== "completed") {
      if (pathname.startsWith("/onboarding")) {
        return response;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return createRedirectWithCookies(url, response);
    }

    if (pathname.startsWith("/onboarding")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return createRedirectWithCookies(url, response);
    }

    return response;
  }

  // lead → /pending만 허용
  if (role === "lead") {
    if (pathname === "/pending") {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    return createRedirectWithCookies(url, response);
  }

  // member → /admin, /onboarding 차단
  if (role === "member") {
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/onboarding")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return createRedirectWithCookies(url, response);
    }
    return response;
  }

  // pending (레거시) → /pending 리다이렉트
  if (role === "pending") {
    if (pathname === "/pending") {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    return createRedirectWithCookies(url, response);
  }

  // 알 수 없는 role → PASS
  return response;
}

/**
 * 리다이렉트 시 response의 cookie를 보존하는 헬퍼.
 */
function createRedirectWithCookies(
  url: URL,
  sourceResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);

  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      path: "/",
    });
  });

  return redirectResponse;
}
