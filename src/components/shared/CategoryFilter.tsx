"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  return (
    <Tabs value={currentValue} onValueChange={onChange}>
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="all">전체</TabsTrigger>
        {categories.map((cat) => (
          <TabsTrigger key={cat.value} value={cat.value}>
            {cat.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
