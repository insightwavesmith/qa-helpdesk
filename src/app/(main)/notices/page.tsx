import { Megaphone } from "lucide-react";

export default function NoticesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">공지사항</h1>
        <p className="text-muted-foreground text-sm mt-1">
          서비스 관련 공지사항을 확인하세요.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <Megaphone className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">
          아직 공지사항이 없습니다.
        </p>
        <p className="text-xs text-muted-foreground mt-1 opacity-70">
          새로운 소식이 있으면 이곳에 게시됩니다.
        </p>
      </div>
    </div>
  );
}
