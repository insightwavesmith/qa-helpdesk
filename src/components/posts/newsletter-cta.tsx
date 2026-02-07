"use client";

import { useState } from "react";

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
      <section className="bg-[#FFF5F5] rounded-lg p-8 text-center">
        <p className="text-lg font-bold text-[#1a1a2e]">구독 신청 완료!</p>
        <p className="mt-2 text-sm text-[#666666]">
          최신 마케팅 인사이트를 이메일로 보내드릴게요.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-[#FFF5F5] rounded-lg p-8 text-center">
      <h3 className="text-lg font-bold text-[#1a1a2e]">
        뉴스레터 구독하기
      </h3>
      <p className="mt-2 text-sm text-[#666666]">
        자사몰 마케팅에 필요한 인사이트를 매주 이메일로 받아보세요.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
        <input
          type="email"
          placeholder="이메일 주소를 입력하세요"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-[#EEEEEE] bg-white focus:outline-none focus:border-[#F75D5D] focus:ring-1 focus:ring-[#F75D5D] placeholder:text-[#999999]"
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
