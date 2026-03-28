import type { ServerWebSocket } from 'bun'
import { createFileWatcher } from '../lib/file-watcher'
import { readPdcaStatus } from '../lib/pdca-reader'
import { readAllTasks } from '../lib/task-parser'
import { readTeamRegistry } from '../lib/registry-reader'
import {
  getRecentMessages,
  getUndeliveredCount,
  getPendingAckMessages,
  getActivePeers,
} from '../lib/broker-reader'

export interface WsMessage {
  type: 'full:refresh' | 'pdca:update' | 'tasks:update' | 'teams:update' | 'messages:update'
  data: any
  at: string
}

// 연결된 클라이언트 관리
const clients = new Set<ServerWebSocket<unknown>>()

export function addClient(ws: ServerWebSocket<unknown>) {
  clients.add(ws)
}

export function removeClient(ws: ServerWebSocket<unknown>) {
  clients.delete(ws)
}

export function getClientCount(): number {
  return clients.size
}

/** 모든 클라이언트에 메시지 전송 */
function broadcast(msg: WsMessage) {
  const payload = JSON.stringify(msg)
  for (const ws of clients) {
    try {
      ws.send(payload)
    } catch {
      clients.delete(ws)
    }
  }
}

/** 전체 대시보드 데이터를 조립하여 전송 */
export function sendFullRefresh(
  ws: ServerWebSocket<unknown>,
  paths: { pdca: string; tasksDir: string; registry: string; brokerDb: string }
) {
  const msg: WsMessage = {
    type: 'full:refresh',
    data: buildDashboardState(paths),
    at: new Date().toISOString(),
  }
  ws.send(JSON.stringify(msg))
}

/** 대시보드 전체 상태 빌드 */
function buildDashboardState(paths: {
  pdca: string
  tasksDir: string
  registry: string
  brokerDb: string
}) {
  return {
    pdca: readPdcaStatus(paths.pdca),
    tasks: readAllTasks(paths.tasksDir),
    teams: readTeamRegistry(paths.registry),
    messages: {
      recent: getRecentMessages(paths.brokerDb, 50),
      undelivered: getUndeliveredCount(paths.brokerDb),
      pendingAck: getPendingAckMessages(paths.brokerDb),
      peers: getActivePeers(paths.brokerDb),
    },
  }
}

/** broker 상태 변경 시 WS push */
export function broadcastBrokerStatus(status: string, warning?: string) {
  broadcast({
    type: 'broker:status' as any,
    data: { status, warning },
    at: new Date().toISOString(),
  })
}

/**
 * 파일 워처를 설정하여 변경 감지 시 클라이언트에 push.
 */
export function setupFileWatchers(paths: {
  pdca: string
  tasksDir: string
  registry: string
}) {
  // PDCA 상태 파일 감시
  createFileWatcher([paths.pdca], () => {
    broadcast({
      type: 'pdca:update',
      data: readPdcaStatus(paths.pdca),
      at: new Date().toISOString(),
    })
  })

  // 태스크 디렉토리 감시
  createFileWatcher([paths.tasksDir], () => {
    broadcast({
      type: 'tasks:update',
      data: readAllTasks(paths.tasksDir),
      at: new Date().toISOString(),
    })
  })

  // 팀 레지스트리 감시
  createFileWatcher([paths.registry], () => {
    broadcast({
      type: 'teams:update',
      data: readTeamRegistry(paths.registry),
      at: new Date().toISOString(),
    })
  })
}
