"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
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
    <div className="flex min-h-svh items-center justify-center px-4 bg-background">
      <div className="w-full max-w-[400px] space-y-8">
        {/* Logo — Notion-style minimal */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-[6px] bg-foreground/10 text-[18px] font-bold text-foreground/70 mb-4">
            사
          </div>
          <h1 className="text-[28px] font-bold tracking-tight">사관학교 헬프데스크</h1>
          <p className="text-[14px] text-muted-foreground mt-1">수강생 전용 Q&A</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-[13px] text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-[13px]">이메일</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[13px]">비밀번호</Label>
            <Input
              id="password"
              type="password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-10"
            />
          </div>
          <Button type="submit" className="w-full h-10" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                로그인 중...
              </>
            ) : (
              "로그인"
            )}
          </Button>
        </form>

        <p className="text-center text-[13px] text-muted-foreground">
          아직 계정이 없으신가요?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
