"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export function FloatingAskButton() {
  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40">
      <Link href="/questions/new">
        <ShimmerButton
          shimmerColor="#ffffff"
          shimmerDuration="2.5s"
          background="linear-gradient(135deg, hsl(var(--primary)) 0%, #2563eb 100%)"
          borderRadius="9999px"
          className="h-12 px-5 gap-2 shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-transform duration-300"
        >
          <Plus className="h-5 w-5 text-white" />
          <span className="hidden sm:inline text-white font-medium">
            질문하기
          </span>
        </ShimmerButton>
      </Link>
    </div>
  );
}
