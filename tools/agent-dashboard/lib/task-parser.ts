import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

export interface TaskFile {
  filename: string
  frontmatter: {
    team: string
    session: string
    created: string
    status: string
    owner: string
    dependsOn?: string[]
  }
  title: string
  checkboxes: {
    total: number
    checked: number
    items: { text: string; done: boolean }[]
  }
}

const FRONTMATTER_DEFAULTS: TaskFile['frontmatter'] = {
  team: '',
  session: '',
  created: '',
  status: '',
  owner: '',
}

/**
 * frontmatter(--- 블록) 파싱. YAML 키:값 추출.
 */
function parseFrontmatter(raw: string): {
  frontmatter: TaskFile['frontmatter']
  body: string
} {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n?/
  const match = raw.match(fmRegex)

  if (!match) {
    return { frontmatter: { ...FRONTMATTER_DEFAULTS }, body: raw }
  }

  const fmBlock = match[1]
  const body = raw.slice(match[0].length)
  const fm: Record<string, any> = {}

  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()

    // 배열 처리: [a, b] 형태
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      // 따옴표 제거
      fm[key] = value.replace(/^["']|["']$/g, '')
    }
  }

  return {
    frontmatter: {
      team: fm.team ?? '',
      session: fm.session ?? '',
      created: fm.created ?? '',
      status: fm.status ?? '',
      owner: fm.owner ?? '',
      ...(fm.dependsOn ? { dependsOn: Array.isArray(fm.dependsOn) ? fm.dependsOn : [fm.dependsOn] } : {}),
    },
    body,
  }
}

/**
 * 본문에서 체크박스 항목을 추출한다.
 * frontmatter 블록 내의 체크박스는 제외됨.
 */
function parseCheckboxes(body: string): TaskFile['checkboxes'] {
  const items: { text: string; done: boolean }[] = []
  const lines = body.split('\n')

  for (const line of lines) {
    const checkMatch = line.match(/^[\s]*-\s+\[([ xX])\]\s+(.*)/)
    if (checkMatch) {
      items.push({
        done: checkMatch[1].toLowerCase() === 'x',
        text: checkMatch[2].trim(),
      })
    }
  }

  return {
    total: items.length,
    checked: items.filter((i) => i.done).length,
    items,
  }
}

/**
 * 본문에서 첫 번째 # 제목을 추출한다.
 */
function extractTitle(body: string, filename: string): string {
  const match = body.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : filename
}

/**
 * TASK 마크다운 콘텐츠를 파싱한다.
 */
export function parseTask(content: string, filename?: string): TaskFile {
  const fname = filename ?? 'unknown.md'
  const { frontmatter, body } = parseFrontmatter(content)

  return {
    filename: fname,
    frontmatter,
    title: extractTitle(body, fname),
    checkboxes: parseCheckboxes(body),
  }
}

/**
 * 태스크 디렉토리의 모든 TASK-*.md 파일을 읽어 파싱한다.
 */
export function readAllTasks(tasksDir: string): TaskFile[] {
  try {
    if (!existsSync(tasksDir)) return []
    const files = readdirSync(tasksDir).filter(
      (f) => f.startsWith('TASK-') && f.endsWith('.md')
    )

    return files.map((f) => {
      const content = readFileSync(join(tasksDir, f), 'utf-8')
      return parseTask(content, f)
    })
  } catch (err) {
    console.error('[task-parser] 태스크 읽기 실패:', err)
    return []
  }
}
