---
name: nextjs-supabase
description: Next.js 15 App Router + Supabase 패턴. 서버 컴포넌트, RLS, Auth, Server Actions 규칙.
---

# Next.js 15 + Supabase 개발 패턴

## App Router 규칙
- Server Component 기본. `'use client'`는 필요할 때만.
- `page.tsx`는 서버 컴포넌트. 데이터 페칭은 여기서.
- Client Component에서 Supabase 직접 호출 금지 → Server Action 사용.

## Supabase 패턴
- `createClient()`: 서버 = `createServerComponentClient`, 클라이언트 = `createBrowserClient`
- RLS 필수. 새 테이블이면 정책 먼저 추가.
- SECURITY DEFINER 함수: `SET search_path = public` 필수.
- 변수명이 테이블명/타입명과 겹치면 안 됨.
- Service Role은 서버 사이드에서만. 절대 클라이언트에 노출 금지.

## Server Actions
```ts
'use server'
export async function myAction(formData: FormData) {
  const supabase = await createClient()
  // 항상 에러 핸들링
  const { data, error } = await supabase.from('table').select()
  if (error) throw new Error(error.message)
  revalidatePath('/path')
  return data
}
```

## 타입 안전성
- `supabase gen types typescript` 결과를 `types/database.ts`에 유지.
- `Database['public']['Tables']['table']['Row']` 타입 사용.

## 에러 처리
- try/catch 대신 Result 패턴 선호: `{ data, error }`
- 사용자에게 보이는 에러 메시지는 한국어.
