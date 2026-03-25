import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import { getCurrentUser } from "@/lib/firebase/auth";
import type { BackgroundTask } from "@/types/agent-dashboard";

const TASKS_PATH = "/tmp/cross-team/background/tasks.json";
const TASKS_DIR = "/tmp/cross-team/background";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  // 인증 확인
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { taskId } = await params;

  if (!taskId || !taskId.trim()) {
    return NextResponse.json({ error: "taskId가 필요합니다." }, { status: 400 });
  }

  let body: { current?: unknown; total?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const { current, total, status } = body;

  if (typeof current !== "number" || typeof total !== "number") {
    return NextResponse.json(
      { error: "current, total은 숫자여야 합니다." },
      { status: 400 }
    );
  }

  const validStatuses = ["running", "paused", "completed", "error"];
  if (typeof status !== "string" || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "status는 running | paused | completed | error 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  // 디렉토리 없으면 자동 생성
  await fs.mkdir(TASKS_DIR, { recursive: true });

  // tasks.json 읽기 (없으면 빈 배열)
  let tasks: BackgroundTask[] = [];
  try {
    const content = await fs.readFile(TASKS_PATH, "utf-8");
    tasks = JSON.parse(content) as BackgroundTask[];
  } catch {
    tasks = [];
  }

  // 해당 taskId 업데이트
  const existingIndex = tasks.findIndex((t) => t.id === taskId);
  if (existingIndex >= 0) {
    tasks[existingIndex] = {
      ...tasks[existingIndex],
      current,
      total,
      status: status as BackgroundTask["status"],
    };
  } else {
    // taskId가 없으면 새로 추가 (최소 필드로)
    tasks.push({
      id: taskId,
      label: taskId,
      current,
      total,
      color: "#6B7280",
      team: "cto",
      status: status as BackgroundTask["status"],
    });
  }

  await fs.writeFile(TASKS_PATH, JSON.stringify(tasks, null, 2), "utf-8");

  return NextResponse.json({ ok: true, taskId });
}
