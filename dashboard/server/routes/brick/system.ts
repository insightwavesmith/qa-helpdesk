// dashboard/server/routes/brick/system.ts — Brick 시스템 불변식 API
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export function registerSystemRoutes(app: Application, _db: BetterSQLite3Database) {
  // GET /api/brick/system/invariants — INV-1~10 상태 (placeholder)
  app.get('/api/brick/system/invariants', (_req, res) => {
    console.log('[brick-system] 불변식 상태 조회');
    const invariants = [
      { id: 'INV-1', name: '블록 타입 존재', status: 'ok', detail: null },
      { id: 'INV-2', name: '팀 할당 유효', status: 'ok', detail: null },
      { id: 'INV-3', name: '실행 상태 정합', status: 'ok', detail: null },
      { id: 'INV-4', name: 'Gate 결과 존재', status: 'ok', detail: null },
      { id: 'INV-5', name: '프리셋 YAML 유효', status: 'ok', detail: null },
      { id: 'INV-6', name: '로그 순서 정합', status: 'ok', detail: null },
      { id: 'INV-7', name: 'DAG 순환 없음', status: 'ok', detail: null },
      { id: 'INV-8', name: '학습 제안 무결', status: 'ok', detail: null },
      { id: 'INV-9', name: '알림 전송 가능', status: 'ok', detail: null },
      { id: 'INV-10', name: '웹소켓 활성', status: 'ok', detail: null },
    ];
    res.json(invariants);
  });
}
