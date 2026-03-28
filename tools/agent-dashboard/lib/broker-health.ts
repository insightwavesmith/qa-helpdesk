import { existsSync } from 'fs'

export type BrokerStatus = 'alive' | 'dead' | 'not_installed'

const HEALTH_TIMEOUT = 3_000

/**
 * broker 생존 여부를 확인한다.
 * - DB 파일 없음 → not_installed
 * - DB 있고 /health 응답 → alive
 * - DB 있지만 /health 실패 → dead (프로세스 다운)
 */
export async function checkBrokerHealth(
  dbPath: string,
  healthUrl: string
): Promise<BrokerStatus> {
  if (!existsSync(dbPath)) return 'not_installed'

  try {
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
    })
    return res.ok ? 'alive' : 'dead'
  } catch {
    return 'dead'
  }
}

/**
 * brokerStatus에 따른 경고 메시지를 반환한다.
 */
export function getBrokerWarning(status: BrokerStatus): string | undefined {
  if (status === 'dead') {
    return '⚠ broker 프로세스 중단 — 새 메시지 수신 불가. 재시작: bun ~/claude-peers-mcp/broker.ts'
  }
  return undefined
}
