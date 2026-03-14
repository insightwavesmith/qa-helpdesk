"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageSquarePlus } from "lucide-react";

const QaChatPanel = dynamic(
  () => import("./QaChatPanel").then((m) => m.QaChatPanel),
  { ssr: false }
);

export function QaChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* 플로팅 버튼 — 우하단 고정 */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#F75D5D] text-white shadow-lg transition-all hover:bg-[#E54949] hover:scale-105 active:scale-95 md:bottom-6 md:right-6 max-md:bottom-4 max-md:right-4 max-md:h-12 max-md:w-12"
        aria-label="QA 리포팅 챗봇"
      >
        <MessageSquarePlus className="h-6 w-6 max-md:h-5 max-md:w-5" />
      </button>

      {/* 채팅 패널 */}
      {isOpen && <QaChatPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />}
    </>
  );
}
