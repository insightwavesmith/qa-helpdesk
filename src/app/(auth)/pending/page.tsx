import Link from "next/link";
import { Clock, Mail } from "lucide-react";

export default function PendingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <img src="/logo.png" alt="BS CAMP" className="w-10 h-10 rounded-lg object-cover" />
            <span className="ml-2 text-xl font-bold text-[#111827]">BS CAMP</span>
          </div>
          <p className="text-[#6B7280] font-medium">자사몰사관학교 헬프데스크</p>
        </div>

        {/* 승인 대기 카드 */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FEF2F2]">
            <Clock className="h-8 w-8 text-[#F75D5D]" />
          </div>
          <h1 className="text-xl font-bold text-[#111827] mb-2">승인 대기 중</h1>
          <p className="text-[#6B7280] text-base mb-6">
            가입 신청이 접수되었습니다!
          </p>

          <p className="text-[#6B7280] mb-4">
            관리자가 회원 정보를 확인한 후 승인해 드립니다.
            <br />
            승인이 완료되면 서비스를 이용하실 수 있습니다.
          </p>

          <div className="flex items-center justify-center gap-2 rounded-lg bg-gray-50 p-3 mb-6">
            <Mail className="h-4 w-4 text-[#6B7280]" />
            <span className="text-sm text-[#6B7280]">
              승인 완료 시 이메일로 안내드립니다.
            </span>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center justify-center h-11 px-6 border border-gray-200 rounded-lg text-sm font-medium text-[#111827] hover:bg-gray-50 transition-colors"
          >
            로그인 페이지로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
