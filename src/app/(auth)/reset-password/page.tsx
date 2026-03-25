"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("oobCode");

    if (!code) {
      setError("유효하지 않은 링크입니다. 비밀번호 재설정을 다시 요청해 주세요.");
      setVerifying(false);
      return;
    }

    // oobCode 유효성 검증
    const auth = getFirebaseClientAuth();
    verifyPasswordResetCode(auth, code)
      .then(() => {
        setOobCode(code);
        setVerifying(false);
      })
      .catch(() => {
        setError("링크가 만료되었거나 유효하지 않습니다. 비밀번호 재설정을 다시 요청해 주세요.");
        setVerifying(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    if (!oobCode) {
      setError("유효하지 않은 링크입니다.");
      return;
    }

    setLoading(true);

    try {
      const auth = getFirebaseClientAuth();
      await confirmPasswordReset(auth, oobCode, password);

      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setError("링크가 만료되었거나 유효하지 않습니다.");
      } else if (code === "auth/weak-password") {
        setError("비밀번호가 너무 약합니다. 더 강력한 비밀번호를 사용해 주세요.");
      } else {
        setError("비밀번호 변경 중 오류가 발생했습니다.");
      }
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
            새 비밀번호 설정
          </h1>
          <p className="text-center text-[#6B7280] text-sm mb-6">
            새로운 비밀번호를 입력해 주세요.
          </p>

          {success ? (
            <div className="text-center">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700 mb-4">
                비밀번호가 변경되었습니다. 잠시 후 로그인 페이지로 이동합니다.
              </div>
              <Link
                href="/login"
                className="text-[#F75D5D] hover:underline font-medium text-sm"
              >
                로그인 페이지로 이동
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                  {error}
                  {error.includes("만료") && (
                    <div className="mt-2">
                      <Link
                        href="/forgot-password"
                        className="text-[#F75D5D] hover:underline font-medium"
                      >
                        재설정 링크 다시 받기
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {verifying && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-700">
                  링크를 확인하고 있습니다. 잠시만 기다려 주세요...
                </div>
              )}

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-[#111827] mb-2"
                >
                  새 비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="8자 이상"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                />
              </div>

              <div>
                <label
                  htmlFor="passwordConfirm"
                  className="block text-sm font-medium text-[#111827] mb-2"
                >
                  비밀번호 확인
                </label>
                <input
                  id="passwordConfirm"
                  type="password"
                  placeholder="비밀번호 재입력"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  required
                  className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading || verifying || !oobCode}
                className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    변경 중...
                  </>
                ) : (
                  "비밀번호 변경"
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
