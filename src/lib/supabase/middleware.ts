// Middleware용 Supabase 클라이언트 (세션 갱신 + 역할 기반 라우팅)
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

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
  "/api/og",
];

// 정확히 "/" 만 매칭 (startsWith("/")는 모든 경로 매칭하므로 별도 처리)
function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((path) => pathname.startsWith(path));
}

// role 캐싱 cookie 이름
const ROLE_COOKIE = "x-user-role";
const ONBOARDING_COOKIE = "x-onboarding-status";
const COOKIE_MAX_AGE = 300; // 5분

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // 1. Supabase SSR client 생성 (세션 갱신용)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 2. 사용자 인증 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 3. 공개 경로 체크: 미인증 사용자는 공개 경로만 접근 가능
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 미인증 사용자의 공개 경로 접근 → 그대로 통과
  if (!user) {
    return supabaseResponse;
  }

  // --- 이하 인증된 사용자 ---

  // 4. 인증된 사용자의 /login, /signup 접근 → /dashboard 리다이렉트
  if (pathname === "/login" || pathname === "/signup") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // 5. role + onboarding_status 조회 (cookie 캐싱 우선)
  let role = request.cookies.get(ROLE_COOKIE)?.value || null;
  let onboardingStatus =
    request.cookies.get(ONBOARDING_COOKIE)?.value || null;

  if (!role) {
    // cookie 없음 → service role로 profiles 조회
    try {
      const svc = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: profile } = await svc
        .from("profiles")
        .select("role, onboarding_status")
        .eq("id", user.id)
        .single();

      if (profile) {
        const fetchedRole = profile.role as string;
        const fetchedStatus =
          (profile.onboarding_status as string) ?? "not_started";

        role = fetchedRole;
        onboardingStatus = fetchedStatus;

        // supabaseResponse에 캐싱 cookie 설정
        // ⚠ httpOnly 추가 금지: client-side logout에서 document.cookie로 삭제 필요
        supabaseResponse.cookies.set(ROLE_COOKIE, fetchedRole, {
          path: "/",
          maxAge: COOKIE_MAX_AGE,
        });
        supabaseResponse.cookies.set(
          ONBOARDING_COOKIE,
          fetchedStatus,
          {
            path: "/",
            maxAge: COOKIE_MAX_AGE,
          }
        );
      }
      // profile이 없으면 (auth trigger 미완료 등) → role=null → PASS
    } catch {
      // service role key 미설정 등 런타임 에러 → PASS
    }
  }

  // profile 없는 경우 → 접근 허용 (trigger 미완료 대비)
  if (!role) {
    return supabaseResponse;
  }

  // 6. 역할별 라우팅

  // 인증 플로우 경로는 역할 라우팅 우회 (비밀번호 재설정 등)
  const AUTH_FLOW_PATHS = ["/reset-password", "/forgot-password"];
  if (AUTH_FLOW_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // admin / assistant → 전체 접근 허용
  if (role === "admin" || role === "assistant") {
    return supabaseResponse;
  }

  // student
  if (role === "student") {
    if (onboardingStatus !== "completed") {
      // 온보딩 미완료: /onboarding만 허용, 나머지는 /onboarding으로 리다이렉트
      if (pathname.startsWith("/onboarding")) {
        return supabaseResponse;
      }
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      return createRedirectWithCookies(url, supabaseResponse);
    }

    // 온보딩 완료: /onboarding 접근 → /dashboard (온보딩 불필요)
    if (pathname.startsWith("/onboarding")) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return createRedirectWithCookies(url, supabaseResponse);
    }

    // 온보딩 완료: 전체 접근 허용
    return supabaseResponse;
  }

  // lead → /pending만 허용
  if (role === "lead") {
    if (pathname === "/pending") {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    return createRedirectWithCookies(url, supabaseResponse);
  }

  // member → student와 동일하게 StudentHeader 사용, /admin과 /onboarding만 차단
  if (role === "member") {
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/onboarding")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return createRedirectWithCookies(url, supabaseResponse);
    }

    return supabaseResponse;
  }

  // pending (레거시) → /pending 리다이렉트
  if (role === "pending") {
    if (pathname === "/pending") {
      return supabaseResponse;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    return createRedirectWithCookies(url, supabaseResponse);
  }

  // 알 수 없는 role → PASS
  return supabaseResponse;
}

/**
 * 리다이렉트 시 supabaseResponse의 cookie를 보존하는 헬퍼.
 * Supabase SSR의 setAll에서 설정한 세션 cookie와 role 캐싱 cookie를 모두 전달.
 */
function createRedirectWithCookies(
  url: URL,
  sourceResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);

  // 원본 response의 모든 cookie를 리다이렉트 response에 복사
  sourceResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      path: "/",
    });
  });

  return redirectResponse;
}
