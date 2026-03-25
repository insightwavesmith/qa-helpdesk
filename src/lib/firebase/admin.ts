/**
 * Firebase Admin SDK 초기화
 * 서버 전용 (Server Components, API Routes, Server Actions)
 *
 * 인증 우선순위:
 * 1. FIREBASE_SERVICE_ACCOUNT_JSON (JSON 문자열 — Vercel 프로덕션용)
 * 2. GOOGLE_APPLICATION_CREDENTIALS (파일 경로 — 로컬 개발용)
 * 3. ADC (Application Default Credentials — Cloud Run)
 */
import { initializeApp, getApps, cert, type App, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import fs from "fs";

let app: App | undefined;
let adminAuth: Auth | undefined;

function getFirebaseAdmin(): { app: App; auth: Auth } {
  if (app && adminAuth) return { app, auth: adminAuth };

  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0];
  } else {
    // 1. JSON 문자열 환경변수 (Vercel 프로덕션)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      app = initializeApp({ credential: cert(serviceAccount) });
    } else {
      // 2. 파일 경로 (로컬 개발)
      const serviceAccountPath =
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

      if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        const raw = fs.readFileSync(serviceAccountPath, "utf-8");
        const serviceAccount = JSON.parse(raw) as ServiceAccount;
        app = initializeApp({ credential: cert(serviceAccount) });
      } else {
        // 3. ADC (Cloud Run 등)
        app = initializeApp();
      }
    }
  }

  adminAuth = getAuth(app);
  return { app, auth: adminAuth };
}

export function getFirebaseAuth(): Auth {
  return getFirebaseAdmin().auth;
}
