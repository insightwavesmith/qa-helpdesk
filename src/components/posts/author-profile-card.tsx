import Image from "next/image";

export function AuthorProfileCard() {
  return (
    <div className="border-t border-b border-slate-200 py-6 mt-8">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          <Image
            src="/images/meta-partner/profile-smith.png"
            alt="스미스"
            width={80}
            height={80}
            className="w-20 h-20 rounded-full object-cover"
          />
        </div>
        <div>
          <p className="font-extrabold text-base text-gray-900">
            스미스{" "}
            <span className="font-semibold text-[13px] text-[#F75D5D]">
              자사몰사관학교 코치
            </span>
          </p>
          <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
            Meta가 인증한 비즈니스 파트너
            <br />
            수강생 자사몰매출 450억+
          </p>
        </div>
      </div>
      {/* Meta Business Partners 로고 — 별도 badge-row */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <Image
          src="/images/meta-partner/inline-positive.png"
          alt="Meta Business Partners"
          width={120}
          height={36}
          className="h-9 w-auto"
        />
      </div>
    </div>
  );
}
