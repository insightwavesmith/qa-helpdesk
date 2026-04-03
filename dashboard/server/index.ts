import { createServer } from 'http';
import app from './app.js';
import { setupWebSocket } from './realtime/ws.js';
import { AgentPoller } from './services/agent-poller.js';
import { db } from './db/index.js';
import { seed } from './db/seed.js';
import { syncProjectYaml } from './brick/project/sync.js';
import { seedInvariants } from './db/seed-invariants.js';
import { ProcessManager } from './brick/engine/process-manager.js';
import { registerEngineStatusRoutes } from './routes/brick/engine-status.js';

// DB seed (기본 데이터 삽입, 중복 무시)
seed();
// 프로젝트 YAML 동기화 + 불변식 시드
syncProjectYaml();
seedInvariants('bscamp');

const PORT = Number(process.env.PORT) || 3200;
const processManager = new ProcessManager();

async function bootstrap() {
  // 1. Python 엔진 기동
  await processManager.startPython();

  // 2. 엔진 상태 API 등록
  registerEngineStatusRoutes(app, processManager);

  // 3. Express 서버 시작
  const server = createServer(app);
  setupWebSocket(server);

  // AgentPoller 시작 (10초마다 tmux 상태 확인)
  const poller = new AgentPoller(db);
  poller.start(10000);

  server.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT} 에서 실행 중`);
    console.log(`[server] WebSocket 준비 완료`);
  });

  // 4. 종료 시그널 처리
  const shutdown = async () => {
    console.log('[server] 종료 시작...');
    poller.stop();
    await processManager.stop();
    server.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap();
