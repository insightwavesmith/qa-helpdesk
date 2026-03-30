import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { requireAdmin } from "../_shared";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  try {
    const filePath = path.join(process.cwd(), ".bkit/runtime/last-completion-report.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ ts: null, message: "보고 없음" });
  }
}
