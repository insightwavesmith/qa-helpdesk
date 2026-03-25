import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { writeGcsJson } from "@/lib/gcs-storage";
import type { TeamId, TeamState } from "@/types/agent-dashboard";

const VALID_TEAMS: TeamId[] = ["pm", "marketing", "cto"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  // admin 권한 확인
  const auth = await requireAdmin();
  if ("response" in auth) {
    return auth.response;
  }

  const { teamId } = await params;

  // teamId 검증
  if (!VALID_TEAMS.includes(teamId as TeamId)) {
    return NextResponse.json(
      { error: "teamId는 pm | marketing | cto 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  let body: TeamState;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  // GCS에 state.json 쓰기
  await writeGcsJson(`${teamId}/state.json`, body);

  return NextResponse.json({ ok: true, teamId });
}
