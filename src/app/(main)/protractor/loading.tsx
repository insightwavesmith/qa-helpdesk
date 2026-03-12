export default function ProtractorLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* 헤더 영역 */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-10 w-48 bg-muted rounded-md animate-pulse" />
      </div>

      {/* 기간 탭 */}
      <div className="h-10 w-96 bg-muted rounded-md animate-pulse" />

      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>

      {/* 게이지 + 오버랩 영역 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-[300px] bg-muted rounded-xl animate-pulse" />
        <div className="h-[300px] bg-muted rounded-xl animate-pulse" />
      </div>

      {/* 테이블 영역 */}
      <div className="space-y-3">
        <div className="h-10 bg-muted rounded-md animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    </div>
  );
}
