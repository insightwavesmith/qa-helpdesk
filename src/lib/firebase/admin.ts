/**
 * Firebase Admin SDK 초기화
 * 서버 전용 (Server Components, API Routes, Server Actions)
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
    // 서비스 계정 키 경로 (로컬 개발용)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountJson) {
      // 클라우드 환경: JSON 문자열 환경변수에서 서비스 계정 키 파싱
      const serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
      app = initializeApp({ credential: cert(serviceAccount) });
    } else if (serviceAccountPath) {
      // 로컬 개발: 파일에서 서비스 계정 키 읽기 (동기 방식 — 초기화 시 1회만 실행)
      const raw = fs.readFileSync(serviceAccountPath, "utf-8");
      const serviceAccount = JSON.parse(raw) as ServiceAccount;
      app = initializeApp({ credential: cert(serviceAccount) });
    } else {
      // GCP Cloud Run: ADC (Application Default Credentials) 자동 사용
      app = initializeApp();
    }
  }

  adminAuth = getAuth(app);
  return { app, auth: adminAuth };
}

export function getFirebaseAuth(): Auth {
  return getFirebaseAdmin().auth;
}
