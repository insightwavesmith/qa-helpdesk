import { createServer } from 'http';
import app from './app.js';
import { setupWebSocket } from './realtime/ws.js';
import { AgentPoller } from './services/agent-poller.js';
import { db } from './db/index.js';
import { seed } from './db/seed.js';
import { syncProjectYaml } from './brick/project/sync.js';
import { seedInvariants } from './db/seed-invariants.js';

// DB seed (기본 데이터 삽입, 중복 무시)
seed();
// 프로젝트 YAML 동기화 + 불변식 시드
syncProjectYaml();
seedInvariants('bscamp');

const PORT = Number(process.env.PORT) || 3200;
const server = createServer(app);

// WebSocket 설정
setupWebSocket(server);

// AgentPoller 시작 (10초마다 tmux 상태 확인)
const poller = new AgentPoller(db);
poller.start(10000);

server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT} 에서 실행 중`);
  console.log(`[server] WebSocket 준비 완료`);
});

// graceful shutdown
process.on('SIGTERM', () => {
  poller.stop();
  server.close();
});
