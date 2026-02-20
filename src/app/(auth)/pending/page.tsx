"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Clock, Mail, LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function PendingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // T1: 마운트 시 DB에서 현재 role 재조회 → lead가 아니면 리다이렉트
  useEffect(() => {
    const checkRole = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          // 세션 없음 → /login
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, onboarding_status")
          .eq("id", user.id)
          .single();

        if (!profile || profile.role === "lead") {
          // 아직 승인 대기 중 → 현재 페이지 유지
          setChecking(false);
          return;
        }

        // 승인됨 → stale 캐시 쿠키 삭제 후 리다이렉트
        document.cookie = "x-user-role=; Max-Age=0; path=/";
        document.cookie = "x-onboarding-status=; Max-Age=0; path=/";

        if (
          profile.role === "student" &&
          profile.onboarding_status !== "completed"
        ) {
          router.replace("/onboarding");
        } else {
          router.replace("/dashboard");
        }
      } catch {
        setChecking(false);
      }
    };

    checkRole();
  }, [router]);

  // T3: 로그아웃 → 세션 종료 + 캐시 쿠키 삭제 + /login 이동
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      document.cookie = "x-user-role=; Max-Age=0; path=/";
      document.cookie = "x-onboarding-status=; Max-Age=0; path=/";
      router.replace("/login");
    } catch {
      setLoggingOut(false);
    }
  };

  // role 확인 중이면 로딩 표시
  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#F75D5D]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <Image
              src="/logo.png"
              alt="자사몰사관학교"
              width={40}
              height={40}
              className="rounded-lg object-cover"
            />
            <span className="ml-2 text-xl font-bold text-[#111827]">
              자사몰사관학교
            </span>
          </div>
          <p className="text-[#6B7280] font-medium">
            자사몰사관학교 헬프데스크
          </p>
        </div>

        {/* 승인 대기 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF2F2]">
            <Clock className="h-8 w-8 text-[#F75D5D]" />
          </div>
          <h1 className="text-xl font-bold text-[#111827] mb-2">
            승인 대기 중
          </h1>
          <p className="text-[#6B7280] text-base mb-6">
            가입 신청이 접수되었습니다!
          </p>

          <p className="text-[#6B7280] mb-4">
            관리자가 회원 정보를 확인한 후 승인해 드립니다.
            <br />
            승인이 완료되면 서비스를 이용하실 수 있습니다.
          </p>

          <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 p-3 mb-6">
            <Mail className="h-4 w-4 text-[#6B7280]" />
            <span className="text-sm text-[#6B7280]">
              승인 완료 시 이메일로 안내드립니다.
            </span>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 border border-gray-200 rounded-lg text-sm font-medium text-[#111827] hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {loggingOut ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      </div>
    </div>
  );
}
