export default function QuestionsLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-24 bg-muted rounded animate-pulse" />
        <div className="h-9 w-28 bg-muted rounded-lg animate-pulse" />
      </div>

      {/* 탭 + 검색 */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-48 bg-muted rounded-lg animate-pulse" />
        <div className="h-9 flex-1 max-w-xs bg-muted rounded-lg animate-pulse" />
      </div>

      {/* 질문 목록 */}
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100">
            <div className="flex-1 space-y-2">
              <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
              <div className="flex gap-3 mt-2">
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                <div className="h-3 w-16 bg-muted rounded animate-pulse" />
              </div>
            </div>
            <div className="h-8 w-14 bg-muted rounded-lg animate-pulse shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
