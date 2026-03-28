// 통신 로그 컴포넌트
// Props: { messages: BrokerMessage[] }
;(function () {
  const { html } = window

  const TYPE_STYLES = {
    TASK_HANDOFF: { bg: '#FFE4E6', color: '#BE123C' },
    COMPLETION: { bg: '#DCFCE7', color: '#166534' },
    STATUS_UPDATE: { bg: '#DBEAFE', color: '#1D4ED8' },
    FEEDBACK: { bg: '#F3F4F6', color: '#6B7280' },
    URGENT: { bg: '#FEE2E2', color: '#991B1B' },
    ERROR: { bg: '#FEE2E2', color: '#991B1B' },
    ACK: { bg: '#DCFCE7', color: '#166534' },
  }

  function formatTime(ts) {
    if (!ts) return '--:--'
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    } catch {
      return String(ts).slice(0, 5)
    }
  }

  function DeliveryStatus({ status }) {
    const s = (status || '').toLowerCase()
    if (s === 'delivered' || s === 'ack') {
      return html`<span class="text-xs text-green-600 flex-shrink-0">✓ ${s === 'ack' ? 'ACK' : '배달'}</span>`
    }
    if (s === 'pending_ack' || s === 'pending') {
      return html`<span class="text-xs flex-shrink-0" style="color:#F59E0B;">⏳ ACK대기</span>`
    }
    if (s === 'failed' || s === 'undelivered') {
      return html`<span class="text-xs text-red-500 flex-shrink-0">✗ 실패</span>`
    }
    return html`<span class="text-xs text-gray-400 flex-shrink-0">${status || '-'}</span>`
  }

  function TypeBadge({ type }) {
    const t = (type || '').toUpperCase()
    const style = TYPE_STYLES[t] || { bg: '#F3F4F6', color: '#6B7280' }
    return html`<span class="badge flex-shrink-0" style="background:${style.bg}; color:${style.color};">${t || '기타'}</span>`
  }

  function LogRow({ msg }) {
    const isUrgent = (msg.type || '').toUpperCase() === 'URGENT'
    const isPendingAck = (msg.deliveryStatus || '').toLowerCase() === 'pending_ack'

    return html`
      <div class="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-gray-50 transition-colors"
           style="${(isUrgent || isPendingAck) ? 'background:#FFFBEB;' : ''}">
        <span class="text-xs text-gray-400 w-10 flex-shrink-0 mt-0.5">${formatTime(msg.timestamp)}</span>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span class="text-xs text-gray-700" style="font-weight:500;">${msg.from || '?'}</span>
          <span class="text-gray-300 text-xs">\u2192</span>
          <span class="text-xs text-gray-700" style="font-weight:500;">${msg.to || '?'}</span>
        </div>
        <${TypeBadge} type=${msg.type} />
        <span class="text-xs text-gray-600 flex-1 min-w-0 truncate">${msg.summary ? '"' + msg.summary + '"' : '-'}</span>
        <${DeliveryStatus} status=${msg.deliveryStatus} />
      </div>
    `
  }

  function CommLog({ messages }) {
    const msgs = messages || []

    return html`
      <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
          <h2 class="text-sm text-gray-800" style="font-weight:700;">통신 로그</h2>
          <span class="ml-auto text-xs text-gray-400">${msgs.length > 0 ? '오늘 ' + msgs.length + '건' : ''}</span>
        </div>
        ${msgs.length > 0
          ? html`
            <div class="space-y-1.5 max-h-72 overflow-y-auto">
              ${msgs.slice(0, 50).map(m => html`<${LogRow} msg=${m} />`)}
            </div>
          `
          : html`<p class="text-xs text-gray-400 text-center py-6">메시지 없음</p>`
        }
      </section>
    `
  }

  window.CommLog = CommLog
})()
