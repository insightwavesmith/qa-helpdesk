export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <p className="text-4xl mb-4">🚧</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-400">6단계에서 구현 예정</p>
      </div>
    </div>
  );
}
