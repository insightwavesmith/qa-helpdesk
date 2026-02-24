"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message?.includes("Invalid login credentials")) {
          setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        } else if (error.message?.includes("Failed to fetch") || error.status === 0) {
          setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        } else {
          setError("로그인 중 오류가 발생했습니다.");
        }
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <Image src="/logo.png" alt="자사몰사관학교" width={40} height={40} className="rounded-lg object-cover" />
            <span className="ml-2 text-xl font-bold text-[#111827]">자사몰사관학교</span>
          </div>
          <p className="text-[#6B7280] font-medium">자사몰사관학교 헬프데스크</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h1 className="text-2xl font-bold mb-6 text-center text-[#111827]">로그인</h1>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#111827] mb-2">
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

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#111827] mb-2">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
              />
            </div>

            <div className="text-right mt-1">
              <Link href="/forgot-password" className="text-sm text-[#F75D5D] hover:underline">
                비밀번호를 잊으셨나요?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#6B7280] text-sm">
              계정이 없으신가요?{" "}
              <Link href="/signup" className="text-[#F75D5D] hover:underline font-medium">
                회원가입
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
