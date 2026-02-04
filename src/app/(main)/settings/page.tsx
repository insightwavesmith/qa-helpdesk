"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Bell, Save } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">설정</h1>
        <p className="text-muted-foreground text-sm mt-1">
          프로필과 알림 설정을 관리하세요.
        </p>
      </div>

      {/* 프로필 설정 */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold">프로필</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>이름</Label>
            <Input placeholder="이름" className="rounded-lg" />
          </div>
          <div className="space-y-2">
            <Label>전화번호</Label>
            <Input placeholder="010-1234-5678" className="rounded-lg" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>쇼핑몰 이름</Label>
          <Input placeholder="쇼핑몰 이름" className="rounded-lg" />
        </div>
        <div className="space-y-2">
          <Label>쇼핑몰 URL</Label>
          <Input placeholder="https://myshop.com" className="rounded-lg" />
        </div>

        <Button className="rounded-full gap-2">
          <Save className="h-4 w-4" />
          저장
        </Button>
      </section>

      <Separator />

      {/* 알림 설정 */}
      <section className="space-y-5">
        <h2 className="text-lg font-semibold">알림 설정</h2>

        <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
            <Bell className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">
            알림 설정은 준비 중입니다.
          </p>
          <p className="text-xs text-muted-foreground mt-1 opacity-70">
            곧 이메일/슬랙 알림 설정을 지원할 예정입니다.
          </p>
        </div>
      </section>
    </div>
  );
}
