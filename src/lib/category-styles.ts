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
    textColor: "text-blue-700",
    borderColor: "border-blue-200",
    lightBg: "bg-blue-50",
  },
  targeting: {
    icon: Target,
    bgColor: "bg-emerald-500",
    textColor: "text-emerald-700",
    borderColor: "border-emerald-200",
    lightBg: "bg-emerald-50",
  },
  creative: {
    icon: Palette,
    bgColor: "bg-purple-500",
    textColor: "text-purple-700",
    borderColor: "border-purple-200",
    lightBg: "bg-purple-50",
  },
  roas: {
    icon: TrendingUp,
    bgColor: "bg-orange-500",
    textColor: "text-orange-700",
    borderColor: "border-orange-200",
    lightBg: "bg-orange-50",
  },
  setup: {
    icon: Settings,
    bgColor: "bg-slate-500",
    textColor: "text-slate-700",
    borderColor: "border-slate-200",
    lightBg: "bg-slate-50",
  },
  pixel: {
    icon: Globe,
    bgColor: "bg-cyan-500",
    textColor: "text-cyan-700",
    borderColor: "border-cyan-200",
    lightBg: "bg-cyan-50",
  },
  analytics: {
    icon: BarChart3,
    bgColor: "bg-indigo-500",
    textColor: "text-indigo-700",
    borderColor: "border-indigo-200",
    lightBg: "bg-indigo-50",
  },
  optimization: {
    icon: Zap,
    bgColor: "bg-amber-500",
    textColor: "text-amber-700",
    borderColor: "border-amber-200",
    lightBg: "bg-amber-50",
  },
};

const defaultStyle: CategoryStyle = {
  icon: HelpCircle,
  bgColor: "bg-gray-500",
  textColor: "text-gray-700",
  borderColor: "border-gray-200",
  lightBg: "bg-gray-50",
};

export function getCategoryStyle(slug: string): CategoryStyle {
  return categoryStyleMap[slug] || defaultStyle;
}

export type { CategoryStyle };
