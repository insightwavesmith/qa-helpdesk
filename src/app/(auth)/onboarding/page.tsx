"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Loader2,
  MessageCircleQuestion,
  BookOpen,
  Target,
  Check,
  ArrowRight,
  PartyPopper,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOnboardingProfile,
  updateOnboardingStep,
  saveOnboardingProfile,
  saveAdAccount,
  completeOnboarding,
} from "@/actions/onboarding";

interface OnboardingProfile {
  name: string;
  cohort: string | null;
  shop_name: string | null;
  shop_url: string | null;
  annual_revenue: string | null;
  monthly_ad_budget: string | null;
  category: string | null;
  meta_account_id: string | null;
  mixpanel_project_id: string | null;
  mixpanel_secret_key: string | null;
  onboarding_step: number;
  onboarding_status: string;
}

const STEP_LABELS = ["환영", "프로필", "광고계정", "완료"];

const BUDGET_OPTIONS = [
  { value: "under_100", label: "100만원 미만" },
  { value: "100_500", label: "100~500만원" },
  { value: "500_1000", label: "500~1,000만원" },
  { value: "over_1000", label: "1,000만원 이상" },
];

const ANNUAL_REVENUE_OPTIONS = [
  { value: "under_1억", label: "1억 미만" },
  { value: "1억_5억", label: "1억~5억" },
  { value: "5억_10억", label: "5억~10억" },
  { value: "10억_50억", label: "10억~50억" },
  { value: "over_50억", label: "50억 이상" },
];

const CATEGORY_OPTIONS = [
  { value: "fashion", label: "패션" },
  { value: "beauty", label: "뷰티" },
  { value: "food", label: "식품" },
  { value: "living", label: "리빙" },
  { value: "etc", label: "기타" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center mb-10">
      {STEP_LABELS.map((label, index) => (
        <div key={label} className="flex items-center">
          {/* Circle */}
          <div className="flex flex-col items-center">
            <div
              className={`
                w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all
                ${
                  index < currentStep
                    ? "bg-[#F75D5D] text-white"
                    : index === currentStep
                      ? "bg-[#F75D5D] text-white ring-4 ring-[#F75D5D]/20"
                      : "bg-gray-100 text-gray-400"
                }
              `}
            >
              {index < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                index
              )}
            </div>
            <span
              className={`mt-1.5 text-xs font-medium ${
                index <= currentStep ? "text-[#111827]" : "text-gray-400"
              }`}
            >
              {label}
            </span>
          </div>
          {/* Connecting line */}
          {index < STEP_LABELS.length - 1 && (
            <div
              className={`w-10 sm:w-16 h-0.5 mx-1 sm:mx-2 mb-5 transition-colors ${
                index < currentStep ? "bg-[#F75D5D]" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function StepWelcome({
  profile,
  onNext,
}: {
  profile: OnboardingProfile;
  onNext: () => void;
}) {
  const services = [
    {
      icon: MessageCircleQuestion,
      title: "Q&A 질문하기",
      description:
        "광고 운영 중 궁금한 점을 질문하면 AI가 즉시 답변하고, 전문가가 추가 피드백을 드립니다.",
    },
    {
      icon: BookOpen,
      title: "정보공유",
      description:
        "강의 요약, 광고 운영 노하우, 최신 트렌드 등 유용한 콘텐츠를 확인하세요.",
    },
    {
      icon: Target,
      title: "총가치각도기",
      description:
        "광고 성과를 진단하고 개선 포인트를 찾아주는 자사몰사관학교 전용 분석 도구입니다.",
    },
  ];

  return (
    <div className="text-center">
      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-2">
          {profile.name}님, {profile.cohort || ""} 기수에
        </h2>
        <h2 className="text-2xl sm:text-3xl font-bold text-[#111827]">
          오신 것을 환영합니다!
        </h2>
        <p className="text-[#6B7280] mt-3">
          자사몰사관학교 헬프데스크를 소개해 드릴게요.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-8">
        {services.map((service) => (
          <div
            key={service.title}
            className="bg-white rounded-xl border border-gray-100 p-5 text-left shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="w-10 h-10 rounded-lg bg-[#F75D5D]/10 flex items-center justify-center mb-3">
              <service.icon className="h-5 w-5 text-[#F75D5D]" />
            </div>
            <h3 className="font-semibold text-[#111827] mb-1.5">
              {service.title}
            </h3>
            <p className="text-sm text-[#6B7280] leading-relaxed">
              {service.description}
            </p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 bg-[#F75D5D] hover:bg-[#E54949] text-white h-12 px-8 rounded-lg font-medium transition-colors text-base"
      >
        시작하기
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function StepProfile({
  profile,
  onSave,
  saving,
}: {
  profile: OnboardingProfile;
  onSave: (data: {
    name: string;
    shopName: string;
    shopUrl: string;
    annualRevenue: string;
    monthlyAdBudget: string;
    category: string;
  }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(profile.name || "");
  const [shopName, setShopName] = useState(profile.shop_name || "");
  const [shopUrl, setShopUrl] = useState(profile.shop_url || "");
  const [annualRevenue, setAnnualRevenue] = useState(profile.annual_revenue || "");
  const [monthlyAdBudget, setMonthlyAdBudget] = useState(
    profile.monthly_ad_budget || ""
  );
  const [category, setCategory] = useState(
    // 기존 저장값이 CATEGORY_OPTIONS에 없으면 "etc" + customCategory로 복원
    profile.category && !CATEGORY_OPTIONS.some((o) => o.value === profile.category)
      ? "etc"
      : profile.category || ""
  );
  const [customCategory, setCustomCategory] = useState(
    profile.category && !CATEGORY_OPTIONS.some((o) => o.value === profile.category)
      ? profile.category
      : ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = category === "etc" ? customCategory.trim() : category;
    // shopUrl https:// 자동 보완
    let finalShopUrl = shopUrl.trim();
    if (finalShopUrl && !finalShopUrl.startsWith("http")) {
      finalShopUrl = `https://${finalShopUrl}`;
    }
    onSave({ name, shopName, shopUrl: finalShopUrl, annualRevenue, monthlyAdBudget, category: finalCategory });
  };

  const isCategoryValid = category !== "etc" || customCategory.trim().length > 0;

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#111827] mb-2">
          프로필 정보 확인
        </h2>
        <p className="text-[#6B7280]">
          기본 정보를 확인하고 필요한 부분을 수정해 주세요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 max-w-md mx-auto">
        <div className="space-y-2">
          <label
            htmlFor="onb-name"
            className="block text-sm font-medium text-[#111827]"
          >
            이름
          </label>
          <input
            id="onb-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="onb-shop-name"
            className="block text-sm font-medium text-[#111827]"
          >
            브랜드명
          </label>
          <input
            id="onb-shop-name"
            type="text"
            placeholder="예: 마이브랜드"
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="onb-shop-url"
            className="block text-sm font-medium text-[#111827]"
          >
            쇼핑몰 URL
          </label>
          <input
            id="onb-shop-url"
            type="text"
            placeholder="https://myshop.com"
            value={shopUrl}
            onChange={(e) => setShopUrl(e.target.value)}
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#111827]">
            연매출
          </label>
          <Select value={annualRevenue} onValueChange={setAnnualRevenue}>
            <SelectTrigger className="w-full h-11 px-4 border border-gray-200 rounded-lg bg-white text-[#111827]">
              <SelectValue placeholder="연매출 범위를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {ANNUAL_REVENUE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#111827]">
            월 광고예산
          </label>
          <Select
            value={monthlyAdBudget}
            onValueChange={setMonthlyAdBudget}
          >
            <SelectTrigger className="w-full h-11 px-4 border border-gray-200 rounded-lg bg-white text-[#111827]">
              <SelectValue placeholder="예산 범위를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {BUDGET_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#111827]">
            카테고리
          </label>
          <Select value={category} onValueChange={(v) => { setCategory(v); if (v !== "etc") setCustomCategory(""); }}>
            <SelectTrigger className="w-full h-11 px-4 border border-gray-200 rounded-lg bg-white text-[#111827]">
              <SelectValue placeholder="카테고리를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {category === "etc" && (
            <input
              type="text"
              placeholder="카테고리를 직접 입력하세요"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              required
              className="mt-2 w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
            />
          )}
        </div>

        <button
          type="submit"
          disabled={saving || !name.trim() || !isCategoryValid}
          className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              저장 중...
            </>
          ) : (
            "저장하고 다음"
          )}
        </button>
      </form>
    </div>
  );
}

function StepAdAccount({
  profile,
  onConnect,
  saving,
}: {
  profile: OnboardingProfile;
  onConnect: (data: { metaAccountId: string; mixpanelProjectId: string; mixpanelSecretKey: string; mixpanelBoardId: string }) => void;
  saving: boolean;
}) {
  const [accountId, setAccountId] = useState(
    profile.meta_account_id || ""
  );
  const [mixpanelProjectId, setMixpanelProjectId] = useState(
    profile.mixpanel_project_id || ""
  );
  const [mixpanelSecretKey, setMixpanelSecretKey] = useState(
    profile.mixpanel_secret_key || ""
  );
  const [mixpanelBoardId, setMixpanelBoardId] = useState("");

  const hasMetaAccount = accountId.trim().length > 0;

  return (
    <div>
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-[#111827] mb-2">
          광고계정 연결
        </h2>
        <p className="text-[#6B7280]">
          Meta 광고 계정과 믹스패널 정보를 입력하면
          <br />
          총가치각도기에서 광고 성과를 분석할 수 있습니다.
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-6">
        {/* 안내 박스 */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-800 mb-2">
            광고 계정 ID 찾는 방법
          </h4>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>
              Meta 비즈니스 설정(business.facebook.com)에 접속
            </li>
            <li>
              좌측 메뉴에서 &quot;계정&quot; &gt; &quot;광고 계정&quot; 선택
            </li>
            <li>
              계정 ID (숫자)를 복사하여 아래에 입력
            </li>
          </ol>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="onb-meta-id"
            className="block text-sm font-medium text-[#111827]"
          >
            Meta 광고 계정 ID <span className="text-[#F75D5D]">*</span>
          </label>
          <input
            id="onb-meta-id"
            type="text"
            placeholder="예: 123456789012345"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="onb-mixpanel-project"
            className="block text-sm font-medium text-[#111827]"
          >
            믹스패널 프로젝트 ID (선택)
          </label>
          <input
            id="onb-mixpanel-project"
            type="text"
            placeholder="프로젝트 ID"
            value={mixpanelProjectId}
            onChange={(e) => setMixpanelProjectId(e.target.value)}
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="onb-mixpanel-board"
            className="block text-sm font-medium text-[#111827]"
          >
            믹스패널 보드 ID (선택)
          </label>
          <input
            id="onb-mixpanel-board"
            type="text"
            placeholder="보드 ID"
            value={mixpanelBoardId}
            onChange={(e) => setMixpanelBoardId(e.target.value)}
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="onb-mixpanel-secret"
            className="block text-sm font-medium text-[#111827]"
          >
            믹스패널 시크릿키 (선택)
          </label>
          <input
            id="onb-mixpanel-secret"
            type="text"
            placeholder="시크릿키"
            value={mixpanelSecretKey}
            onChange={(e) => setMixpanelSecretKey(e.target.value)}
            className="w-full px-4 h-11 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent transition-colors bg-white text-[#111827] placeholder:text-gray-400"
          />
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => onConnect({ metaAccountId: accountId, mixpanelProjectId, mixpanelSecretKey, mixpanelBoardId })}
            disabled={saving || !hasMetaAccount}
            className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                연결 중...
              </>
            ) : (
              "연결하고 완료"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepComplete() {
  return (
    <div className="text-center">
      <div className="mb-8">
        <div className="w-16 h-16 rounded-full bg-[#F75D5D]/10 flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="h-8 w-8 text-[#F75D5D]" />
        </div>
        <h2 className="text-2xl font-bold text-[#111827] mb-2">
          온보딩이 완료되었습니다!
        </h2>
        <p className="text-[#6B7280]">
          이제 자사몰사관학교 헬프데스크의 모든 기능을 이용할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
        <button
          onClick={() => { window.location.href = "/questions"; }}
          className="flex-1 bg-[#F75D5D] hover:bg-[#E54949] text-white h-11 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircleQuestion className="h-4 w-4" />
          Q&A 바로가기
        </button>
        <button
          onClick={() => { window.location.href = "/posts"; }}
          className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-[#111827] h-11 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <BookOpen className="h-4 w-4" />
          정보공유 바로가기
        </button>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  // Initial profile load
  useEffect(() => {
    async function loadProfile() {
      const result = await getOnboardingProfile();
      if (result.error || !result.data) {
        setError(result.error || "프로필을 불러올 수 없습니다.");
        setLoading(false);
        return;
      }
      setProfile(result.data as OnboardingProfile);
      // Resume from last step
      const savedStep = result.data.onboarding_step ?? 0;
      setStep(savedStep);
      setLoading(false);
    }
    loadProfile();
  }, []);

  // Complete onboarding when step 3 is reached
  useEffect(() => {
    if (step === 3 && !completed) {
      setCompleted(true);
      completeOnboarding();
    }
  }, [step, completed]);

  const handleWelcomeNext = useCallback(async () => {
    setSaving(true);
    const result = await updateOnboardingStep(1);
    if (result.error) {
      setError(result.error);
    } else {
      setStep(1);
    }
    setSaving(false);
  }, []);

  const handleProfileSave = useCallback(
    async (data: {
      name: string;
      shopName: string;
      shopUrl: string;
      annualRevenue: string;
      monthlyAdBudget: string;
      category: string;
    }) => {
      setSaving(true);
      const result = await saveOnboardingProfile(data);
      if (result.error) {
        setError(result.error);
      } else {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                name: data.name,
                shop_name: data.shopName,
                shop_url: data.shopUrl,
                annual_revenue: data.annualRevenue,
                monthly_ad_budget: data.monthlyAdBudget,
                category: data.category,
                onboarding_step: 2,
              }
            : prev
        );
        setStep(2);
      }
      setSaving(false);
    },
    []
  );

  const handleAdConnect = useCallback(async (data: { metaAccountId: string; mixpanelProjectId: string; mixpanelSecretKey: string; mixpanelBoardId: string }) => {
    setSaving(true);
    const result = await saveAdAccount({
      metaAccountId: data.metaAccountId || null,
      mixpanelProjectId: data.mixpanelProjectId || null,
      mixpanelSecretKey: data.mixpanelSecretKey || null,
      mixpanelBoardId: data.mixpanelBoardId || null,
    });
    if (result.error) {
      setError(result.error);
    } else {
      setStep(3);
    }
    setSaving(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#F75D5D]" />
          <p className="text-[#6B7280] text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 max-w-md w-full text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a
            href="/login"
            className="text-[#F75D5D] hover:underline font-medium"
          >
            로그인 페이지로 이동
          </a>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
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
            <button
              type="button"
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#F75D5D] transition-colors"
            >
              <LogOut className="h-4 w-4" />
              로그인으로 돌아가기
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={step} />

        {/* Card */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sm:p-8">
          {/* Error display */}
          {error && profile && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-6">
              {error}
            </div>
          )}

          {/* Step Content */}
          {step === 0 && (
            <StepWelcome profile={profile} onNext={handleWelcomeNext} />
          )}
          {step === 1 && (
            <StepProfile
              profile={profile}
              onSave={handleProfileSave}
              saving={saving}
            />
          )}
          {step === 2 && (
            <StepAdAccount
              profile={profile}
              onConnect={handleAdConnect}
              saving={saving}
            />
          )}
          {step === 3 && <StepComplete />}
        </div>
      </div>
    </div>
  );
}
