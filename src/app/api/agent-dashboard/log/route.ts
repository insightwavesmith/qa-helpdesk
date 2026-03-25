import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import { getCurrentUser } from "@/lib/firebase/auth";
import type { CommLog, TeamId } from "@/types/agent-dashboard";

const VALID_TEAMS: TeamId[] = ["pm", "marketing", "cto"];
const LOG_PATH = "/tmp/cross-team/logs/comm.jsonl";
const LOG_DIR = "/tmp/cross-team/logs";

export async function POST(request: NextRequest) {
  // 인증 확인
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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

  // 디렉토리 없으면 자동 생성
  await fs.mkdir(LOG_DIR, { recursive: true });

  // JSONL에 append
  const line = JSON.stringify(logEntry) + "\n";
  await fs.appendFile(LOG_PATH, line, "utf-8");

  return NextResponse.json({ ok: true, entry: logEntry }, { status: 201 });
}
