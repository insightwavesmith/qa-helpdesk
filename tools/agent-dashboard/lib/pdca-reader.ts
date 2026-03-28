import { readFileSync, existsSync } from 'fs'

export interface PdcaFeature {
  phase: string
  plan: { team: string; done: boolean; doc: string; at: string | null }
  design: { team: string; done: boolean; doc: string; at: string | null }
  do: { team: string; done: boolean; commit: string | null; at: string | null }
  check: { team: string; done: boolean; doc: string; matchRate: number | null }
  act: { done: boolean; commit: string | null }
  notes: string
  updatedAt: string
}

export interface PdcaStatus {
  features: Record<string, PdcaFeature>
  updatedAt: string
  notes: string
}

/**
 * PDCA 상태 파일을 읽어서 파싱한다.
 * 파일 없거나 파싱 실패 시 null 반환.
 */
export function readPdcaStatus(filePath: string): PdcaStatus | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!parsed.features || typeof parsed.features !== 'object') return null
    return parsed as PdcaStatus
  } catch (err) {
    console.error('[pdca-reader] 파싱 실패:', err)
    return null
  }
}
