import { describe, it, expect } from 'vitest'
import app from '../server'

describe('API 통합 테스트', () => {
  // API-1: GET /api/dashboard → DashboardState 구조
  it('GET /api/dashboard → DashboardState 구조', async () => {
    const res = await app.request('/api/dashboard')
    expect(res.status).toBe(200)

    const json = await res.json() as any
    expect(json.ok).toBe(true)
    expect(json.data).toHaveProperty('pdca')
    expect(json.data).toHaveProperty('tasks')
    expect(json.data).toHaveProperty('teams')
    expect(json.data).toHaveProperty('messages')
  })

  // API-2: GET /api/tasks → 배열
  it('GET /api/tasks → TaskFile 배열', async () => {
    const res = await app.request('/api/tasks')
    expect(res.status).toBe(200)

    const json = await res.json() as any
    expect(json.ok).toBe(true)
    expect(Array.isArray(json.data)).toBe(true)
  })

  // API-3: GET /health → { ok: true }
  it('GET /health → ok: true + uptime', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)

    const json = await res.json() as any
    expect(json.ok).toBe(true)
    expect(typeof json.uptime).toBe('number')
    expect(json.port).toBe(3847)
  })

  // API-4: GET /api/messages → recent/undelivered 필드
  it('GET /api/messages → recent/undelivered 필드 포함', async () => {
    const res = await app.request('/api/messages')
    expect(res.status).toBe(200)

    const json = await res.json() as any
    expect(json.ok).toBe(true)
    expect(json.data).toHaveProperty('recent')
    expect(json.data).toHaveProperty('undelivered')
    expect(json.data).toHaveProperty('pendingAck')
    expect(json.data).toHaveProperty('peers')
    // undelivered는 항상 숫자
    expect(typeof json.data.undelivered).toBe('number')
  })
})
