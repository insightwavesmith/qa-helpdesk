# 페이지 로딩 성능 개선 P1 — 설계서

## 1. 데이터 모델
변경 없음

## 2. API 설계
변경 없음

## 3. 컴포넌트 구조

### T1: Dynamic Import 분리

#### 3-1. PostDetailClient.tsx — InlineEditor 분리
**현재**: `import { InlineEditor } from "@/components/post/InlineEditor"` (직접 import)
**문제**: tiptap + prosemirror + 13개 extension (~1.3MB)이 글 읽기에도 로드
**변경**: 편집 모드 진입 시에만 동적 로드
```typescript
const InlineEditor = dynamic(
  () => import("@/components/post/InlineEditor").then(m => m.InlineEditor),
  { ssr: false, loading: () => <div className="h-96 animate-pulse bg-gray-100 rounded-lg" /> }
);
```

#### 3-2. admin/knowledge/page.tsx — recharts 분리
**현재**: recharts 직접 import (BarChart, PieChart, LineChart 등)
**변경**: 차트 영역을 별도 컴포넌트 KnowledgeCharts.tsx로 추출 + dynamic import
```typescript
// admin/knowledge/page.tsx
const KnowledgeCharts = dynamic(
  () => import("./knowledge-charts").then(m => m.KnowledgeCharts),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
```

#### 3-3. QaChatButton.tsx — QaChatPanel 분리
**현재**: `import { QaChatPanel } from "./QaChatPanel"` (모든 페이지 로드)
**변경**: 챗봇 열기 시에만 동적 로드
```typescript
const QaChatPanel = dynamic(
  () => import("./QaChatPanel").then(m => m.QaChatPanel),
  { ssr: false }
);
```

### T2: SSR Bailout 수정
- `questions-list-client.tsx`, `posts-redesign-client.tsx` 등은 이미 서버 컴포넌트의 Suspense 내부에서 렌더링됨
- `posts/[id]/page.tsx`에서 PostDetailClient를 Suspense로 감싸기
- `useSearchParams()` 사용 컴포넌트는 반드시 Suspense boundary 내에 있어야 SSR bailout 방지

### T3: Pretendard Self-hosting
**변경 파일**: `src/app/layout.tsx`, `public/fonts/`
```typescript
// layout.tsx
import localFont from "next/font/local";

const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});
```
- `public/fonts/PretendardVariable.woff2` 다운로드 배치
- `<link>` CDN 태그 제거
- `<html>` 또는 `<body>`에 `className={pretendard.variable}` 추가
- globals.css의 `--font-sans`는 기존 유지 (이미 "Pretendard Variable" 참조)

### T4: 리다이렉트 최적화
**변경 파일**: `src/lib/supabase/middleware.ts`, `src/app/page.tsx`
```typescript
// middleware.ts의 isPublicPath — "/" 를 public이 아닌 보호 경로로 변경
// 미인증 → /login 리다이렉트 (기존 로직 활용)
// 인증 → /dashboard 리다이렉트 (새로 추가)

// "/" 접근 시 middleware에서 즉시 리다이렉트:
if (pathname === "/") {
  if (user) redirect("/dashboard");
  else redirect("/login");
}
```
- `src/app/page.tsx` 유지 (fallback용 — middleware 우회 시 대비)

## 4. 에러 처리
- Dynamic import 로딩 실패 → loading fallback 표시 (사용자에게 빈 화면 방지)
- 폰트 로딩 실패 → font-display: swap으로 시스템 폰트 폴백
- 리다이렉트 실패 → page.tsx의 기존 로직이 fallback

## 5. 구현 순서
1. T1: dynamic import 적용 (PostDetailClient, knowledge, QaChatButton)
2. T3: Pretendard self-hosting
3. T4: 리다이렉트 최적화
4. T2: SSR bailout 수정
5. 빌드 검증 + before/after 비교
