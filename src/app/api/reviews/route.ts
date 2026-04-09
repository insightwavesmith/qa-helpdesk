import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";
import { reviewCorsHeaders, handleReviewOptions } from "./_cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OPTIONS /api/reviews
 * CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  return handleReviewOptions(req);
}

/**
 * GET /api/reviews
 * 수강후기 목록 조회 (공개)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 12));
  const cohort = searchParams.get("cohort");
  const category = searchParams.get("category");
  const sortBy = searchParams.get("sortBy"); // "latest" | "rating"

  const svc = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = svc
    .from("reviews")
    .select("*, author:profiles!reviews_author_id_fkey(name)", { count: "exact" });

  if (cohort) query = query.eq("cohort", cohort);
  if (category) query = query.eq("category", category);

  // 정렬: featured → pinned → (rating|date)
  query = query
    .order("is_featured", { ascending: false })
    .order("featured_order", { ascending: true, nullsFirst: false })
    .order("is_pinned", { ascending: false });

  if (sortBy === "rating") {
    query = query.order("rating", { ascending: false, nullsFirst: false });
  }
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await query;

  if (error) {
    console.error("[api/reviews GET] error:", error);
    return NextResponse.json(
      { error: "후기 목록 조회 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { data: data || [], count: count || 0, page, pageSize },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60", ...reviewCorsHeaders(req) } },
  );
}

/**
 * POST /api/reviews
 * 수강후기 작성 (학생 전용)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "인증이 필요합니다.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (profile?.role !== "student") {
    return NextResponse.json(
      { error: "수강생만 후기를 작성할 수 있습니다.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "요청 본문이 올바르지 않습니다.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const { title, content, imageUrls, cohort, category, rating } = body;

  // 유효성 검증
  if (!title || typeof title !== "string" || title.length > 200) {
    return NextResponse.json(
      { error: "제목은 1~200자 필수입니다.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  if (!content || typeof content !== "string" || content.length > 5000) {
    return NextResponse.json(
      { error: "내용은 1~5000자 필수입니다.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  if (imageUrls && (!Array.isArray(imageUrls) || imageUrls.length > 3)) {
    return NextResponse.json(
      { error: "이미지는 최대 3개까지 가능합니다.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  if (rating != null && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    return NextResponse.json(
      { error: "별점은 1~5 사이 값이어야 합니다.", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const validCategories = ["general", "graduation", "weekly"];
  const cat = category && validCategories.includes(category) ? category : "general";

  const { data: review, error } = await svc
    .from("reviews")
    .insert({
      author_id: toProfileId(user.uid),
      title: title.trim(),
      content: content.trim(),
      image_urls: imageUrls || [],
      cohort: cohort || null,
      category: cat,
      rating: rating || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[api/reviews POST] error:", error);
    return NextResponse.json(
      { error: "후기 작성 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: review }, { status: 201 });
}
