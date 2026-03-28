// TASK 보드 컴포넌트 (3열 칸반)
// Props: { tasks: TaskFile[] }
;(function () {
  const { html } = window

  function getTeamBadge(task) {
    const team = (task.team || '').toLowerCase()
    if (team === 'pm') return html`<span class="badge badge-pm">PM</span>`
    if (team === 'cto') return html`<span class="badge badge-cto">CTO</span>`
    return html`<span class="badge" style="background:#F3F4F6; color:#6B7280;">${task.team || '-'}</span>`
  }

  function getProgress(task) {
    if (task.progress != null) return task.progress
    const total = (task.totalChecks || 0)
    const done = (task.completedChecks || 0)
    if (total === 0) return 0
    return Math.round((done / total) * 100)
  }

  function TaskCard({ task, column }) {
    const progress = getProgress(task)
    const name = task.name || task.file || '-'

    let cardBg, borderColor, barColor, barClass, progressColor, progressLabel
    if (column === 'completed') {
      cardBg = '#F0FDF4'
      borderColor = '#BBF7D0'
      barColor = '#22C55E'
      barClass = 'bg-green-500'
      progressColor = 'text-green-600'
      progressLabel = '완료 ✓'
    } else if (column === 'in-progress') {
      cardBg = '#FFFBEB'
      borderColor = '#FDE68A'
      barColor = '#F59E0B'
      barClass = 'pulse-orange'
      progressColor = ''
    } else {
      cardBg = '#F9FAFB'
      borderColor = '#E5E7EB'
      barColor = progress === 100 ? '#22C55E' : '#F75D5D'
      barClass = ''
      progressColor = progress === 100 ? 'text-green-600' : ''
    }

    return html`
      <div class="p-3 rounded-lg border ${column === 'completed' ? 'opacity-80' : ''}" style="background:${cardBg}; border-color:${borderColor};">
        <div class="text-xs text-gray-800 mb-1 truncate" style="font-weight:600;">${name}</div>
        <div class="flex items-center gap-1 mb-2">
          ${getTeamBadge(task)}
        </div>
        <div class="w-full rounded-full h-1.5" style="background:${column === 'completed' ? '#BBF7D0' : '#E5E7EB'};">
          <div class="h-1.5 rounded-full ${barClass}" style="background:${barColor}; width:${progress}%;"></div>
        </div>
        <div class="text-xs text-right mt-0.5 ${progressColor}" style="${!progressColor && column === 'in-progress' ? 'color:#B45309;' : !progressColor ? 'color:#F75D5D;' : ''}">
          ${progressLabel || progress + '%'}
        </div>
      </div>
    `
  }

  function Column({ title, dotClass, dotStyle, titleStyle, tasks, column }) {
    return html`
      <div>
        <div class="flex items-center gap-1.5 mb-2">
          <div class="w-2 h-2 rounded-full ${dotClass}" style="${dotStyle || ''}"></div>
          <span class="text-xs" style="font-weight:600; ${titleStyle || 'color:#4B5563;'}">${title}</span>
          <span class="text-xs text-gray-400 ml-auto">${tasks.length}</span>
        </div>
        <div class="space-y-2">
          ${tasks.length > 0
            ? tasks.map(t => html`<${TaskCard} task=${t} column=${column} />`)
            : html`<p class="text-xs text-gray-400 text-center py-4">없음</p>`
          }
        </div>
      </div>
    `
  }

  function TaskBoard({ tasks }) {
    const all = tasks || []

    if (all.length === 0) {
      return html`
        <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
            <h2 class="text-sm text-gray-800" style="font-weight:700;">TASK 보드</h2>
          </div>
          <p class="text-xs text-gray-400 text-center py-6">진행 중인 TASK 없음</p>
        </section>
      `
    }

    const pending = all.filter(t => t.status === 'pending' || t.status === 'waiting')
    const inProgress = all.filter(t => t.status === 'in-progress' || t.status === 'implementing')
    const completed = all.filter(t => t.status === 'completed' || t.status === 'done')

    return html`
      <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-1 h-4 rounded-full" style="background:#F75D5D;"></div>
          <h2 class="text-sm text-gray-800" style="font-weight:700;">TASK 보드</h2>
          <span class="ml-auto text-xs text-gray-400">총 ${all.length}개</span>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <${Column} title="대기" dotClass="bg-gray-400" titleStyle="color:#4B5563;" tasks=${pending} column="pending" />
          <${Column} title="진행중" dotClass="" dotStyle="background:#F59E0B;" titleStyle="color:#B45309;" tasks=${inProgress} column="in-progress" />
          <${Column} title="완료" dotClass="bg-green-500" titleStyle="color:#15803D;" tasks=${completed} column="completed" />
        </div>
      </section>
    `
  }

  window.TaskBoard = TaskBoard
})()
