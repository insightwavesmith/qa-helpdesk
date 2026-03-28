/**
 * bun:sqlite 모킹 — vitest(Node)에서 사용
 * 실제 SQLite 기능은 없으나 import 에러 방지.
 */
export class Database {
  constructor(_path: string, _options?: any) {}
  query(_sql: string) {
    return {
      all: (..._args: any[]) => [],
      get: (..._args: any[]) => null,
    }
  }
  run(_sql: string, ..._args: any[]) {}
  prepare(_sql: string) {
    return {
      all: (..._args: any[]) => [],
      get: (..._args: any[]) => null,
    }
  }
  close() {}
}
