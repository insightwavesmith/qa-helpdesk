"use client";

interface CategoryTabsProps {
  current: string;
  onChange: (category: string) => void;
}

const tabs = [
  { value: "all", label: "전체" },
  { value: "info", label: "교육" },
  { value: "notice", label: "소식" },
  { value: "webinar", label: "웨비나" },
];

export function CategoryTabs({ current, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-2">
      {tabs.map((tab) => {
        const isActive = current === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive
                ? "bg-[#F75D5D] text-white"
                : "bg-white text-[#666666] border border-[#EEEEEE] hover:border-[#F75D5D] hover:text-[#F75D5D]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
