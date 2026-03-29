/**
 * vitest 셋업 파일 — Bun 전역 모킹
 * server.ts가 import될 때 Bun.serve() + import.meta.dir 에러 방지
 */

// import.meta.dir (Bun 전용) 대체: BSCAMP_ROOT 환경변수로 경로 제공
if (!process.env.BSCAMP_ROOT) {
  // tools/agent-dashboard 기준으로 2단계 상위 = 프로젝트 루트
  const { resolve, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const __dirname = dirname(fileURLToPath(import.meta.url))
  // __mocks__ → agent-dashboard → tools → bscamp (3단계 상위)
  process.env.BSCAMP_ROOT = resolve(__dirname, '..', '..', '..')
}

if (typeof (globalThis as any).Bun === 'undefined') {
  ;(globalThis as any).Bun = {
    serve: (_opts: any) => ({ port: 3847, stop: () => {}, ref: () => {}, unref: () => {} }),
  }
}
