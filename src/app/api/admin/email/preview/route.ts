import { NextRequest, NextResponse } from "next/server";
import { renderEmail, type TemplateName } from "@/lib/email-renderer";
import { requireAdmin } from "../../_shared";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const body = await request.json();
    const { template, subject, templateProps } = body as {
      template: TemplateName;
      subject: string;
      templateProps: Record<string, string>;
    };

    const html = await renderEmail(template, {
      subject,
      ...templateProps,
    } as Parameters<typeof renderEmail>[1]);

    return NextResponse.json({ html });
  } catch (error) {
    console.error("Preview render error:", error);
    return NextResponse.json(
      { error: "미리보기 렌더링 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
