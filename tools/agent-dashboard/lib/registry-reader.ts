import { readFileSync, existsSync } from 'fs'

/**
 * 팀 레지스트리 JSON 파일을 읽어서 반환한다.
 * 파일 없거나 파싱 실패 시 null.
 */
export function readTeamRegistry(registryPath: string): any | null {
  try {
    if (!existsSync(registryPath)) return null
    const raw = readFileSync(registryPath, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    console.error('[registry-reader] 레지스트리 읽기 실패:', err)
    return null
  }
}
