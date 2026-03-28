// PDCA 파이프라인 컴포넌트
// Props: { features: Record<string, PdcaFeature> }
;(function () {
  const { html } = window

  const PHASES = ['plan', 'design', 'do', 'check', 'act']
  const PHASE_LABELS = { plan: 'Plan', design: 'Design', do: 'Do', check: 'Check', act: 'Act' }

  function getPhaseStatus(feature, phase) {
    const completed = feature.completedPhases || []
    const current = (feature.currentPhase || '').toLowerCase()
    if (completed.includes(phase)) return 'completed'
    if (current === phase) return 'active'
    return 'pending'
  }

  function getPhaseBadge(feature) {
    const current = (feature.currentPhase || 'plan').toLowerCase()
    const completed = feature.completedPhases || []
    const label = PHASE_LABELS[current] || current

    if (feature.phase === 'completed' || completed.length === 5) {
      return html`<span class="text-xs px-2 py-0.5 rounded-md" style="font-weight:500; background:#DCFCE7; color:#166534;">완료</span>`
    }
    if (completed.includes(current)) {
      return html`<span class="text-xs px-2 py-0.5 rounded-md" style="font-weight:500; background:#DCFCE7; color:#166534;">${label} 완료</span>`
    }
    if (completed.length === 0 && current === 'plan') {
      return html`<span class="text-xs px-2 py-0.5 rounded-md" style="font-weight:500; background:#F3F4F6; color:#6B7280;">대기</span>`
    }
    const prevCount = completed.length
    if (prevCount > 0 && !completed.includes(current)) {
      return html`<span class="text-xs px-2 py-0.5 rounded-md" style="font-weight:500; background:#FEF3C7; color:#92400E;">${label} 진행중</span>`
    }
    return html`<span class="text-xs px-2 py-0.5 rounded-md" style="font-weight:500; background:#FEF9C3; color:#713F12;">${label} 완료</span>`
  }

  function PhaseNode({ status, label, matchRate }) {
    if (status === 'completed') {
      return html`
        <div class="flex flex-col items-center gap-1">
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs" style="background:#22C55E;">✓</div>
          <span class="text-xs text-gray-500">${label}</span>
          ${matchRate != null && label === 'Check' ? html`<span class="text-xs ${matchRate >= 90 ? 'text-green-600' : 'text-red-500'}">${matchRate}%</span>` : null}
        </div>
      `
    }
    if (status === 'active') {
      return html`
        <div class="flex flex-col items-center gap-1">
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs pulse-orange" style="background:#F59E0B;">↻</div>
          <span class="text-xs" style="font-weight:500; color:#B45309;">${label}</span>
        </div>
      `
    }
    return html`
      <div class="flex flex-col items-center gap-1">
        <div class="w-7 h-7 rounded-full flex items-center justify-center border-2 border-gray-300 bg-white text-gray-300 text-xs">○</div>
        <span class="text-xs text-gray-400">${label}</span>
      </div>
    `
  }

  function Connector({ fromStatus, toStatus }) {
    let color = '#E5E7EB'
    if (fromStatus === 'completed' && toStatus === 'completed') color = '#22C55E'
    else if (fromStatus === 'completed' && toStatus === 'active') color = '#F59E0B'
    return html`<div class="flex-1 h-px" style="background:${color}; max-width:32px;"></div>`
  }

  function FeatureRow({ name, feature }) {
    return html`
      <div class="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
        <div class="w-44 text-xs text-gray-700 truncate" style="font-weight:600;">${name}</div>
        <div class="flex items-center gap-1 flex-1">
          ${PHASES.map((phase, i) => {
            const status = getPhaseStatus(feature, phase)
            const nextStatus = i < PHASES.length - 1 ? getPhaseStatus(feature, PHASES[i + 1]) : null
            return html`
              <${PhaseNode} status=${status} label=${PHASE_LABELS[phase]} matchRate=${phase === 'check' ? feature.matchRate : null} />
              ${i < PHASES.length - 1 ? html`<${Connector} fromStatus=${status} toStatus=${nextStatus} />` : null}
            `
          })}
        </div>
        <div class="w-20 text-right">
          ${getPhaseBadge(feature)}
        </div>
      </div>
    `
  }

  function PdcaPipeline({ features }) {
    const entries = features ? Object.entries(features) : []
    const count = entries.length

    if (count === 0) {
      return html`
        <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-5">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
            <h2 class="text-sm text-gray-800" style="font-weight:700;">PDCA 파이프라인</h2>
          </div>
          <p class="text-xs text-gray-400 text-center py-4">등록된 피처 없음</p>
        </section>
      `
    }

    return html`
      <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5 mb-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
          <h2 class="text-sm text-gray-800" style="font-weight:700;">PDCA 파이프라인</h2>
          <span class="ml-auto text-xs text-gray-400">활성 피처 ${count}개</span>
        </div>
        <div class="space-y-3">
          ${entries.map(([name, feature]) => html`<${FeatureRow} name=${name} feature=${feature} />`)}
        </div>
      </section>
    `
  }

  window.PdcaPipeline = PdcaPipeline
})()
