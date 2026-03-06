"use client";

export interface FilterState {
  activeOnly: boolean;
  minDays: number;
  platform: string;
}

interface FilterChipsProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

interface ChipDef {
  label: string;
  isActive: (f: FilterState) => boolean;
  toggle: (f: FilterState) => FilterState;
}

const CHIPS: ChipDef[] = [
  {
    label: "30일+",
    isActive: (f) => f.minDays === 30,
    toggle: (f) => ({ ...f, minDays: f.minDays === 30 ? 0 : 30 }),
  },
  {
    label: "게재중",
    isActive: (f) => f.activeOnly,
    toggle: (f) => ({ ...f, activeOnly: !f.activeOnly }),
  },
  {
    label: "Facebook",
    isActive: (f) => f.platform === "facebook",
    toggle: (f) => ({
      ...f,
      platform: f.platform === "facebook" ? "" : "facebook",
    }),
  },
  {
    label: "Instagram",
    isActive: (f) => f.platform === "instagram",
    toggle: (f) => ({
      ...f,
      platform: f.platform === "instagram" ? "" : "instagram",
    }),
  },
];

export function FilterChips({ filters, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHIPS.map((chip) => {
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
    </div>
  );
}
