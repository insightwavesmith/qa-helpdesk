export default function PostsLoading() {
  return (
    <div className="p-6 space-y-8">
      {/* 카테고리 탭 */}
      <div className="flex gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 w-16 bg-muted rounded-full animate-pulse" />
        ))}
      </div>

      {/* 검색바 */}
      <div className="h-10 w-full max-w-md bg-muted rounded-lg animate-pulse" />

      {/* 피처드 카드 */}
      <div className="h-[220px] bg-muted rounded-xl animate-pulse" />

      {/* 최신 콘텐츠 */}
      <div className="space-y-4">
        <div className="h-6 w-28 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="aspect-video bg-muted animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-16 bg-muted rounded animate-pulse" />
                <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-3 w-24 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
