/**
 * Firebase Client SDK 초기화
 * 브라우저 전용 (Client Components)
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "bscamp.app",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "modified-shape-477110-h8",
};

let app: FirebaseApp | undefined;
let clientAuth: Auth | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const existing = getApps();
    app =
      existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseClientAuth(): Auth {
  if (!clientAuth) {
    clientAuth = getAuth(getFirebaseApp());
  }
  return clientAuth;
}
