import { createServer } from 'http';
import app from './app.js';
import { setupWebSocket } from './realtime/ws.js';
import { seed } from './db/seed.js';

// DB seed (기본 데이터 삽입, 중복 무시)
seed();

const PORT = Number(process.env.PORT) || 3201;
const server = createServer(app);

// WebSocket 설정
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT} 에서 실행 중`);
  console.log(`[server] WebSocket 준비 완료`);
});
