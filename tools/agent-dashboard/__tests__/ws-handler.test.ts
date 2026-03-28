import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * WebSocket 핸들러 유닛 테스트.
 * 실제 WS 연결이 아닌 모듈 import로 테스트.
 * (ws-integration은 서버 실행 필요 → 별도 E2E)
 */

// ws.ts의 broadcast/addClient/removeClient를 테스트
// Bun ServerWebSocket 의존 → mock
describe('ws-handler', () => {
  // WS-1: addClient/removeClient/getClientCount
  it('클라이언트 추가/제거 카운트', async () => {
    // 동적 import로 모듈 격리
    const { addClient, removeClient, getClientCount } = await import('../routes/ws')

    const mockWs1 = { send: vi.fn() } as any
    const mockWs2 = { send: vi.fn() } as any

    const initialCount = getClientCount()
    addClient(mockWs1)
    addClient(mockWs2)
    expect(getClientCount()).toBe(initialCount + 2)

    removeClient(mockWs1)
    expect(getClientCount()).toBe(initialCount + 1)

    removeClient(mockWs2)
    expect(getClientCount()).toBe(initialCount)
  })

  // WS-2: sendFullRefresh 호출 시 full:refresh 타입
  it('sendFullRefresh → full:refresh 이벤트 전송', async () => {
    const { sendFullRefresh } = await import('../routes/ws')

    const mockWs = {
      send: vi.fn(),
    } as any

    sendFullRefresh(mockWs, {
      pdca: '/nonexistent/pdca.json',
      tasksDir: '/nonexistent/tasks',
      registry: '/nonexistent/registry.json',
      brokerDb: '/nonexistent/peers.db',
    })

    expect(mockWs.send).toHaveBeenCalledTimes(1)
    const sent = JSON.parse(mockWs.send.mock.calls[0][0])
    expect(sent.type).toBe('full:refresh')
    expect(sent.data).toHaveProperty('pdca')
    expect(sent.data).toHaveProperty('tasks')
    expect(sent.data).toHaveProperty('teams')
    expect(sent.data).toHaveProperty('messages')
  })

  // WS-3: broadcastBrokerStatus 함수 존재 + 호출
  it('broadcastBrokerStatus 함수 정상 호출', async () => {
    const { broadcastBrokerStatus } = await import('../routes/ws')
    // 클라이언트 없으면 에러 없이 종료
    expect(() => broadcastBrokerStatus('dead', '경고 메시지')).not.toThrow()
    expect(() => broadcastBrokerStatus('alive')).not.toThrow()
    expect(() => broadcastBrokerStatus('not_installed')).not.toThrow()
  })
})
