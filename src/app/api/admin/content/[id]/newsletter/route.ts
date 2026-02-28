import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../_shared";

export const runtime = "nodejs";

// 10MB body size limit
const MAX_BODY_SIZE = 10 * 1024 * 1024;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    // body size 수동 체크
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "요청 본문이 너무 큽니다. (최대 10MB)" },
        { status: 413 }
      );
    }

    const { id } = await params;

    // body 파싱
    const body = await request.json();
    const { email_design_json, email_html, email_subject } = body as {
      email_design_json?: Record<string, unknown> | null;
      email_html?: string | null;
      email_subject?: string | null;
    };

    // 최소 하나의 필드는 있어야 함
    if (
      email_design_json === undefined &&
      email_html === undefined &&
      email_subject === undefined
    ) {
      return NextResponse.json(
        { error: "저장할 데이터가 없습니다." },
        { status: 400 }
      );
    }

    // 콘텐츠 존재 확인
    const { data: existing } = await svc
      .from("contents")
      .select("id")
      .eq("id", id)
      .single();

    if (!existing) {
      return NextResponse.json(
        { error: "콘텐츠를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 업데이트할 필드만 구성
    const updateData: Record<string, unknown> = {};
    if (email_design_json !== undefined) {
      updateData.email_design_json = email_design_json;
    }
    if (email_html !== undefined) {
      updateData.email_html = email_html;
    }
    if (email_subject !== undefined) {
      updateData.email_subject = email_subject;
    }

    const { error } = await svc
      .from("contents")
      .update(updateData)
      .eq("id", id);

    if (error) {
      console.error("Newsletter save error:", error);
      return NextResponse.json(
        { error: "저장에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Newsletter API error:", error);
    return NextResponse.json(
      { error: "저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
