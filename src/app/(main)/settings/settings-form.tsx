"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bell, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  name: string | null;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
  meta_account_id: string | null;
  mixpanel_project_id: string | null;
  mixpanel_secret_key: string | null;
  annual_revenue: string | null;
}

const ANNUAL_REVENUE_OPTIONS = [
  { value: "under_1억", label: "1억 미만" },
  { value: "1억_5억", label: "1억~5억" },
  { value: "5억_10억", label: "5억~10억" },
  { value: "10억_50억", label: "10억~50억" },
  { value: "over_50억", label: "50억 이상" },
];

interface SettingsFormProps {
  profile: Profile | null;
  userId: string;
}

export function SettingsForm({ profile, userId }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [annualRevenue, setAnnualRevenue] = useState(
    profile?.annual_revenue ?? ""
  );

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      shop_name: formData.get("shop_name") as string,
      shop_url: formData.get("shop_url") as string,
      meta_account_id: (formData.get("meta_account_id") as string) || null,
      mixpanel_project_id:
        (formData.get("mixpanel_project_id") as string) || null,
      mixpanel_secret_key:
        (formData.get("mixpanel_secret_key") as string) || null,
      annual_revenue: annualRevenue || null,
    };

    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    setSaving(false);

    if (error) {
      toast.error("저장에 실패했습니다.");
    } else {
      toast.success("프로필이 저장되었습니다.");
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-gray-500 text-sm mt-1">
          프로필과 알림 설정을 관리하세요.
        </p>
      </div>

      {/* 프로필 설정 */}
      <form onSubmit={handleSave}>
        <section className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">프로필</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input
                name="name"
                defaultValue={profile?.name ?? ""}
                placeholder="이름"
                className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
              />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input
                name="phone"
                defaultValue={profile?.phone ?? ""}
                placeholder="010-1234-5678"
                className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>쇼핑몰 이름</Label>
            <Input
              name="shop_name"
              defaultValue={profile?.shop_name ?? ""}
              placeholder="쇼핑몰 이름"
              className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
            />
          </div>
          <div className="space-y-2">
            <Label>쇼핑몰 URL</Label>
            <Input
              name="shop_url"
              defaultValue={profile?.shop_url ?? ""}
              placeholder="https://myshop.com"
              className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
            />
          </div>

          <Separator className="border-gray-200" />

          {/* 광고계정 / 믹스패널 */}
          <h2 className="text-lg font-semibold text-gray-900">
            광고계정 / 분석 도구
          </h2>

          <div className="space-y-2">
            <Label>Meta 광고 계정 ID</Label>
            <Input
              name="meta_account_id"
              defaultValue={profile?.meta_account_id ?? ""}
              placeholder="예: 123456789012345"
              className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>믹스패널 프로젝트 ID</Label>
              <Input
                name="mixpanel_project_id"
                defaultValue={profile?.mixpanel_project_id ?? ""}
                placeholder="프로젝트 ID"
                className="rounded-lg border-gray-200 focus:ring-[#F75D5D]"
              />
            </div>
            <div className="space-y-2">
              <Label>믹스패널 시크릿키</Label>
              <div className="relative">
                <Input
                  name="mixpanel_secret_key"
                  type={showSecret ? "text" : "password"}
                  defaultValue={profile?.mixpanel_secret_key ?? ""}
                  placeholder="시크릿키"
                  className="rounded-lg border-gray-200 focus:ring-[#F75D5D] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>연매출</Label>
            <Select value={annualRevenue} onValueChange={setAnnualRevenue}>
              <SelectTrigger className="w-full rounded-lg border-gray-200 focus:ring-[#F75D5D]">
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

          <Button
            type="submit"
            disabled={saving}
            className="rounded-lg gap-2 bg-[#F75D5D] hover:bg-[#E54949]"
          >
            <Save className="h-4 w-4" />
            {saving ? "저장 중..." : "저장"}
          </Button>
        </section>
      </form>

      <Separator className="border-gray-200" />

      {/* 알림 설정 */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-gray-900">알림 설정</h2>

        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-gray-200 border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
            <Bell className="h-6 w-6 text-gray-500" />
          </div>
          <p className="text-gray-500 text-sm">
            알림 설정은 준비 중입니다.
          </p>
          <p className="text-xs text-gray-500 mt-1 opacity-70">
            곧 이메일/슬랙 알림 설정을 지원할 예정입니다.
          </p>
        </div>
      </section>
    </div>
  );
}
