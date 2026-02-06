"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { GraduationCap, Loader2 } from "lucide-react";
import { ThemeModeToggle } from "@/components/layout/theme-toggle";

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
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 px-4 py-8 relative">
      <div className="absolute top-4 right-4">
        <ThemeModeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* 브랜드 헤더 */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">BS CAMP</h1>
          <p className="text-sm text-muted-foreground">Q&A 헬프데스크</p>
        </div>

        {/* 로그인 카드 */}
        <Card className="shadow-lg fade-in">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl">로그인</CardTitle>
            <CardDescription>이메일과 비밀번호를 입력해주세요.</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4 pb-8">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  "로그인"
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                계정이 없으신가요?{" "}
                <Link href="/signup" className="font-medium text-primary hover:underline">
                  회원가입
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
