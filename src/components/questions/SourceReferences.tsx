"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";

interface SourceRef {
  lecture_name: string;
  week: string;
  chunk_index: number;
  similarity: number;
}

function isSourceRef(item: unknown): item is SourceRef {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.lecture_name === "string" &&
    typeof obj.week === "string" &&
    typeof obj.chunk_index === "number" &&
    typeof obj.similarity === "number"
  );
}

export function parseSourceRefs(raw: unknown): SourceRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isSourceRef);
}

function SimilarityBadge({ similarity }: { similarity: number }) {
  const pct = Math.round(similarity * 100);
  const color =
    similarity >= 0.7
      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
      : similarity >= 0.5
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";

  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${color}`}>
      {pct}%
    </span>
  );
}

export function SourceReferences({ sourceRefs }: { sourceRefs: SourceRef[] }) {
  const [open, setOpen] = useState(false);

  if (sourceRefs.length === 0) return null;

  return (
    <div className="mt-3 border rounded-lg border-border dark:border-gray-700">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="font-medium">참고 강의 자료</span>
        <span className="text-xs">({sourceRefs.length})</span>
        <span className="ml-auto">
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {open && (
        <ul className="border-t border-border dark:border-gray-700 divide-y divide-border dark:divide-gray-700">
          {sourceRefs.map((ref, i) => (
            <li
              key={`${ref.lecture_name}-${ref.chunk_index}-${i}`}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-foreground truncate">
                  {ref.lecture_name}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {ref.week}
                </span>
              </div>
              <SimilarityBadge similarity={ref.similarity} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
