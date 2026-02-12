"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { MailX, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { unsubscribeByToken, resubscribeByToken } from "@/actions/leads";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function decodeTokenClient(token: string): string | null {
  try {
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    return atob(base64);
  } catch {
    return null;
  }
}

type PageState = "confirm" | "loading" | "done" | "resubscribed" | "invalid" | "already";

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [state, setState] = useState<PageState>(() => {
    if (!token) return "invalid";
    const email = decodeTokenClient(token);
    if (!email || !email.includes("@")) return "invalid";
    return "confirm";
  });
  const [errorMsg, setErrorMsg] = useState("");

  const email = token ? decodeTokenClient(token) : null;
  const maskedEmail = email ? maskEmail(email) : "";

  async function handleUnsubscribe() {
    if (!token) return;
    setState("loading");
    setErrorMsg("");

    try {
      const result = await unsubscribeByToken(token);
      if (result.error) {
        setErrorMsg(result.error);
        setState("confirm");
        return;
      }
      if (result.alreadyOptedOut) {
        setState("already");
      } else {
        setState("done");
      }
    } catch {
      setErrorMsg("처리 중 오류가 발생했습니다.");
      setState("confirm");
    }
  }

  async function handleResubscribe() {
    if (!token) return;
    setState("loading");
    setErrorMsg("");

    try {
      const result = await resubscribeByToken(token);
      if (result.error) {
        setErrorMsg(result.error);
        setState("done");
        return;
      }
      setState("resubscribed");
    } catch {
      setErrorMsg("재구독 처리 중 오류가 발생했습니다.");
      setState("done");
    }
  }

  // 잘못된 토큰
  if (state === "invalid") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-[#F75D5D] font-bold text-xl tracking-tight">자사몰사관학교</p>
          <div className="mt-6 w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">잘못된 접근입니다</h1>
          <p className="mt-2 text-sm text-gray-500">
            유효하지 않은 수신거부 링크입니다.
          </p>
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

  // 재구독 완료
  if (state === "resubscribed") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-[#F75D5D] font-bold text-xl tracking-tight">자사몰사관학교</p>
          <div className="mt-6 w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">다시 구독되었습니다!</h1>
          <p className="mt-2 text-sm text-gray-500">
            뉴스레터를 다시 보내드릴게요.
          </p>
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

  // 수신거부 완료 또는 이미 수신거부 상태
  if (state === "done" || state === "already") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <p className="text-[#F75D5D] font-bold text-xl tracking-tight">자사몰사관학교</p>
          <div className="mt-6 w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-5 h-5 text-gray-500" />
          </div>
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            {state === "already" ? "이미 수신거부 상태입니다" : "수신거부 처리되었습니다"}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            더 이상 뉴스레터가 발송되지 않습니다.
          </p>
          {errorMsg && (
            <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
          )}
          <button
            onClick={handleResubscribe}
            className="mt-6 inline-block px-6 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            다시 구독하기
          </button>
        </div>
      </div>
    );
  }

  // 수신거부 확인 (confirm / loading)
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <p className="text-[#F75D5D] font-bold text-xl tracking-tight">자사몰사관학교</p>
        <div className="mt-6 w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mx-auto">
          <MailX className="w-5 h-5 text-orange-500" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-gray-900">수신거부</h1>
        <p className="mt-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{maskedEmail}</span> 으로 발송되는<br />
          뉴스레터를 수신 거부하시겠습니까?
        </p>
        {errorMsg && (
          <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
        )}
        <button
          onClick={handleUnsubscribe}
          disabled={state === "loading"}
          className="mt-6 px-6 py-2.5 text-sm font-medium text-white rounded-lg bg-gray-800 hover:bg-gray-900 transition-colors disabled:opacity-60 inline-flex items-center justify-center"
        >
          {state === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "수신거부 하기"
          )}
        </button>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      }
    >
      <UnsubscribeInner />
    </Suspense>
  );
}
