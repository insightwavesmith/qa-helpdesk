// 서버 전용 Supabase 클라이언트 (Server Components, Route Handlers)
// Phase 4: USE_CLOUD_SQL=true 시 DB 쿼리를 Cloud SQL로 라우팅
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { createDbClient } from "@/lib/db";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseClient = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출 시 무시
            // Middleware에서 세션 갱신 처리
          }
        },
      },
    }
  );

  // USE_CLOUD_SQL=true → auth는 Supabase, DB(.from/.rpc)는 Cloud SQL
  if (process.env.USE_CLOUD_SQL === "true") {
    const dbClient = createDbClient();
    return new Proxy(supabaseClient, {
      get(target, prop: string) {
        if (prop === "from" || prop === "rpc") {
          return dbClient[prop].bind(dbClient);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[prop];
      },
    }) as typeof supabaseClient;
  }

  return supabaseClient;
}

// 서비스 역할 클라이언트 (Server Actions, API Routes — RLS 우회)
// USE_CLOUD_SQL=true 시 Cloud SQL 직접 연결
export function createServiceClient() {
  if (process.env.USE_CLOUD_SQL === "true") {
    const dbClient = createDbClient();

    // storage 접근이 필요한 경우를 위해 Supabase storage만 유지
    const supabaseForStorage = createSupabaseJsClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    return new Proxy(dbClient, {
      get(target, prop: string) {
        if (prop === "storage") {
          return supabaseForStorage.storage;
        }
        if (prop === "auth") {
          return supabaseForStorage.auth;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (target as any)[prop];
      },
    }) as unknown as ReturnType<typeof createSupabaseJsClient<Database>>;
  }

  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  ) as ReturnType<typeof createSupabaseJsClient<Database>>;
}
