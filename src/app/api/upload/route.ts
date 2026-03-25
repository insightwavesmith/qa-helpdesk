/**
 * POST /api/upload — GCS 파일 업로드 프록시
 * DELETE /api/upload — GCS 파일 삭제
 *
 * GCS SDK는 서버 사이드 전용이므로 클라이언트 컴포넌트는 이 엔드포인트를 통해 업로드.
 * 인증: Supabase Auth getUser() (로그인된 사용자면 누구나 허용)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { uploadToGcs, deleteFromGcs } from "@/lib/gcs-storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** 허용 버킷 화이트리스트 */
const ALLOWED_BUCKETS = new Set([
  "question-images",
  "qa-images",
  "content-images",
  "review-images",
  "documents",
  "email-attachments",
]);

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    // FormData 파싱
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bucket = formData.get("bucket") as string | null;
    const path = formData.get("path") as string | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    }

    if (!bucket) {
      return NextResponse.json({ error: "버킷이 필요합니다." }, { status: 400 });
    }

    if (!path) {
      return NextResponse.json({ error: "경로가 필요합니다." }, { status: 400 });
    }

    // 버킷 화이트리스트 검증
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: "허용되지 않는 버킷입니다." }, { status: 400 });
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "파일 크기 초과 (최대 10MB)" },
        { status: 400 },
      );
    }

    // Buffer 변환 후 GCS 업로드
    const buffer = Buffer.from(await file.arrayBuffer());
    const { publicUrl, error } = await uploadToGcs(bucket, path, buffer, file.type);

    if (error) {
      console.error("[/api/upload] GCS 업로드 실패:", error);
      return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
    }

    return NextResponse.json({ publicUrl });
  } catch (err) {
    console.error("[/api/upload] POST 오류:", err);
    return NextResponse.json({ error: "업로드 실패" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 인증 확인
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");

    if (!bucket || !path) {
      return NextResponse.json({ error: "bucket과 path가 필요합니다." }, { status: 400 });
    }

    // 버킷 화이트리스트 검증
    if (!ALLOWED_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: "허용되지 않는 버킷입니다." }, { status: 400 });
    }

    const { error } = await deleteFromGcs(bucket, path);

    if (error) {
      console.error("[/api/upload] GCS 삭제 실패:", error);
      return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/upload] DELETE 오류:", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
