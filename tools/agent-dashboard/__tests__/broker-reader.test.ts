import { describe, it, expect } from 'vitest'
import {
  getRecentMessages,
  getUndeliveredCount,
  getPendingAckMessages,
  getActivePeers,
} from '../lib/broker-reader'
import { existsSync } from 'fs'
import { join } from 'path'

// 실제 DB 경로 (있을 수도 없을 수도 있음)
const REAL_DB_PATH = join(process.env.HOME ?? '', '.claude-peers.db')
const hasDb = existsSync(REAL_DB_PATH)

describe('broker-reader', () => {
  // BR-1: 최근 메시지 조회 (실제 DB 또는 null)
  it('최근 메시지 조회 — DB 있으면 배열, 없으면 null', () => {
    const msgs = getRecentMessages(REAL_DB_PATH, 50)
    if (hasDb) {
      expect(Array.isArray(msgs)).toBe(true)
      // 50건 이하
      expect(msgs!.length).toBeLessThanOrEqual(50)
    } else {
      expect(msgs).toBeNull()
    }
  })

  // BR-2: 미배달 건수 (숫자 반환)
  it('미배달 건수 — 숫자 반환 (DB 없으면 0)', () => {
    const count = getUndeliveredCount(REAL_DB_PATH)
    expect(typeof count).toBe('number')
    expect(count).toBeGreaterThanOrEqual(0)
  })

  // BR-3: DB 파일 없음 → null
  it('존재하지 않는 DB 경로 → null (크래시 아님)', () => {
    const msgs = getRecentMessages('/nonexistent/peers.db', 50)
    expect(msgs).toBeNull()

    const pending = getPendingAckMessages('/nonexistent/peers.db')
    expect(pending).toBeNull()

    const peers = getActivePeers('/nonexistent/peers.db')
    expect(peers).toBeNull()

    // getUndeliveredCount는 DB 없으면 0 반환
    const count = getUndeliveredCount('/nonexistent/peers.db')
    expect(count).toBe(0)
  })

  // BR-4: peers 목록 조회
  it('peers 목록 조회 — DB 있으면 배열, 없으면 null', () => {
    const peers = getActivePeers(REAL_DB_PATH)
    if (hasDb) {
      expect(Array.isArray(peers)).toBe(true)
    } else {
      expect(peers).toBeNull()
    }
  })
})
