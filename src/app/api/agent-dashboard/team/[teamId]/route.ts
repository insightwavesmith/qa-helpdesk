import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import { requireAdmin } from "@/app/api/admin/_shared";
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

  const dirPath = `/tmp/cross-team/${teamId}`;
  const filePath = `${dirPath}/state.json`;

  // 디렉토리 없으면 자동 생성
  await fs.mkdir(dirPath, { recursive: true });

  // state.json 덮어쓰기
  await fs.writeFile(filePath, JSON.stringify(body, null, 2), "utf-8");

  return NextResponse.json({ ok: true, teamId });
}
