import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { appendGcsJsonl } from "@/lib/gcs-storage";
import type { CommLog, TeamId } from "@/types/agent-dashboard";

const VALID_TEAMS: TeamId[] = ["pm", "marketing", "cto"];

export async function POST(request: NextRequest) {
  // admin 권한 확인
  const auth = await requireAdmin();
  if ("response" in auth) {
    return auth.response;
  }

  let body: { from?: unknown; team?: unknown; to?: unknown; msg?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { from, team, to, msg } = body;

  if (typeof from !== "string" || !from.trim()) {
    return NextResponse.json({ error: "from 필드가 필요합니다." }, { status: 400 });
  }
  if (typeof team !== "string" || !VALID_TEAMS.includes(team as TeamId)) {
    return NextResponse.json(
      { error: "team은 pm | marketing | cto 중 하나여야 합니다." },
      { status: 400 }
    );
  }
  if (typeof msg !== "string" || !msg.trim()) {
    return NextResponse.json({ error: "msg 필드가 필요합니다." }, { status: 400 });
  }

  const logEntry: CommLog = {
    time: new Date().toISOString(),
    from: from.trim(),
    team: team as TeamId,
    msg: msg.trim(),
    ...(typeof to === "string" && to.trim() ? { to: to.trim() } : {}),
  };

  // GCS JSONL에 append
  await appendGcsJsonl("logs/comm.jsonl", logEntry);

  return NextResponse.json({ ok: true, entry: logEntry }, { status: 201 });
}
