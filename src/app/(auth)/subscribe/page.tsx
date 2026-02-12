"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { subscribeNewsletter } from "@/actions/leads";

type PageState = "idle" | "loading" | "success" | "already" | "resubscribed";

export default function SubscribePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<PageState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setState("loading");
    setErrorMsg("");

    try {
      const result = await subscribeNewsletter(email.trim(), name.trim() || undefined);
      if (result.error) {
        setErrorMsg(result.error);
        setState("idle");
        return;
      }
      if (result.status === "already") {
        setState("already");
      } else if (result.status === "resubscribed") {
        setState("resubscribed");
      } else {
        setState("success");
      }
    } catch {
      setErrorMsg("구독 처리 중 오류가 발생했습니다.");
      setState("idle");
    }
  }

  // 완료 상태 UI
  if (state === "success" || state === "already" || state === "resubscribed") {
    const messages = {
      success: { title: "구독이 완료되었습니다!", desc: "최신 마케팅 인사이트를 이메일로 보내드릴게요." },
      already: { title: "이미 구독 중입니다", desc: "입력하신 이메일로 이미 뉴스레터를 받고 계세요." },
      resubscribed: { title: "다시 구독되었습니다!", desc: "수신거부를 해제하고 뉴스레터를 다시 보내드릴게요." },
    };
    const msg = messages[state];

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-[#F75D5D] font-bold text-xl tracking-tight">자사몰사관학교</p>
          <div className="mt-6 w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">{msg.title}</h1>
          <p className="mt-2 text-sm text-gray-500">{msg.desc}</p>
          <Link
            href="/"
            className="mt-6 inline-block text-sm text-[#F75D5D] hover:text-[#E54949] font-medium"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  // 폼 UI
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center">
          <p className="text-[#F75D5D] font-bold text-xl tracking-tight">자사몰사관학교</p>
          <div className="mt-6 w-12 h-12 rounded-full bg-[#FFF5F5] flex items-center justify-center mx-auto">
            <Mail className="w-5 h-5 text-[#F75D5D]" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">뉴스레터 구독</h1>
          <p className="mt-2 text-sm text-gray-500">
            매주 새로운 마케팅 인사이트를 이메일로 전해드려요
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-[13px] font-medium text-gray-700">
              이름
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-[#F75D5D] focus:ring-1 focus:ring-[#F75D5D] placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-[13px] font-medium text-gray-700">
              이메일 <span className="text-[#F75D5D]">*</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full px-4 py-2.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-[#F75D5D] focus:ring-1 focus:ring-[#F75D5D] placeholder:text-gray-400"
            />
          </div>

          {errorMsg && (
            <p className="text-sm text-red-500">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={state === "loading"}
            className="w-full px-6 py-2.5 text-sm font-medium text-white rounded-lg bg-[#F75D5D] hover:bg-[#E54949] transition-colors disabled:opacity-60 flex items-center justify-center"
          >
            {state === "loading" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "구독하기"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-gray-400">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-[#F75D5D] hover:text-[#E54949] font-medium">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
