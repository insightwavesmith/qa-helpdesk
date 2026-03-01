import Image from "next/image";

export function AuthorProfileCard() {
  return (
    <div className="border-t border-gray-200 pt-8 mt-12">
      <div className="flex items-center gap-5">
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
          <p className="text-base font-bold text-[#1a1a2e]">
            스미스{" "}
            <span className="text-sm font-semibold text-[#F75D5D]">
              자사몰사관학교 코치
            </span>
          </p>
          <p className="text-sm text-[#64748b] mt-1 leading-relaxed">
            Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+
          </p>
          <div className="mt-2">
            <Image
              src="/images/meta-partner/inline-positive.png"
              alt="Meta Business Partners"
              width={120}
              height={36}
              className="h-[36px] w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
