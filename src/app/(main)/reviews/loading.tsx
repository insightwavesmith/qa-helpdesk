export default function ReviewsLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-10 w-24 bg-muted rounded-md animate-pulse" />
      </div>

      {/* 필터 */}
      <div className="h-10 bg-muted rounded-md animate-pulse" />

      {/* 리스트 아이템 */}
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
