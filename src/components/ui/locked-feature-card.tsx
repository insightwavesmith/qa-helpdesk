import { Lock } from "lucide-react";
import Link from "next/link";

interface LockedFeatureCardProps {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function LockedFeatureCard({
  title,
  description,
  ctaLabel,
  ctaHref,
}: LockedFeatureCardProps) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
      <div className="flex items-center justify-center mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
          <Lock className="h-5 w-5 text-gray-400" />
        </div>
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <p className="text-sm text-gray-600 mb-4">
        나의 광고 성과를 분석해보세요
      </p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-block rounded-lg bg-[#F75D5D] px-4 py-2 text-sm font-medium text-white hover:bg-[#E54949] transition-colors"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
