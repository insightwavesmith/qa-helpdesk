"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://qa-helpdesk.vercel.app";

      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}/api/auth/callback?next=/reset-password`,
      });
    } catch {
      // 에러도 동일 메시지 표시 (정보 노출 방지)
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

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

        {/* 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h1 className="text-2xl font-bold mb-2 text-center text-[#111827]">
            비밀번호 재설정
          </h1>
          <p className="text-center text-[#6B7280] text-sm mb-6">
            가입하신 이메일을 입력하시면
            <br />
            비밀번호 재설정 링크를 보내드립니다.
          </p>

          {sent ? (
            <div className="text-center">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700 mb-6">
                입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다. 이메일을
                확인해 주세요.
              </div>
              <Link
                href="/login"
                className="text-[#F75D5D] hover:underline font-medium text-sm"
              >
                로그인으로 돌아가기
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-[#111827] mb-2"
                >
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    발송 중...
                  </>
                ) : (
                  "재설정 링크 보내기"
                )}
              </button>

              <div className="text-center mt-4">
                <Link
                  href="/login"
                  className="text-[#F75D5D] hover:underline font-medium text-sm"
                >
                  로그인으로 돌아가기
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
