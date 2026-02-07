"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Bell, Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  name: string | null;
  phone: string | null;
  shop_name: string | null;
  shop_url: string | null;
}

interface SettingsFormProps {
  profile: Profile | null;
  userId: string;
}

export function SettingsForm({ profile, userId }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get("name") as string,
      phone: formData.get("phone") as string,
      shop_name: formData.get("shop_name") as string,
      shop_url: formData.get("shop_url") as string,
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
