import { watch, existsSync, type FSWatcher } from 'fs'

export interface FileWatcherOptions {
  debounce?: number // ms, 기본 300
}

/**
 * 지정 경로들을 감시하고, 변경 시 콜백을 호출한다.
 * 없는 경로는 건너뛴다 (에러 아님).
 * debounce로 빈번한 이벤트를 묶는다.
 */
export function createFileWatcher(
  paths: string[],
  onChange: (event: string, filename: string) => void,
  options?: FileWatcherOptions
): { close: () => void } | null {
  const debounceMs = options?.debounce ?? 300
  const watchers: FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingEvent: { event: string; filename: string } | null = null

  const flush = () => {
    if (pendingEvent) {
      onChange(pendingEvent.event, pendingEvent.filename)
      pendingEvent = null
    }
  }

  for (const p of paths) {
    if (!existsSync(p)) {
      console.warn(`[file-watcher] 경로 없음, 건너뜀: ${p}`)
      continue
    }

    try {
      const w = watch(p, { recursive: false }, (event, filename) => {
        pendingEvent = { event, filename: filename ?? p }
        if (timer) clearTimeout(timer)
        timer = setTimeout(flush, debounceMs)
      })
      watchers.push(w)
    } catch (err) {
      console.error(`[file-watcher] 감시 실패: ${p}`, err)
    }
  }

  if (watchers.length === 0) return null

  return {
    close: () => {
      if (timer) clearTimeout(timer)
      for (const w of watchers) {
        w.close()
      }
    },
  }
}
