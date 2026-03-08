"use client";

import JSZip from "jszip";

/** ZIP에 추가할 파일 정보 */
export interface DownloadFile {
  url: string;
  filename: string;
  /** ZIP 내 폴더 경로 (예: "브랜드_광고ID") */
  folder?: string;
}

/** 다운로드 진행 상태 */
export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
}

/**
 * 파일명에서 안전하지 않은 문자를 제거
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
}

/**
 * 단일 파일 다운로드 (fetch → blob → a.click)
 */
export async function downloadFile(
  url: string,
  filename: string,
): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`다운로드 실패 (${res.status})`);
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = sanitizeFilename(filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "파일 다운로드에 실패했습니다";
    throw new Error(msg);
  }
}

/**
 * 복수 파일을 클라이언트에서 ZIP으로 묶어 다운로드
 */
export async function downloadFilesAsZip(
  files: DownloadFile[],
  zipFilename: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  if (files.length === 0) {
    throw new Error("다운로드할 파일이 없습니다");
  }

  const zip = new JSZip();
  const progress: DownloadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
  };

  // 파일명 중복 방지
  const usedNames = new Set<string>();

  function getUniqueName(name: string): string {
    const safe = sanitizeFilename(name);
    if (!usedNames.has(safe)) {
      usedNames.add(safe);
      return safe;
    }
    // 충돌 시 suffix 추가
    const dotIdx = safe.lastIndexOf(".");
    const base = dotIdx > 0 ? safe.slice(0, dotIdx) : safe;
    const ext = dotIdx > 0 ? safe.slice(dotIdx) : "";
    let counter = 2;
    let candidate = `${base}_${counter}${ext}`;
    while (usedNames.has(candidate)) {
      counter++;
      candidate = `${base}_${counter}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
  }

  // 병렬 fetch
  const results = await Promise.allSettled(
    files.map(async (file) => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return { file, blob };
      } catch {
        return null;
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const { file, blob } = result.value;
      const uniqueName = getUniqueName(file.filename);
      const path = file.folder ? `${file.folder}/${uniqueName}` : uniqueName;
      zip.file(path, blob);
      progress.completed++;
    } else {
      progress.failed++;
    }
    onProgress?.({ ...progress });
  }

  if (progress.completed === 0) {
    throw new Error("다운로드할 수 있는 파일이 없습니다");
  }

  // ZIP 생성 + 다운로드
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = sanitizeFilename(zipFilename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
