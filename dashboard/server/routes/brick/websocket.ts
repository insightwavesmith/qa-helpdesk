// dashboard/server/routes/brick/websocket.ts — Brick WebSocket 핸들러
import { WebSocketServer } from 'ws';
import type { Server } from 'http';

const clients = new Set<any>();

export function createBrickWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/brick/ws' });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('[brick-ws] 클라이언트 연결');

    // 초기 동기화: 현재 상태 스냅샷
    ws.send(JSON.stringify({ type: 'sync.snapshot', data: {} }));

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[brick-ws] 클라이언트 연결 해제');
    });
  });

  return wss;
}

export function broadcast(event: { type: string; data: unknown }) {
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}
