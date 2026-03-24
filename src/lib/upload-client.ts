/**
 * GCS 업로드 클라이언트 유틸리티
 *
 * GCS SDK는 서버 사이드 전용이므로 클라이언트 컴포넌트에서는
 * /api/upload 엔드포인트를 통해 업로드.
 */

/**
 * 파일을 GCS에 업로드하고 공개 URL을 반환한다.
 * @param file 업로드할 파일
 * @param bucket GCS 버킷 이름 (화이트리스트: question-images, qa-images, content-images, review-images, documents, email-attachments)
 * @param path 저장 경로 (예: "questions/1711234567-abc123.jpg")
 * @returns 업로드된 파일의 공개 URL
 */
export async function uploadFile(file: File, bucket: string, path: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("bucket", bucket);
  formData.append("path", path);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error || "업로드 실패");
  }
  return ((await res.json()) as { publicUrl: string }).publicUrl;
}

/**
 * GCS에서 파일을 삭제한다.
 * @param bucket GCS 버킷 이름
 * @param path 삭제할 파일 경로
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  await fetch(
    `/api/upload?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
    { method: "DELETE" },
  );
}
