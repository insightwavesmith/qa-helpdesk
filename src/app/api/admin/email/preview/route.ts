import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { renderEmail, type TemplateName } from "@/lib/email-renderer";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    }

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
