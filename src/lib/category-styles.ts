import {
  Megaphone,
  Target,
  Palette,
  TrendingUp,
  Settings,
  Globe,
  BarChart3,
  Zap,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

interface CategoryStyle {
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  borderColor: string;
  lightBg: string;
}

// slug 기반 카테고리 스타일 매핑
const categoryStyleMap: Record<string, CategoryStyle> = {
  campaign: {
    icon: Megaphone,
    bgColor: "bg-blue-500",
    textColor: "text-blue-700 dark:text-blue-300",
    borderColor: "border-blue-200 dark:border-blue-800",
    lightBg: "bg-blue-50 dark:bg-blue-950/40",
  },
  targeting: {
    icon: Target,
    bgColor: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-300",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    lightBg: "bg-emerald-50 dark:bg-emerald-950/40",
  },
  creative: {
    icon: Palette,
    bgColor: "bg-purple-500",
    textColor: "text-purple-700 dark:text-purple-300",
    borderColor: "border-purple-200 dark:border-purple-800",
    lightBg: "bg-purple-50 dark:bg-purple-950/40",
  },
  roas: {
    icon: TrendingUp,
    bgColor: "bg-orange-500",
    textColor: "text-orange-700 dark:text-orange-300",
    borderColor: "border-orange-200 dark:border-orange-800",
    lightBg: "bg-orange-50 dark:bg-orange-950/40",
  },
  setup: {
    icon: Settings,
    bgColor: "bg-slate-500",
    textColor: "text-slate-700 dark:text-slate-300",
    borderColor: "border-slate-200 dark:border-slate-800",
    lightBg: "bg-slate-50 dark:bg-slate-950/40",
  },
  pixel: {
    icon: Globe,
    bgColor: "bg-cyan-500",
    textColor: "text-cyan-700 dark:text-cyan-300",
    borderColor: "border-cyan-200 dark:border-cyan-800",
    lightBg: "bg-cyan-50 dark:bg-cyan-950/40",
  },
  analytics: {
    icon: BarChart3,
    bgColor: "bg-indigo-500",
    textColor: "text-indigo-700 dark:text-indigo-300",
    borderColor: "border-indigo-200 dark:border-indigo-800",
    lightBg: "bg-indigo-50 dark:bg-indigo-950/40",
  },
  optimization: {
    icon: Zap,
    bgColor: "bg-amber-500",
    textColor: "text-amber-700 dark:text-amber-300",
    borderColor: "border-amber-200 dark:border-amber-800",
    lightBg: "bg-amber-50 dark:bg-amber-950/40",
  },
};

const defaultStyle: CategoryStyle = {
  icon: HelpCircle,
  bgColor: "bg-gray-500",
  textColor: "text-gray-700 dark:text-gray-300",
  borderColor: "border-gray-200 dark:border-gray-800",
  lightBg: "bg-gray-50 dark:bg-gray-950/40",
};

export function getCategoryStyle(slug: string): CategoryStyle {
  return categoryStyleMap[slug] || defaultStyle;
}

export type { CategoryStyle };
