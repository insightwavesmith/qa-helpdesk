"use server";

import { cache } from "react";
import { createServiceClient, type DbClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

/**
 * 같은 요청 내 profiles 중복 조회 방지용 캐시 함수
 */
export const getProfile = cache(async (uid: string) => {
  uid = toProfileId(uid);
  const svc = createServiceClient();
  const { data } = await svc
    .from("profiles")
    .select("id, name, role, email, shop_name, onboarding_status")
    .eq("id", uid)
    .single();
  return data;
});

/**
 * admin 전용: 회원 삭제, role 변경, 이메일 발송
 */
export async function requireAdmin(): Promise<DbClient> {
  const user = await getCurrentUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (profile?.role !== "admin") throw new Error("권한이 없습니다.");
  return svc;
}

/**
 * staff(admin + assistant): 회원 목록 조회, 콘텐츠 관리, 큐레이션, 이메일 미리보기, 프로텍터 조회
 */
export async function requireStaff(): Promise<DbClient> {
  const user = await getCurrentUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    throw new Error("권한이 없습니다.");
  }
  return svc;
}
