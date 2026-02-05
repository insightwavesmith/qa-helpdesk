"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
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
    <div className="min-h-screen bg-bg-warm flex items-center justify-center p-4 relative">
      {/* 테마 토글 */}
      <div className="absolute top-4 right-4">
        <ThemeModeToggle />
      </div>
      
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img src="/logo.png" alt="BS CAMP" className="w-10 h-10 rounded-lg object-cover" />
            <span className="ml-2 text-xl font-bold text-text-main font-accent">BS CAMP</span>
          </div>
          <p className="text-text-secondary font-medium">자사몰사관학교 Q&A 헬프데스크</p>
        </div>
        
        {/* 로그인 카드 */}
        <div className="bg-card-bg rounded-xl shadow-lg border border-border-color p-8 card-hover fade-in">
          <h1 className="text-2xl font-bold mb-6 text-center text-text-main">로그인</h1>
          
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-main mb-2">
                이메일
              </label>
              <input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-4 py-3 border border-border-color rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors bg-white text-text-main"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-text-main mb-2">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-border-color rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors bg-white text-text-main"
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-primary text-white py-3 px-4 rounded-lg font-medium btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  로그인 중...
                </>
              ) : (
                "로그인"
              )}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-text-secondary text-sm">
              계정이 없으신가요?{" "}
              <Link href="/signup" className="text-primary hover:underline font-medium">
                회원가입
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
