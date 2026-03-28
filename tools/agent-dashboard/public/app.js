// 에이전트 미션 컨트롤 — 메인 앱
;(function () {
  const { html, render, useState, useEffect, useRef } = window
  const { PdcaPipeline, TeamStatus, MessageFlow, TaskBoard, CommLog } = window

  const API_BASE = ''
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const WS_URL = `${wsProto}//${location.host}/ws`

  function Header({ connected, lastUpdated, onRefresh }) {
    return html`
      <header class="flex items-center justify-between mb-5 bg-white px-6 py-3 rounded-lg border border-gray-200 shadow-sm">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style="background:#F75D5D;">M</div>
          <h1 class="text-lg text-gray-900" style="font-weight:700;">에이전트 미션 컨트롤</h1>
          <span class="text-xs text-gray-400">localhost:${location.port || '3847'}</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full ${connected ? 'bg-green-500 pulse-green' : 'bg-red-500'}"></div>
            <span class="text-sm text-gray-600" style="font-weight:500;">${connected ? '연결됨' : '연결 끊김'}</span>
          </div>
          <div class="text-xs text-gray-400">마지막 갱신: ${lastUpdated || '-'}</div>
          <button onclick=${onRefresh} class="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50" style="font-weight:500;">새로고침</button>
        </div>
      </header>
    `
  }

  function formatTime(date) {
    if (!date) return '-'
    try {
      const d = new Date(date)
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    } catch {
      return '-'
    }
  }

  function App() {
    const [state, setState] = useState(null)
    const [connected, setConnected] = useState(false)
    const [lastUpdated, setLastUpdated] = useState(null)
    const wsRef = useRef(null)
    const reconnectRef = useRef(null)

    function fetchData() {
      fetch(API_BASE + '/api/dashboard')
        .then(r => r.json())
        .then(res => {
          setState(res.data || res)
          setLastUpdated(formatTime(new Date()))
        })
        .catch(err => console.warn('데이터 가져오기 실패:', err))
    }

    function connectWs() {
      if (wsRef.current && wsRef.current.readyState <= 1) return
      try {
        const ws = new WebSocket(WS_URL)
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          if (reconnectRef.current) {
            clearTimeout(reconnectRef.current)
            reconnectRef.current = null
          }
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'full-state') {
              setState(msg.data)
            } else if (msg.type === 'patch') {
              setState(prev => prev ? { ...prev, ...msg.data } : msg.data)
            }
            setLastUpdated(formatTime(new Date()))
          } catch (e) {
            console.warn('WS 메시지 파싱 실패:', e)
          }
        }

        ws.onclose = () => {
          setConnected(false)
          reconnectRef.current = setTimeout(connectWs, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch {
        setConnected(false)
        reconnectRef.current = setTimeout(connectWs, 3000)
      }
    }

    useEffect(() => {
      fetchData()
      connectWs()
      return () => {
        if (wsRef.current) wsRef.current.close()
        if (reconnectRef.current) clearTimeout(reconnectRef.current)
      }
    }, [])

    function refresh() {
      fetchData()
    }

    if (!state) {
      return html`
        <div class="flex items-center justify-center h-screen">
          <div class="text-center">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold mx-auto mb-3" style="background:#F75D5D;">M</div>
            <p class="text-sm text-gray-500">데이터 로딩 중...</p>
            <p class="text-xs text-gray-400 mt-1">서버 연결을 확인하세요</p>
          </div>
        </div>
      `
    }

    return html`
      <div>
        <${Header} connected=${connected} lastUpdated=${lastUpdated} onRefresh=${refresh} />
        <${PdcaPipeline} features=${state.pdca?.features || {}} />
        <div class="grid gap-5 mb-5" style="grid-template-columns: 1fr 1fr;">
          <${TeamStatus} teams=${state.teams} />
          <${MessageFlow} messages=${state.messages} />
        </div>
        <div class="grid gap-5" style="grid-template-columns: 1fr 1fr;">
          <${TaskBoard} tasks=${state.tasks || []} />
          <${CommLog} messages=${state.messages?.recent || []} />
        </div>
        <div class="h-6"></div>
      </div>
    `
  }

  render(html`<${App} />`, document.getElementById('app'))
})()
