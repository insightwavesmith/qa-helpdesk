import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { embedContentToChunks } from "@/actions/embed-pipeline";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // CRON_SECRET 인증
    const cronSecret = request.headers.get("x-cron-secret");
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, body_md, source_ref, recorded_at } = body as {
      title: string;
      body_md: string;
      source_ref: string;
      recorded_at?: string;
    };

    if (!title || !body_md || !source_ref) {
      return NextResponse.json(
        { error: "title, body_md, source_ref는 필수입니다." },
        { status: 400 }
      );
    }

    const svc = createServiceClient();

    // 이미 같은 source_ref로 저장된 게 있으면 스킵
    const { data: existing } = await svc
      .from("contents")
      .select("id")
      .eq("source_type", "webinar")
      .eq("source_ref", source_ref)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { message: "이미 등록된 웨비나입니다.", id: existing.id, skipped: true },
        { status: 200 }
      );
    }

    // contents 저장
    const { data, error } = await svc
      .from("contents")
      .insert({
        title,
        body_md,
        source_type: "webinar",
        source_ref,
        curation_status: "new",
        status: "draft",
        ...(recorded_at ? { created_at: recorded_at } : {}),
      })
      .select()
      .single();

    if (error || !data) {
      console.error("add-webinar insert error:", error);
      return NextResponse.json(
        { error: "콘텐츠 저장 실패: " + (error?.message || "unknown") },
        { status: 500 }
      );
    }

    // 자동 임베딩 (after — 응답 후 백그라운드)
    after(async () => {
      try {
        await embedContentToChunks(data.id);
      } catch (err) {
        console.error("add-webinar auto-embed failed:", err);
      }
    });

    return NextResponse.json(
      { message: "웨비나 등록 완료", id: data.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("add-webinar error:", error);
    return NextResponse.json(
      { error: "서버 오류" },
      { status: 500 }
    );
  }
}
