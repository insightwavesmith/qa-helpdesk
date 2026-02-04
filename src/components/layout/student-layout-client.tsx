"use client";

import { StudentHeader } from "./student-header";
import { MobileTabBar } from "./mobile-tab-bar";

interface StudentLayoutClientProps {
  userName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function StudentLayoutClient({
  userName,
  userEmail,
  children,
}: StudentLayoutClientProps) {
  return (
    <div className="min-h-dvh flex flex-col">
      <StudentHeader userName={userName} userEmail={userEmail} />

      <main className="flex-1 mx-auto w-full max-w-[720px] px-4 py-6 pb-20 md:pb-6">
        {children}
      </main>

      <MobileTabBar />
    </div>
  );
}
