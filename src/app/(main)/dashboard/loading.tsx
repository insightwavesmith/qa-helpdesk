export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="space-y-2">
        <div className="h-7 w-32 bg-muted rounded animate-pulse" />
        <div className="h-4 w-56 bg-muted rounded animate-pulse" />
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-[250px] bg-muted rounded-xl animate-pulse" />
        <div className="h-[250px] bg-muted rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
