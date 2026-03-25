/**
 * Firebase 서버측 인증 헬퍼
 * Server Components, Server Actions, API Routes에서 사용
 */
import { cookies } from "next/headers";
import { getFirebaseAuth } from "./admin";

export const SESSION_COOKIE_NAME = "__session";
const SESSION_EXPIRY = 5 * 24 * 60 * 60 * 1000; // 5일 (ms)

export interface AuthUser {
  uid: string;
  email: string | undefined;
}

/**
 * 현재 요청의 세션 쿠키에서 사용자 정보를 추출.
 * Server Component, Server Action, API Route에서 사용.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return null;

    const auth = getFirebaseAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * Firebase ID Token → 세션 쿠키 생성.
 * 로그인 성공 후 /api/auth/firebase-session에서 호출.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  const auth = getFirebaseAuth();
  return auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRY });
}

/**
 * Firebase ID Token 검증 (Bearer 헤더 기반, 크롬 확장용)
 */
export async function verifyIdToken(idToken: string): Promise<AuthUser | null> {
  try {
    const auth = getFirebaseAuth();
    const decoded = await auth.verifyIdToken(idToken);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
