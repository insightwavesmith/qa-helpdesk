"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Settings, Menu, X } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface StudentHeaderProps {
  userName: string;
  userEmail: string;
}

export function StudentHeader({ userName, userEmail }: StudentHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const initials = userName.charAt(0);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const navItems = [
    { label: "홈", href: "/dashboard" },
    { label: "Q&A", href: "/questions" },
    { label: "정보공유", href: "/posts" },
  ];

  const isActive = (href: string) => 
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="bg-card-bg border-b border-border-color sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* 로고 */}
          <Link href="/dashboard" className="flex items-center">
            <img src="/logo.png" alt="BS CAMP" className="w-8 h-8 rounded-lg object-cover" />
            <span className="ml-2 text-xl font-bold text-text-main font-accent">BS CAMP</span>
          </Link>
          
          {/* 데스크탑 네비게이션 */}
          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item font-medium ${
                  isActive(item.href)
                    ? "text-primary"
                    : "text-text-secondary hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          
          {/* 프로필 & 모바일 메뉴 */}
          <div className="flex items-center space-x-4">
            {/* 프로필 드롭다운 */}
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="w-8 h-8 bg-warning rounded-full flex items-center justify-center text-white text-sm font-medium hover:opacity-80 transition-opacity"
              >
                {initials}
              </button>
              
              {profileMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setProfileMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-card-bg rounded-lg shadow-lg border border-border-color py-2 z-50">
                    <div className="px-4 py-2 border-b border-border-color">
                      <p className="text-sm font-medium text-text-main">{userName}</p>
                      <p className="text-xs text-text-secondary">{userEmail}</p>
                    </div>
                    <button
                      onClick={() => {
                        setProfileMenuOpen(false);
                        router.push("/settings");
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-main hover:bg-accent flex items-center"
                    >
                      <Settings className="w-4 h-4 mr-2 text-text-secondary" />
                      설정
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-text-main hover:bg-accent flex items-center"
                    >
                      <LogOut className="w-4 h-4 mr-2 text-text-secondary" />
                      로그아웃
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-text-secondary hover:text-primary"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        
        {/* 모바일 네비게이션 */}
        {mobileMenuOpen && (
          <nav className="md:hidden mt-4 pt-4 border-t border-border-color space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block py-2 font-medium ${
                  isActive(item.href)
                    ? "text-primary"
                    : "text-text-secondary"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
