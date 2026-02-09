"use client";

interface CategoryTabsProps {
  current: string;
  onChange: (category: string) => void;
}

const tabs = [
  { value: "all", label: "전체" },
  { value: "education", label: "교육" },
  { value: "case_study", label: "고객사례" },
  { value: "promo", label: "최신정보" },
];

export function CategoryTabs({ current, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-6 border-b border-gray-200">
      {tabs.map((tab) => {
        const isActive = current === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onChange(tab.value)}
            className={`relative pb-3 text-sm transition-colors ${
              isActive
                ? "font-bold text-[#1a1a2e]"
                : "text-gray-500 hover:text-[#1a1a2e]"
            }`}
          >
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F75D5D] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
