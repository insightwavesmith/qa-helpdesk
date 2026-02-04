"use client";

interface CategoryFilterProps {
  categories: { value: string; label: string }[];
  currentValue: string;
  onChange: (value: string) => void;
}

export function CategoryFilter({
  categories,
  currentValue,
  onChange,
}: CategoryFilterProps) {
  const allItems = [{ value: "all", label: "전체" }, ...categories];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
      {allItems.map((cat) => {
        const isActive = currentValue === cat.value || (!currentValue && cat.value === "all");
        return (
          <button
            key={cat.value}
            onClick={() => onChange(cat.value)}
            className={`shrink-0 text-sm px-3.5 py-1.5 rounded-full border transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground border-primary font-medium"
                : "bg-background text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
}
