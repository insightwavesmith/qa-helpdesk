import { Megaphone } from "lucide-react";

export default function NoticesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">공지사항</h1>
        <p className="text-gray-500 text-sm mt-1">
          서비스 관련 공지사항을 확인하세요.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-gray-200 border-dashed">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50 mb-4">
          <Megaphone className="h-6 w-6 text-gray-500" />
        </div>
        <p className="text-gray-500 text-sm">
          아직 공지사항이 없습니다.
        </p>
        <p className="text-xs text-gray-500 mt-1 opacity-70">
          새로운 소식이 있으면 이곳에 게시됩니다.
        </p>
      </div>
    </div>
  );
}
