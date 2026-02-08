"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

export function NewsletterCta() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <section className="bg-white border border-gray-200 rounded-xl py-10 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-[#FFF5F5] flex items-center justify-center mx-auto">
          <Mail className="w-5 h-5 text-[#F75D5D]" />
        </div>
        <p className="mt-4 text-xl font-bold text-[#1a1a2e]">구독 신청 완료!</p>
        <p className="mt-2 text-sm text-gray-500">
          최신 마케팅 인사이트를 이메일로 보내드릴게요.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl py-10 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-[#FFF5F5] flex items-center justify-center mx-auto">
        <Mail className="w-5 h-5 text-[#F75D5D]" />
      </div>
      <h3 className="mt-4 text-xl font-bold text-[#1a1a2e]">
        뉴스레터 구독
      </h3>
      <p className="mt-2 text-sm text-gray-500">
        매주 새로운 인사이트를 메일로 전해드려요
      </p>
      <form onSubmit={handleSubmit} className="mt-5 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
        <input
          type="email"
          placeholder="이메일 주소를 입력하세요"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-[#F75D5D] focus:ring-1 focus:ring-[#F75D5D] placeholder:text-gray-400"
        />
        <button
          type="submit"
          className="px-6 py-2.5 text-sm font-medium text-white rounded-lg bg-[#F75D5D] hover:bg-[#E54949] transition-colors shrink-0"
        >
          구독하기
        </button>
      </form>
    </section>
  );
}
