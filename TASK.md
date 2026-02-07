# TASK: 로딩속도 개선

## 목표
웹사이트 로딩이 매우 느림. 원인 파악 후 개선.

## 작업 (순서대로)

### 1. next.config.ts 번들 최적화
```ts
const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react', 'recharts', '@tiptap/react', '@tiptap/starter-kit',
      '@tiptap/extension-color', '@tiptap/extension-image', '@tiptap/extension-link',
      '@tiptap/extension-placeholder', '@tiptap/extension-text-align',
      '@tiptap/extension-text-style', '@tiptap/extension-underline',
      '@tiptap/pm', 'framer-motion', 'motion', 'radix-ui', '@tanstack/react-table',
      '@react-email/components', 'react-email'
    ],
  },
};
```

### 2. Dynamic Import (무거운 컴포넌트)
- TipTap 에디터를 사용하는 곳: `next/dynamic` + `{ ssr: false }`
- recharts 차트 컴포넌트: dynamic import
- 각 페이지에서 실제 사용하는 곳을 찾아서 적용

### 3. 프로필 캐싱
- `src/app/(main)/layout.tsx`에서 매번 DB 조회하는 부분 최적화
- 프로필을 쿠키에 캐싱 (5분 TTL)
- 쿠키 있으면 DB 안 침, 없거나 만료면 조회 후 캐싱

### 4. loading.tsx Skeleton UI
주요 페이지에 loading.tsx 추가:
- `src/app/(main)/loading.tsx`
- `src/app/(main)/dashboard/loading.tsx`
- `src/app/(main)/admin/email/loading.tsx`
- `src/app/(main)/protractor/loading.tsx`
- `src/app/(main)/questions/loading.tsx`

간단한 회색 블록 + animate-pulse

### 5. 분석 기록
`docs/perf-analysis.md`에 뭘 바꿨고 왜 바꿨는지 기록

## 완료 조건
- [ ] `npm run build` 성공
- [ ] lint 에러 없음
- [ ] 기존 기능 안 깨짐
- [ ] `git add -A && git commit -m "perf: 로딩속도 개선" && git push`
- [ ] 완료 후: `openclaw gateway wake --text "Done: 로딩속도 개선 완료" --mode now`

## 주의
- 한국어 UI 유지
- 기존 코드 최소 변경
- shadcn/ui 건드리지 않기
