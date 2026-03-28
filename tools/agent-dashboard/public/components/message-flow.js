// 메시지 흐름 컴포넌트
// Props: { messages: { recent, undelivered, pendingAck, todayTotal } }
;(function () {
  const { html } = window

  function MessageFlow({ messages }) {
    if (!messages) {
      return html`
        <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
            <h2 class="text-sm text-gray-800" style="font-weight:700;">메시지 흐름</h2>
          </div>
          <p class="text-xs text-gray-400 text-center py-6">MCP 미설치</p>
        </section>
      `
    }

    const undelivered = messages.undelivered || 0
    const pendingAck = messages.pendingAck || 0
    const todayTotal = messages.todayTotal || 0
    const recent = messages.recent || []

    // 최근 메시지에서 노드 및 엣지 추출
    const nodes = new Map()
    const edges = []
    for (const msg of recent.slice(0, 10)) {
      const from = msg.from || '?'
      const to = msg.to || '?'
      if (!nodes.has(from)) nodes.set(from, { id: from, label: from })
      if (!nodes.has(to)) nodes.set(to, { id: to, label: to })
      edges.push({ from, to, status: msg.deliveryStatus || 'delivered' })
    }

    // 노드 위치 계산
    const nodeList = Array.from(nodes.values())
    const nodePositions = {}
    const cols = Math.min(nodeList.length, 4)
    const colWidth = 520 / (cols + 1)
    nodeList.forEach((n, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      nodePositions[n.id] = {
        x: colWidth * (col + 1),
        y: 40 + row * 70
      }
    })

    return html`
      <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
          <h2 class="text-sm text-gray-800" style="font-weight:700;">메시지 흐름</h2>
        </div>

        <!-- 노드 시각화 -->
        <div class="relative" style="height:160px;">
          <svg width="100%" height="160" viewBox="0 0 520 160" xmlns="http://www.w3.org/2000/svg">
            ${edges.map(e => {
              const fp = nodePositions[e.from]
              const tp = nodePositions[e.to]
              if (!fp || !tp) return null
              const color = e.status === 'delivered' ? '#22C55E' : e.status === 'pending_ack' ? '#F59E0B' : '#EF4444'
              const isDashed = e.status !== 'delivered'
              return html`
                <line x1=${fp.x + 45} y1=${fp.y + 25} x2=${tp.x - 45} y2=${tp.y + 25}
                  stroke=${color} stroke-width="2"
                  stroke-dasharray=${isDashed ? '5,4' : 'none'}
                  class=${isDashed ? 'dash-animate' : ''} />
              `
            })}
            ${nodeList.map(n => {
              const pos = nodePositions[n.id]
              if (!pos) return null
              return html`
                <rect x=${pos.x - 45} y=${pos.y} width="90" height="50" rx="8" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="1.5"/>
                <text x=${pos.x} y=${pos.y + 21} text-anchor="middle" font-family="Pretendard" font-size="11" font-weight="600" fill="#374151">${n.label}</text>
                <text x=${pos.x} y=${pos.y + 39} text-anchor="middle" font-family="Pretendard" font-size="9.5" fill="#9CA3AF">${n.id}</text>
              `
            })}
          </svg>
        </div>

        <!-- 통계 요약 -->
        <div class="grid grid-cols-3 gap-3 mt-2">
          <div class="rounded-lg p-3 text-center" style="background:${undelivered > 0 ? '#FEE2E2' : '#F9FAFB'}; border:1px solid ${undelivered > 0 ? '#FECACA' : '#E5E7EB'};">
            <div class="text-lg text-gray-800" style="font-weight:700;">${undelivered}</div>
            <div class="text-xs text-gray-500 mt-0.5">미배달</div>
          </div>
          <div class="rounded-lg p-3 text-center" style="background:${pendingAck > 0 ? '#FEF3C7' : '#F9FAFB'}; border:1px solid ${pendingAck > 0 ? '#FDE68A' : '#E5E7EB'};">
            <div class="text-lg" style="font-weight:700; color:${pendingAck > 0 ? '#B45309' : '#374151'};">${pendingAck}</div>
            <div class="text-xs mt-0.5" style="color:${pendingAck > 0 ? '#92400E' : '#6B7280'};">ACK 대기</div>
          </div>
          <div class="rounded-lg p-3 text-center" style="background:#DCFCE7; border:1px solid #BBF7D0;">
            <div class="text-lg" style="font-weight:700; color:#166534;">${todayTotal}</div>
            <div class="text-xs mt-0.5" style="color:#15803D;">오늘 전송</div>
          </div>
        </div>
      </section>
    `
  }

  window.MessageFlow = MessageFlow
})()
