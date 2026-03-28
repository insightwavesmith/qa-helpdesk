// 팀 현황 컴포넌트
// Props: { teams: { pm, cto } }
;(function () {
  const { html } = window

  function getStatusIcon(status) {
    const s = (status || '').toLowerCase()
    if (s === 'active' || s === 'working') return { dot: 'bg-green-500 pulse-green', dotEnd: 'bg-green-400', label: null }
    if (s === 'idle') return { dot: '', dotEnd: '', label: html`<div class="text-xs mt-0.5" style="color:#B45309;">유휴 상태</div>`, dotStyle: 'background:#F59E0B;' }
    if (s === 'terminated' || s === 'stopped') return { dot: 'bg-gray-800', dotEnd: 'bg-gray-800', label: html`<div class="text-xs text-gray-400 mt-0.5">종료됨</div>`, opacity: true }
    return { dot: 'bg-green-500 pulse-green', dotEnd: 'bg-green-400', label: null }
  }

  function ModelBadge({ model }) {
    const m = (model || '').toLowerCase()
    if (m.includes('opus')) return html`<span class="badge badge-opus">Opus 4.6</span>`
    if (m.includes('sonnet')) return html`<span class="badge badge-sonnet">Sonnet 4.6</span>`
    return html`<span class="badge" style="background:#F3F4F6; color:#6B7280;">${model || '?'}</span>`
  }

  function MemberRow({ name, member, isLeader, teamType }) {
    const info = getStatusIcon(member.status)
    const bgStyle = isLeader
      ? (teamType === 'pm' ? 'background:#FFF1F2;' : 'background:#F5F3FF;')
      : ''
    const opacityCls = info.opacity ? 'opacity-50' : ''

    return html`
      <div class="flex items-center gap-3 py-2 px-3 rounded-md ${!isLeader ? 'hover:bg-gray-50' : ''} ${opacityCls}" style="${bgStyle}">
        <div class="w-2 h-2 rounded-full flex-shrink-0 ${info.dot}" style="${info.dotStyle || ''}"></div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-800" style="font-weight:600;">${name}</span>
            <${ModelBadge} model=${member.model} />
          </div>
          ${info.label || (member.task
            ? html`<div class="text-xs text-gray-500 mt-0.5 truncate">${member.task}</div>`
            : member.description
              ? html`<div class="text-xs text-gray-500 mt-0.5 truncate">${member.description}</div>`
              : null
          )}
        </div>
        <div class="w-2 h-2 rounded-full flex-shrink-0 ${info.dotEnd}" style="${info.dotStyle || ''}"></div>
      </div>
    `
  }

  function TeamSection({ teamName, badgeClass, team, teamType }) {
    const members = team?.members || {}
    const entries = Object.entries(members)
    const count = entries.length

    return html`
      <div class="${teamType === 'pm' ? 'mb-4' : ''}">
        <div class="flex items-center gap-2 mb-2">
          <span class="badge ${badgeClass}">${teamName}</span>
          <span class="text-xs text-gray-400">${count}명</span>
        </div>
        <div class="space-y-1.5 pl-1">
          ${entries.length > 0
            ? entries.map(([name, member], i) => html`
                <${MemberRow} name=${name} member=${member} isLeader=${i === 0 && member.role === 'leader'} teamType=${teamType} />
              `)
            : html`<p class="text-xs text-gray-400 py-2 px-3">팀원 없음</p>`
          }
        </div>
      </div>
    `
  }

  function TeamStatus({ teams }) {
    if (!teams || (!teams.pm && !teams.cto)) {
      return html`
        <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
            <h2 class="text-sm text-gray-800" style="font-weight:700;">팀 현황</h2>
          </div>
          <p class="text-xs text-gray-400 text-center py-6">팀 미생성</p>
        </section>
      `
    }

    const pmCount = teams.pm ? Object.keys(teams.pm.members || {}).length : 0
    const ctoCount = teams.cto ? Object.keys(teams.cto.members || {}).length : 0
    const total = pmCount + ctoCount

    return html`
      <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
          <h2 class="text-sm text-gray-800" style="font-weight:700;">팀 현황</h2>
          <span class="ml-auto text-xs text-gray-400">총 ${total}명</span>
        </div>
        ${teams.pm ? html`<${TeamSection} teamName="PM팀" badgeClass="badge-pm" team=${teams.pm} teamType="pm" />` : null}
        ${teams.pm && teams.cto ? html`<div class="border-t border-gray-100 mb-4"></div>` : null}
        ${teams.cto ? html`<${TeamSection} teamName="CTO팀" badgeClass="badge-cto" team=${teams.cto} teamType="cto" />` : null}
      </section>
    `
  }

  window.TeamStatus = TeamStatus
})()
