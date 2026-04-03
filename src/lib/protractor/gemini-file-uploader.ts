/**
 * Gemini File API — 영상 업로드 + 상태 polling
 * 설계서: docs/02-design/features/prescription-pipeline-v3.design.md §2.2.2
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FILE_API_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const FILE_STATUS_BASE = 'https://generativelanguage.googleapis.com/v1beta/files';

export interface GeminiFileRef {
  name: string;      // files/{id}
  uri: string;       // Gemini file URI
  mimeType: string;
  expiresAt: string; // 48시간 후
}

/**
 * GCS URL → Gemini File API 업로드
 * 1. GCS에서 영상 다운로드 (storage_url)
 * 2. Gemini File API에 resumable upload
 * 3. 처리 완료 대기 (polling, max 30회 × 2초)
 * 4. file_uri 반환
 */
export async function uploadVideoToGemini(
  videoUrl: string,
  mimeType = 'video/mp4'
): Promise<GeminiFileRef> {
  // 1. 영상 다운로드
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`영상 다운로드 실패: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const sizeBytes = buffer.byteLength;

  // 2. Resumable upload 시작
  const initRes = await fetch(
    `${FILE_API_BASE}?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(sizeBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({ file: { display_name: `rx-${Date.now()}` } }),
    }
  );

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('File API 업로드 URL 획득 실패');

  // 3. 영상 업로드
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': String(sizeBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  });

  const fileInfo = await uploadRes.json();

  // 4. 처리 대기 (state === 'ACTIVE')
  let file = fileInfo.file;
  let attempts = 0;
  while (file.state === 'PROCESSING' && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000));
    const statusRes = await fetch(
      `${FILE_STATUS_BASE}/${file.name}?key=${GEMINI_API_KEY}`
    );
    file = await statusRes.json();
    attempts++;
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`영상 처리 실패: state=${file.state}`);
  }

  return {
    name: file.name,
    uri: file.uri,
    mimeType,
    expiresAt: file.expirationTime,
  };
}
