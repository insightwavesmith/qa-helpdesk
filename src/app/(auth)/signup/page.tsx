"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { updateBusinessCertUrl } from "@/actions/auth";
import Image from "next/image";
import { Loader2, Upload, FileCheck, CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    shopUrl: "",
    shopName: "",
    businessNumber: "",
    cohort: "",
  });
  const [businessFile, setBusinessFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 초대코드 관련 상태
  const [inviteCode, setInviteCode] = useState("");
  const [isStudentMode, setIsStudentMode] = useState(false);
  const [inviteValidating, setInviteValidating] = useState(false);
  const [inviteCohort, setInviteCohort] = useState("");
  const [inviteError, setInviteError] = useState("");

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBusinessFile(file);
    }
  };

  const validateInviteCode = async (code: string) => {
    if (!code.trim()) {
      setIsStudentMode(false);
      setInviteCohort("");
      setInviteError("");
      return;
    }

    setInviteValidating(true);
    setInviteError("");

    try {
      const res = await fetch("/api/invite/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (data.valid) {
        setIsStudentMode(true);
        setInviteCohort(data.cohort || "");
        setFormData((prev) => ({ ...prev, cohort: data.cohort || "" }));
        setInviteError("");
      } else {
        setIsStudentMode(false);
        setInviteCohort("");
        setInviteError(data.error || "유효하지 않은 초대코드입니다");
      }
    } catch {
      setIsStudentMode(false);
      setInviteCohort("");
      setInviteError("초대코드 확인 중 오류가 발생했습니다");
    } finally {
      setInviteValidating(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (formData.password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    // T5: lead 모드 사업자등록번호 서버 사이드 validation
    if (!isStudentMode && !formData.businessNumber.trim()) {
      setError("사업자등록번호를 입력해주세요.");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // signUp에 metadata 포함 → trigger가 profiles 자동 생성
      const metadata: Record<string, string | null> = {
        name: formData.name,
      };

      if (isStudentMode) {
        // student 모드: 이름 + 기수 + 초대코드만
        metadata.cohort = formData.cohort || null;
        metadata.invite_code = inviteCode.trim();
      } else {
        // lead 모드: 사업자정보 필수
        metadata.phone = formData.phone;
        // shopUrl https:// 자동 보완
        let finalShopUrl = formData.shopUrl.trim();
        if (finalShopUrl && !finalShopUrl.startsWith("http")) {
          finalShopUrl = `https://${finalShopUrl}`;
        }
        metadata.shop_url = finalShopUrl || null;
        metadata.shop_name = formData.shopName;
        metadata.business_number = formData.businessNumber;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: metadata,
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!authData.user) {
        setError("회원가입 중 오류가 발생했습니다.");
        return;
      }

      // 사업자등록증 파일 업로드 (lead 모드에서만)
      if (!isStudentMode && businessFile) {
        const fileExt = businessFile.name.split(".").pop();
        const filePath = `business-docs/${authData.user.id}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, businessFile);

        if (!uploadError) {
          const {
            data: { publicUrl },
          } = supabase.storage.from("documents").getPublicUrl(filePath);
          // server action으로 프로필 업데이트 (service role = RLS 우회)
          await updateBusinessCertUrl(authData.user.id, publicUrl);
        }
      }

      // 가입 후 리다이렉트 분기
      if (isStudentMode) {
        router.push("/onboarding");
      } else {
        router.push("/pending");
      }
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <Image src="/logo.png" alt="자사몰사관학교" width={40} height={40} className="rounded-lg object-cover" />
            <span className="ml-2 text-xl font-bold text-[#111827]">자사몰사관학교</span>
          </div>
          <p className="text-[#6B7280] font-medium">자사몰사관학교 헬프데스크</p>
        </div>

        {/* 회원가입 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h1 className="text-2xl font-bold mb-2 text-center text-[#111827]">회원가입</h1>
          <p className="text-center text-[#6B7280] text-sm mb-6">
            {isStudentMode ? (
              "수강생 모드로 가입합니다."
            ) : (
              <>
                사업자 정보를 입력해주세요.
                <br />
                관리자 승인 후 서비스를 이용하실 수 있습니다.
              </>
            )}
          </p>

          <form onSubmit={handleSignup} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* 초대코드 섹션 */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                초대코드
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="초대코드가 있으면 입력하세요"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value);
                    // 코드를 비우면 lead 모드로 복귀
                    if (!e.target.value.trim()) {
                      setIsStudentMode(false);
                      setInviteCohort("");
                      setInviteError("");
                    }
                  }}
                  onBlur={() => {
                    if (inviteCode.trim()) {
                      validateInviteCode(inviteCode);
                    }
                  }}
                  className="flex-1 px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => validateInviteCode(inviteCode)}
                  disabled={inviteValidating || !inviteCode.trim()}
                  className="px-4 h-11 bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  {inviteValidating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "확인"
                  )}
                </button>
              </div>
              {inviteError && (
                <p className="mt-1.5 text-sm text-red-500">{inviteError}</p>
              )}
              {isStudentMode && inviteCohort && (
                <div className="mt-1.5 flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>수강생 모드 ({inviteCohort})</span>
                </div>
              )}
            </div>

            <Separator className="bg-gray-200" />

            {/* 계정 정보 */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                계정 정보
              </h3>
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-[#111827]">
                    이메일 *
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                    className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-[#111827]">
                      비밀번호 *
                    </label>
                    <input
                      id="password"
                      type="password"
                      placeholder="8자 이상"
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      required
                      className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="passwordConfirm" className="block text-sm font-medium text-[#111827]">
                      비밀번호 확인 *
                    </label>
                    <input
                      id="passwordConfirm"
                      type="password"
                      placeholder="비밀번호 재입력"
                      value={formData.passwordConfirm}
                      onChange={(e) =>
                        updateField("passwordConfirm", e.target.value)
                      }
                      required
                      className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator className="bg-gray-200" />

            {/* 개인 정보 */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                개인 정보
              </h3>
              <div className="space-y-3">
                <div className={!isStudentMode ? "grid grid-cols-2 gap-3" : ""}>
                  <div className="space-y-2">
                    <label htmlFor="name" className="block text-sm font-medium text-[#111827]">
                      이름 *
                    </label>
                    <input
                      id="name"
                      placeholder="홍길동"
                      value={formData.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      required
                      className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                    />
                  </div>
                  {!isStudentMode && (
                    <div className="space-y-2">
                      <label htmlFor="phone" className="block text-sm font-medium text-[#111827]">
                        전화번호 *
                      </label>
                      <input
                        id="phone"
                        placeholder="010-1234-5678"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        required
                        className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 사업 정보 (lead 모드에서만 표시) */}
            {!isStudentMode && (
              <>
                <Separator className="bg-gray-200" />

                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    사업 정보
                  </h3>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label htmlFor="shopName" className="block text-sm font-medium text-[#111827]">
                        쇼핑몰 이름 *
                      </label>
                      <input
                        id="shopName"
                        placeholder="내 쇼핑몰"
                        value={formData.shopName}
                        onChange={(e) => updateField("shopName", e.target.value)}
                        required
                        className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="shopUrl" className="block text-sm font-medium text-[#111827]">
                        쇼핑몰 URL
                      </label>
                      <input
                        id="shopUrl"
                        placeholder="https://myshop.com"
                        value={formData.shopUrl}
                        onChange={(e) => updateField("shopUrl", e.target.value)}
                        className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="businessNumber" className="block text-sm font-medium text-[#111827]">
                        사업자등록번호 *
                      </label>
                      <input
                        id="businessNumber"
                        placeholder="000-00-00000"
                        value={formData.businessNumber}
                        onChange={(e) =>
                          updateField("businessNumber", e.target.value)
                        }
                        required
                        className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                      />
                    </div>

                    {/* 사업자등록증 업로드 */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-[#111827]">
                        사업자등록증 (선택)
                      </label>
                      <div
                        className="flex items-center gap-3 rounded-lg border-2 border-dashed border-gray-300 p-6 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                        {businessFile ? (
                          <>
                            <FileCheck className="h-8 w-8 text-[#F75D5D] shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-[#111827] truncate">
                                {businessFile.name}
                              </p>
                              <p className="text-xs text-[#6B7280]">
                                {(businessFile.size / 1024 / 1024).toFixed(1)}MB
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-[#6B7280] shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-[#111827]">
                                클릭하여 파일 선택
                              </p>
                              <p className="text-xs text-[#6B7280]">
                                이미지 또는 PDF (최대 10MB)
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading || (!isStudentMode && !formData.businessNumber.trim())}
              className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  가입 중...
                </>
              ) : (
                "회원가입"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[#6B7280] text-sm">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="text-[#F75D5D] hover:underline font-medium">
                로그인
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
