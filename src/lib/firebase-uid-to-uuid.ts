import { v5 as uuidv5, validate as uuidValidate } from "uuid";

// DNS namespace — Firebase UID → UUID 변환 전용
const FIREBASE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Firebase UID를 profiles.id UUID 형식으로 변환.
 * 이미 UUID 형식이면 그대로 반환 (기존 Supabase Auth 유저 호환).
 */
export function toProfileId(uid: string): string {
  if (uuidValidate(uid)) return uid;
  return uuidv5(uid, FIREBASE_NAMESPACE);
}
