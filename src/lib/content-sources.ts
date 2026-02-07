import fs from "fs/promises";
import path from "path";

const KNOWLEDGE_BASE =
  "/Users/smith/Library/Mobile Documents/com~apple~CloudDocs/claude/brand-school/marketing/knowledge";

const SOURCE_MAP: Record<string, string[]> = {
  blueprint: [
    "blueprint/01-getting-started",
    "blueprint/02-targeting",
    "blueprint/03-optimization",
    "blueprint/04-measurement",
    "blueprint/05-creative",
  ],
  trend: ["blogs"],
  webinar: [], // 웨비나는 하드코딩 템플릿 사용
  tips: ["blueprint"],
  custom: ["."],
};

export interface ContentSection {
  title: string;
  content: string;
  source: string; // 파일 경로 (상대)
}

/**
 * 디렉토리에서 .md 파일 목록을 재귀적으로 수집
 */
async function collectMdFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const nested = await collectMdFiles(fullPath);
        results.push(...nested);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  } catch {
    // 디렉토리 읽기 실패 시 빈 배열
  }

  return results;
}

/**
 * Markdown 파일 내용을 ## 헤더 기준으로 섹션 파싱
 */
function parseSections(
  content: string,
  source: string
): ContentSection[] {
  const lines = content.split("\n");
  const sections: ContentSection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      // 이전 섹션 저장
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
          source,
        });
      }
      currentTitle = headerMatch[1].trim();
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }

  // 마지막 섹션 저장
  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trim(),
      source,
    });
  }

  return sections;
}

/**
 * 카테고리에 맞는 콘텐츠 섹션들을 가져온다.
 * topic이 있으면 제목/내용에서 해당 키워드가 포함된 섹션만 필터링.
 */
export async function getContentSources(
  category: string,
  topic?: string
): Promise<ContentSection[]> {
  const dirs = SOURCE_MAP[category];
  if (!dirs || dirs.length === 0) {
    return [];
  }

  const allFiles: string[] = [];

  for (const dir of dirs) {
    const fullDir = path.join(KNOWLEDGE_BASE, dir);
    const files = await collectMdFiles(fullDir);
    allFiles.push(...files);
  }

  const allSections: ContentSection[] = [];

  for (const filePath of allFiles) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const relativePath = path.relative(KNOWLEDGE_BASE, filePath);
      const sections = parseSections(content, relativePath);
      allSections.push(...sections);
    } catch {
      // 파일 읽기 실패 시 건너뜀
    }
  }

  // topic 필터링
  if (topic) {
    const keyword = topic.toLowerCase();
    return allSections.filter(
      (s) =>
        s.title.toLowerCase().includes(keyword) ||
        s.content.toLowerCase().includes(keyword)
    );
  }

  return allSections;
}
