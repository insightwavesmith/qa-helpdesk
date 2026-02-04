"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Bell, Save } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">설정</h1>
        <p className="text-muted-foreground">
          프로필과 알림 설정을 관리하세요.
        </p>
      </div>

      {/* 프로필 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">프로필</CardTitle>
          <CardDescription>기본 프로필 정보를 수정하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input placeholder="이름" />
            </div>
            <div className="space-y-2">
              <Label>전화번호</Label>
              <Input placeholder="010-1234-5678" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>쇼핑몰 이름</Label>
            <Input placeholder="쇼핑몰 이름" />
          </div>
          <div className="space-y-2">
            <Label>쇼핑몰 URL</Label>
            <Input placeholder="https://myshop.com" />
          </div>
        </CardContent>
        <CardFooter>
          <Button>
            <Save className="mr-2 h-4 w-4" />
            저장
          </Button>
        </CardFooter>
      </Card>

      <Separator />

      {/* 알림 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">알림 설정</CardTitle>
          <CardDescription>알림 수신 방법을 설정하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <Bell className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              알림 설정은 준비 중입니다.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              곧 이메일/슬랙 알림 설정을 지원할 예정입니다.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
