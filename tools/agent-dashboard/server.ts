import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { resolve, join } from 'path'

import { readPdcaStatus } from './lib/pdca-reader'
import { readAllTasks } from './lib/task-parser'
import { readTeamRegistry } from './lib/registry-reader'
import {
  getRecentMessages,
  getUndeliveredCount,
  getPendingAckMessages,
  getActivePeers,
} from './lib/broker-reader'
import {
  addClient,
  removeClient,
  sendFullRefresh,
  setupFileWatchers,
  broadcastBrokerStatus,
} from './routes/ws'
import { checkBrokerHealth, getBrokerWarning, type BrokerStatus } from './lib/broker-health'

// --- 경로 설정 ---
const BSCAMP_ROOT = process.env.BSCAMP_ROOT || resolve(import.meta.dir, '..', '..')
const PDCA_PATH = join(BSCAMP_ROOT, 'docs', '.pdca-status.json')
const TASKS_DIR = join(BSCAMP_ROOT, '.claude', 'tasks')
const REGISTRY_PATH = join(BSCAMP_ROOT, '.claude', 'runtime', 'teammate-registry.json')
const BROKER_DB = process.env.BROKER_DB_PATH || join(process.env.HOME ?? '', '.claude-peers.db')
const BROKER_HEALTH_URL = process.env.BROKER_HEALTH_URL || 'http://localhost:7899/health'

const PORT = 3847
const startTime = Date.now()

// broker 상태 캐시 (10초 간격 갱신)
let cachedBrokerStatus: BrokerStatus = 'not_installed'
async function refreshBrokerStatus() {
  const prev = cachedBrokerStatus
  cachedBrokerStatus = await checkBrokerHealth(BROKER_DB, BROKER_HEALTH_URL)
  if (prev !== cachedBrokerStatus) {
    broadcastBrokerStatus(cachedBrokerStatus, getBrokerWarning(cachedBrokerStatus))
  }
}
refreshBrokerStatus()
setInterval(refreshBrokerStatus, 10_000)

// --- Hono 앱 ---
const app = new Hono()

// Basic Auth (TUNNEL_AUTH 설정 시에만 활성)
app.use('*', async (c, next) => {
  if (!process.env.TUNNEL_AUTH) return next()
  const auth = c.req.header('Authorization')
  const expected = `Basic ${btoa(process.env.TUNNEL_AUTH)}`
  if (auth !== expected) {
    return c.text('Unauthorized', 401, {
      'WWW-Authenticate': 'Basic realm="Agent Dashboard"',
    })
  }
  return next()
})

// REST API
app.get('/api/pdca', (c) => {
  const data = readPdcaStatus(PDCA_PATH)
  return c.json({ ok: true, data })
})

app.get('/api/tasks', (c) => {
  const data = readAllTasks(TASKS_DIR)
  return c.json({ ok: true, data })
})

app.get('/api/teams', (c) => {
  const data = readTeamRegistry(REGISTRY_PATH)
  return c.json({ ok: true, data })
})

app.get('/api/messages', (c) => {
  const limit = Number(c.req.query('limit') ?? 50)
  return c.json({
    ok: true,
    data: {
      recent: getRecentMessages(BROKER_DB, limit),
      undelivered: getUndeliveredCount(BROKER_DB),
      pendingAck: getPendingAckMessages(BROKER_DB),
      peers: getActivePeers(BROKER_DB),
      brokerStatus: cachedBrokerStatus,
      brokerWarning: getBrokerWarning(cachedBrokerStatus),
    },
  })
})

app.get('/api/dashboard', (c) => {
  return c.json({
    ok: true,
    data: {
      pdca: readPdcaStatus(PDCA_PATH),
      tasks: readAllTasks(TASKS_DIR),
      teams: readTeamRegistry(REGISTRY_PATH),
      messages: {
        recent: getRecentMessages(BROKER_DB, 50),
        undelivered: getUndeliveredCount(BROKER_DB),
        pendingAck: getPendingAckMessages(BROKER_DB),
        peers: getActivePeers(BROKER_DB),
        brokerStatus: cachedBrokerStatus,
        brokerWarning: getBrokerWarning(cachedBrokerStatus),
      },
    },
  })
})

app.get('/health', (c) => {
  return c.json({
    ok: true,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    port: PORT,
  })
})

// 정적 파일 서빙 (API 뒤에 배치)
app.use('/*', serveStatic({ root: './public' }))

// --- WebSocket 경로 설정 ---
const wsPaths = {
  pdca: PDCA_PATH,
  tasksDir: TASKS_DIR,
  registry: REGISTRY_PATH,
  brokerDb: BROKER_DB,
}

// 파일 워처 시작
setupFileWatchers(wsPaths)

// --- Bun 서버 (HTTP + WebSocket) ---
const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // WebSocket 업그레이드 처리
    const url = new URL(req.url)
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req)
      if (upgraded) return undefined
      return new Response('WebSocket 업그레이드 실패', { status: 400 })
    }

    // Hono로 HTTP 요청 위임
    return app.fetch(req)
  },
  websocket: {
    open(ws) {
      addClient(ws)
      // 연결 즉시 전체 데이터 전송
      sendFullRefresh(ws, wsPaths)
      console.log(`[ws] 클라이언트 연결 (총 ${ws}건)`)
    },
    message(_ws, _message) {
      // 클라이언트→서버 메시지는 현재 미사용
    },
    close(ws) {
      removeClient(ws)
      console.log('[ws] 클라이언트 연결 해제')
    },
  },
})

console.log(`🚀 Agent Dashboard 서버 시작: http://localhost:${server.port}`)
console.log(`   BSCAMP_ROOT: ${BSCAMP_ROOT}`)
console.log(`   PDCA: ${PDCA_PATH}`)
console.log(`   TASKS: ${TASKS_DIR}`)
console.log(`   REGISTRY: ${REGISTRY_PATH}`)
console.log(`   BROKER_DB: ${BROKER_DB}`)

export default app
export { app }
