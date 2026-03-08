"use client";

export interface FilterState {
  activeOnly: boolean;
  minDays: number;
  platform: string;
  mediaType: "all" | "image" | "carousel" | "video";
  sortBy: "latest" | "duration";
}

interface FilterChipsProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

interface ChipDef {
  label: string;
  isActive: (f: FilterState) => boolean;
  toggle: (f: FilterState) => FilterState;
  group?: "filter" | "media" | "sort";
}

const CHIPS: ChipDef[] = [
  // — 기간 필터 —
  {
    label: "30일+",
    group: "filter",
    isActive: (f) => f.minDays === 30,
    toggle: (f) => ({ ...f, minDays: f.minDays === 30 ? 0 : 30 }),
  },
  // — 소재 유형 필터 —
  {
    label: "🖼️ 이미지",
    group: "media",
    isActive: (f) => f.mediaType === "image",
    toggle: (f) => ({
      ...f,
      mediaType: f.mediaType === "image" ? "all" : "image",
    }),
  },
  {
    label: "📑 슬라이드",
    group: "media",
    isActive: (f) => f.mediaType === "carousel",
    toggle: (f) => ({
      ...f,
      mediaType: f.mediaType === "carousel" ? "all" : "carousel",
    }),
  },
  {
    label: "🎬 영상",
    group: "media",
    isActive: (f) => f.mediaType === "video",
    toggle: (f) => ({
      ...f,
      mediaType: f.mediaType === "video" ? "all" : "video",
    }),
  },
  // — 정렬 —
  {
    label: "최신순",
    group: "sort",
    isActive: (f) => f.sortBy === "latest",
    toggle: (f) => ({ ...f, sortBy: "latest" }),
  },
  {
    label: "운영기간순",
    group: "sort",
    isActive: (f) => f.sortBy === "duration",
    toggle: (f) => ({ ...f, sortBy: "duration" }),
  },
];

export function FilterChips({ filters, onChange }: FilterChipsProps) {
  const filterChips = CHIPS.filter(
    (c) => c.group === "filter" || c.group === "media",
  );
  const sortChips = CHIPS.filter((c) => c.group === "sort");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filterChips.map((chip) => {
        const active = chip.isActive(filters);
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => onChange(chip.toggle(filters))}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
              active
                ? "bg-[#F75D5D] text-white border-[#F75D5D]"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {chip.label}
          </button>
        );
      })}

      {/* 구분선 */}
      <div className="w-px h-5 bg-gray-200 mx-1" />

      {sortChips.map((chip) => {
        const active = chip.isActive(filters);
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => onChange(chip.toggle(filters))}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition border ${
              active
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
