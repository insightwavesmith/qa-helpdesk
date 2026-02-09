import Link from "next/link";

export function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">회원만 이용 가능합니다</h1>
        <p className="text-sm text-gray-500 mb-6">이 페이지는 로그인한 회원만 이용할 수 있습니다.</p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium bg-[#F75D5D] text-white hover:bg-[#E54949] transition-colors"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
