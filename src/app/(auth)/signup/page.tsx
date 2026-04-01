"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { getFirebaseClientAuth } from "@/lib/firebase/client";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { uploadFile } from "@/lib/upload-client";
import { mp } from "@/lib/mixpanel";
import { ensureProfile, updateBusinessCertUrl, savePrivacyConsent } from "@/actions/auth";
import { useInviteCode as consumeInviteCode } from "@/actions/invites";
import Image from "next/image";
import { Loader2, Upload, FileCheck, CheckCircle2 } from "lucide-react";

// --- T1: Validation 정규식 ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^01[016789]-?\d{3,4}-?\d{4}$/;
const BIZ_NUMBER_REGEX = /^\d{3}-?\d{2}-?\d{5}$/;

// --- T1: 자동 하이픈 포맷팅 ---
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatBusinessNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// --- T2: Firebase 에러 한국어 매핑 ---
const FIREBASE_ERROR_MAP: Record<string, string> = {
  "auth/email-already-in-use": "이미 가입된 이메일입니다",
  "auth/invalid-email": "올바른 이메일 형식이 아닙니다",
  "auth/weak-password": "비밀번호는 6자 이상이어야 합니다",
  "auth/operation-not-allowed": "현재 회원가입이 제한되어 있습니다",
  "auth/too-many-requests": "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해 주세요.",
};

function mapFirebaseError(code: string): string {
  return FIREBASE_ERROR_MAP[code] || "회원가입 중 오류가 발생했습니다. 다시 시도해 주세요.";
}

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
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
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

  // T1: 필드별 에러 + 터치 상태
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // T1: 필드 유효성 검사
  const validateField = (field: string, value: string): string => {
    switch (field) {
      case "email":
        if (!value.trim()) return "필수 항목입니다";
        if (!EMAIL_REGEX.test(value)) return "올바른 이메일 형식이 아닙니다";
        return "";
      case "password":
        if (!value) return "필수 항목입니다";
        if (value.length < 8) return "비밀번호는 8자 이상이어야 합니다";
        return "";
      case "passwordConfirm":
        if (!value) return "필수 항목입니다";
        if (value !== formData.password) return "비밀번호가 일치하지 않습니다";
        return "";
      case "name":
        if (!value.trim()) return "필수 항목입니다";
        return "";
      case "phone":
        if (!value.trim()) return "필수 항목입니다";
        if (!PHONE_REGEX.test(value))
          return "올바른 전화번호 형식이 아닙니다";
        return "";
      case "shopName":
        if (!value.trim()) return "필수 항목입니다";
        return "";
      case "businessNumber":
        if (!value.trim()) return "필수 항목입니다";
        if (!BIZ_NUMBER_REGEX.test(value))
          return "올바른 사업자등록번호 형식이 아닙니다";
        return "";
      default:
        return "";
    }
  };

  // T1: 필드 업데이트 + 자동 포맷팅 + 실시간 검증
  const updateField = (field: string, value: string) => {
    let formatted = value;
    if (field === "phone") formatted = formatPhone(value);
    if (field === "businessNumber") formatted = formatBusinessNumber(value);

    setFormData((prev) => ({ ...prev, [field]: formatted }));

    // 터치된 필드는 실시간 검증
    if (touched[field]) {
      setFieldErrors((prev) => ({
        ...prev,
        [field]: validateField(field, formatted),
      }));
    }

    // 비밀번호 확인 실시간 체크 (입력 중에도 불일치 표시)
    if (field === "passwordConfirm" && formatted) {
      setFieldErrors((prev) => ({
        ...prev,
        passwordConfirm:
          formatted !== formData.password
            ? "비밀번호가 일치하지 않습니다"
            : "",
      }));
    }

    // 비밀번호 변경 시 확인 필드 재검증
    if (field === "password" && formData.passwordConfirm) {
      setFieldErrors((prev) => ({
        ...prev,
        passwordConfirm:
          formData.passwordConfirm !== formatted
            ? "비밀번호가 일치하지 않습니다"
            : "",
      }));
    }
  };

  // T1: blur 시 터치 상태 + 검증
  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFieldErrors((prev) => ({
      ...prev,
      [field]: validateField(
        field,
        formData[field as keyof typeof formData]
      ),
    }));
  };

  // T1: 폼 전체 유효성 (submit 버튼 활성화 조건)
  const isFormValid = (() => {
    const base =
      formData.email.trim() !== "" &&
      EMAIL_REGEX.test(formData.email) &&
      formData.password.length >= 8 &&
      formData.passwordConfirm === formData.password &&
      formData.name.trim() !== "";

    if (isStudentMode) return base && privacyAgreed && formData.phone.trim() !== "" && PHONE_REGEX.test(formData.phone);

    return (
      base &&
      privacyAgreed &&
      formData.phone.trim() !== "" &&
      PHONE_REGEX.test(formData.phone) &&
      formData.shopName.trim() !== "" &&
      formData.businessNumber.trim() !== "" &&
      BIZ_NUMBER_REGEX.test(formData.businessNumber)
    );
  })();

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

    // T1: 모든 필드 검증
    const fieldsToValidate = isStudentMode
      ? ["email", "password", "passwordConfirm", "name", "phone"]
      : [
          "email",
          "password",
          "passwordConfirm",
          "name",
          "phone",
          "shopName",
          "businessNumber",
        ];

    const newErrors: Record<string, string> = {};
    const newTouched: Record<string, boolean> = {};
    let hasError = false;

    for (const field of fieldsToValidate) {
      newTouched[field] = true;
      const err = validateField(
        field,
        formData[field as keyof typeof formData]
      );
      if (err) {
        newErrors[field] = err;
        hasError = true;
      }
    }

    setTouched((prev) => ({ ...prev, ...newTouched }));
    setFieldErrors((prev) => ({ ...prev, ...newErrors }));

    if (hasError) return;

    setLoading(true);

    try {
      // metadata는 ensureProfile 호출 시 사용 (Firebase signUp에는 불포함) → trigger가 profiles 자동 생성
      const metadata: Record<string, string | null> = {
        name: formData.name,
      };

      if (isStudentMode) {
        // student 모드: 이름 + 전화번호 + 기수 + 초대코드
        metadata.phone = formData.phone;
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

      const auth = getFirebaseClientAuth();
      const cred = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );

      // 세션 쿠키 생성
      const idToken = await cred.user.getIdToken();
      const sessionRes = await fetch("/api/auth/firebase-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!sessionRes.ok) throw new Error("세션 생성 실패");

      const uid = cred.user.uid;

      // Phase 5: Cloud SQL 환경에서 profile 생성 (trigger 대체)
      // 실패 시 1회 재시도, 그래도 실패하면 Firebase 계정 삭제 + 에러 표시
      const profilePayload = {
        name: metadata.name || "",
        phone: metadata.phone || undefined,
        shop_url: metadata.shop_url || undefined,
        shop_name: metadata.shop_name || undefined,
        business_number: metadata.business_number || undefined,
        cohort: metadata.cohort || undefined,
        invite_code: metadata.invite_code || undefined,
      };

      let profileResult = await ensureProfile(uid, formData.email, profilePayload);

      // 1회 재시도
      if (profileResult.error) {
        console.warn("[signup] ensureProfile 1차 실패, 재시도:", profileResult.error);
        await new Promise((r) => setTimeout(r, 1000));
        profileResult = await ensureProfile(uid, formData.email, profilePayload);
      }

      if (profileResult.error) {
        console.error("[signup] ensureProfile 최종 실패:", profileResult.error);
        // Firebase 계정 삭제하여 broken 상태 방지
        try {
          await deleteUser(cred.user);
        } catch (delErr) {
          console.error("[signup] Firebase 계정 삭제 실패:", delErr);
        }
        setError("프로필 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        setLoading(false);
        return;
      }

      // 사업자등록증 파일 업로드 (lead 모드에서만)
      if (!isStudentMode && businessFile) {
        const fileExt = businessFile.name.split(".").pop();
        const filePath = `business-docs/${uid}.${fileExt}`;
        try {
          const publicUrl = await uploadFile(businessFile, "documents", filePath);
          // server action으로 프로필 업데이트 (service role = RLS 우회)
          await updateBusinessCertUrl(uid, publicUrl);
        } catch (uploadErr) {
          console.error("[signup] 사업자등록증 업로드 실패:", uploadErr);
          // 업로드 실패해도 가입 자체는 완료 → 리다이렉트 진행
        }
      }

      // 개인정보처리방침 동의 시점 DB 기록
      // 실패해도 가입 자체는 완료 → 리다이렉트 진행
      try {
        await savePrivacyConsent(uid);
      } catch (consentErr) {
        console.error("[signup] savePrivacyConsent failed:", consentErr);
      }

      // 수강생 모드: 초대코드 사용 처리 (used_count 증가 + student_registry 매칭)
      // 실패해도 가입 자체는 완료 → 온보딩으로 넘어가야 함
      if (isStudentMode && inviteCode.trim()) {
        try {
          const inviteResult = await consumeInviteCode(
            uid,
            formData.email,
            inviteCode.trim()
          );
          if (inviteResult?.error) {
            console.error("[signup] consumeInviteCode returned error:", inviteResult.error);
          }
        } catch (inviteErr) {
          console.error("[signup] consumeInviteCode failed:", inviteErr);
          // 초대코드 처리 실패해도 가입은 완료 — 리다이렉트 계속 진행
        }
      }

      // Mixpanel: 회원가입 완료 트래킹
      mp.track("signup_completed", {
        user_type: isStudentMode ? "student" : "lead",
        cohort: formData.cohort || null,
      });

      // 가입 후 리다이렉트 분기
      if (isStudentMode) {
        router.push("/onboarding");
      } else {
        router.push("/pending");
      }
    } catch (err) {
      console.error("[signup] unexpected error:", err);
      const code = (err as { code?: string }).code;
      if (code) {
        setError(mapFirebaseError(code));
      } else {
        setError("일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
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
        </div>

        {/* 회원가입 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h1 className="text-2xl font-bold mb-2 text-center text-[#111827]">
            회원가입
          </h1>
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
            {/* T2: 서버 에러 (Supabase 등) 상단 표시 */}
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
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-[#111827]"
                  >
                    이메일 *
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    onBlur={() => handleBlur("email")}
                    required
                    className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                      fieldErrors.email ? "border-red-300" : "border-gray-200"
                    }`}
                  />
                  {fieldErrors.email && (
                    <p className="text-xs text-red-500 mt-1">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-[#111827]"
                    >
                      비밀번호 *
                    </label>
                    <input
                      id="password"
                      type="password"
                      placeholder="8자 이상"
                      value={formData.password}
                      onChange={(e) => updateField("password", e.target.value)}
                      onBlur={() => handleBlur("password")}
                      required
                      className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                        fieldErrors.password
                          ? "border-red-300"
                          : "border-gray-200"
                      }`}
                    />
                    {fieldErrors.password && (
                      <p className="text-xs text-red-500 mt-1">
                        {fieldErrors.password}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="passwordConfirm"
                      className="block text-sm font-medium text-[#111827]"
                    >
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
                      onBlur={() => handleBlur("passwordConfirm")}
                      required
                      className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                        fieldErrors.passwordConfirm
                          ? "border-red-300"
                          : "border-gray-200"
                      }`}
                    />
                    {fieldErrors.passwordConfirm && (
                      <p className="text-xs text-red-500 mt-1">
                        {fieldErrors.passwordConfirm}
                      </p>
                    )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-[#111827]"
                    >
                      이름 *
                    </label>
                    <input
                      id="name"
                      placeholder="홍길동"
                      value={formData.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      onBlur={() => handleBlur("name")}
                      required
                      className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                        fieldErrors.name
                          ? "border-red-300"
                          : "border-gray-200"
                      }`}
                    />
                    {fieldErrors.name && (
                      <p className="text-xs text-red-500 mt-1">
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-[#111827]"
                    >
                      전화번호 *
                    </label>
                    <input
                      id="phone"
                      placeholder="010-1234-5678"
                      value={formData.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      onBlur={() => handleBlur("phone")}
                      required
                      className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                        fieldErrors.phone
                          ? "border-red-300"
                          : "border-gray-200"
                      }`}
                    />
                    {fieldErrors.phone && (
                      <p className="text-xs text-red-500 mt-1">
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>
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
                      <label
                        htmlFor="shopName"
                        className="block text-sm font-medium text-[#111827]"
                      >
                        쇼핑몰 이름 *
                      </label>
                      <input
                        id="shopName"
                        placeholder="내 쇼핑몰"
                        value={formData.shopName}
                        onChange={(e) =>
                          updateField("shopName", e.target.value)
                        }
                        onBlur={() => handleBlur("shopName")}
                        required
                        className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                          fieldErrors.shopName
                            ? "border-red-300"
                            : "border-gray-200"
                        }`}
                      />
                      {fieldErrors.shopName && (
                        <p className="text-xs text-red-500 mt-1">
                          {fieldErrors.shopName}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="shopUrl"
                        className="block text-sm font-medium text-[#111827]"
                      >
                        쇼핑몰 URL
                      </label>
                      <input
                        id="shopUrl"
                        placeholder="https://myshop.com"
                        value={formData.shopUrl}
                        onChange={(e) =>
                          updateField("shopUrl", e.target.value)
                        }
                        className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="businessNumber"
                        className="block text-sm font-medium text-[#111827]"
                      >
                        사업자등록번호 *
                      </label>
                      <input
                        id="businessNumber"
                        placeholder="000-00-00000"
                        value={formData.businessNumber}
                        onChange={(e) =>
                          updateField("businessNumber", e.target.value)
                        }
                        onBlur={() => handleBlur("businessNumber")}
                        required
                        className={`w-full px-4 h-11 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400 ${
                          fieldErrors.businessNumber
                            ? "border-red-300"
                            : "border-gray-200"
                        }`}
                      />
                      {fieldErrors.businessNumber && (
                        <p className="text-xs text-red-500 mt-1">
                          {fieldErrors.businessNumber}
                        </p>
                      )}
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
                                {(
                                  businessFile.size /
                                  1024 /
                                  1024
                                ).toFixed(1)}
                                MB
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

            {/* 개인정보처리방침 필수동의 */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="privacyAgreed"
                checked={privacyAgreed}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 accent-[#F75D5D] focus:ring-[#F75D5D]"
              />
              <label htmlFor="privacyAgreed" className="text-sm text-[#374151]">
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F75D5D] hover:underline font-medium"
                >
                  개인정보처리방침
                </a>
                에 동의합니다 (필수)
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !isFormValid}
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
              <Link
                href="/login"
                className="text-[#F75D5D] hover:underline font-medium"
              >
                로그인
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
