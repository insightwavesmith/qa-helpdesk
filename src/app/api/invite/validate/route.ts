import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { publicLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limiter";

/**
 * POST /api/invite/validate
 * 초대코드 유효성 검증 — 인증 불필요 (가입 폼에서 호출)
 * service role로 invite_codes 테이블 직접 조회 (RLS 우회)
 */
export async function POST(request: NextRequest) {
  const rl = publicLimiter.check(getClientIp(request));
  if (!rl.success) return rateLimitResponse(rl);

  try {
    const body = await request.json();
    const { code } = body as { code?: string };

    if (!code || code.trim().length === 0) {
      return NextResponse.json(
        { valid: false, error: "초대코드를 입력해주세요" },
        { status: 400 }
      );
    }

    const trimmedCode = code.trim();
    const svc = createServiceClient();

    const { data: row, error } = await svc
      .from("invite_codes")
      .select("code, cohort, expires_at, max_uses, used_count")
      .eq("code", trimmedCode)
      .maybeSingle();

    if (error) {
      console.error("invite/validate DB error:", error);
      return NextResponse.json(
        { valid: false, error: "서버 오류가 발생했습니다" },
        { status: 500 }
      );
    }

    // 1. 코드 존재 여부
    if (!row) {
      return NextResponse.json(
        { valid: false, error: "유효하지 않은 초대코드입니다" },
        { status: 200 }
      );
    }

    // 2. 만료 여부
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return NextResponse.json(
        { valid: false, error: "초대코드가 만료되었습니다" },
        { status: 200 }
      );
    }

    // 3. 사용 횟수 초과 여부
    const usedCount = row.used_count ?? 0;
    if (row.max_uses !== null && usedCount >= row.max_uses) {
      return NextResponse.json(
        { valid: false, error: "초대코드 사용 한도를 초과했습니다" },
        { status: 200 }
      );
    }

    // 유효
    return NextResponse.json({
      valid: true,
      cohort: row.cohort,
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "서버 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
