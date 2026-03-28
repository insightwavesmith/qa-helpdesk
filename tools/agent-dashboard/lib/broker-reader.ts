import { Database } from 'bun:sqlite'
import { existsSync } from 'fs'

/**
 * DB 연결을 열고 반환한다. 파일 없으면 null.
 */
function openDb(dbPath: string): Database | null {
  try {
    if (!existsSync(dbPath)) return null
    return new Database(dbPath, { readonly: true })
  } catch (err) {
    console.error('[broker-reader] DB 열기 실패:', err)
    return null
  }
}

/**
 * 최근 메시지를 가져온다.
 */
export function getRecentMessages(dbPath: string, limit: number): any[] | null {
  const db = openDb(dbPath)
  if (!db) return null
  try {
    const rows = db.query('SELECT * FROM messages ORDER BY sent_at DESC LIMIT ?').all(limit)
    return rows as any[]
  } catch (err) {
    console.error('[broker-reader] 메시지 조회 실패:', err)
    return null
  } finally {
    db.close()
  }
}

/**
 * 미전달 메시지 수를 반환한다.
 */
export function getUndeliveredCount(dbPath: string): number {
  const db = openDb(dbPath)
  if (!db) return 0
  try {
    const row = db.query('SELECT COUNT(*) as cnt FROM messages WHERE delivered = 0').get() as { cnt: number } | null
    return row?.cnt ?? 0
  } catch (err) {
    console.error('[broker-reader] 미전달 카운트 실패:', err)
    return 0
  } finally {
    db.close()
  }
}

/**
 * ACK 대기 중인 메시지를 반환한다.
 * body에 ack_required가 true이고 아직 ACK 응답이 없는 것.
 */
export function getPendingAckMessages(dbPath: string): any[] | null {
  const db = openDb(dbPath)
  if (!db) return null
  try {
    // text 컬럼에서 ack_required 포함 + 미전달 메시지
    const rows = db
      .query(
        `SELECT * FROM messages
         WHERE text LIKE '%"ack_required":true%'
           AND delivered = 0
         ORDER BY sent_at DESC`
      )
      .all()
    return rows as any[]
  } catch (err) {
    console.error('[broker-reader] ACK 대기 조회 실패:', err)
    return null
  } finally {
    db.close()
  }
}

/**
 * 활성 피어 목록을 반환한다.
 */
export function getActivePeers(dbPath: string): any[] | null {
  const db = openDb(dbPath)
  if (!db) return null
  try {
    const rows = db.query('SELECT * FROM peers').all()
    return rows as any[]
  } catch (err) {
    console.error('[broker-reader] 피어 조회 실패:', err)
    return null
  } finally {
    db.close()
  }
}
