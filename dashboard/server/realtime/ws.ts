import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { eventBus, type BusEvent } from '../event-bus.js';

let wss: WebSocketServer;

export function setupWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    console.log('[ws] 클라이언트 연결');

    ws.on('close', () => {
      console.log('[ws] 클라이언트 해제');
    });

    ws.on('error', (err) => {
      console.error('[ws] 에러:', err.message);
    });
  });

  // 모든 이벤트를 WebSocket 클라이언트에 브로드캐스트
  eventBus.subscribe('*', (event: BusEvent) => {
    broadcast(event);
  });

  console.log('[ws] WebSocket 서버 준비');
  return wss;
}

function broadcast(data: BusEvent): void {
  if (!wss) return;

  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function getWss(): WebSocketServer | undefined {
  return wss;
}
