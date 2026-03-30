export function MetricCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
