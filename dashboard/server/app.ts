import express, { type Application } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { db } from './db/index.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerChainRoutes } from './routes/chains.js';
import { registerCostRoutes } from './routes/costs.js';
import { registerBudgetRoutes } from './routes/budgets.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerPdcaRoutes } from './routes/pdca.js';
import { registerHookRoutes } from './routes/hooks.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerRoutineRoutes } from './routes/routines.js';
import { registerBrickRoutes } from './routes/brick/index.js';
import { requireBrickAuth, registerBrickAuthRoutes } from './middleware/brick-auth.js';

const app: Application = express();

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(cookieParser());

// Auth 라우트 등록 (미들웨어 전에 — /auth/* 자체는 인증 불필요)
registerBrickAuthRoutes(app);

// Brick API 경로에 인증 적용
app.use('/api/brick', requireBrickAuth);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  });
});

// API routes
registerTicketRoutes(app, db);
registerChainRoutes(app, db);
registerCostRoutes(app, db);
registerBudgetRoutes(app, db);
registerDashboardRoutes(app, db);
registerNotificationRoutes(app, db);
registerPdcaRoutes(app, db);
registerHookRoutes(app, db);
registerAgentRoutes(app, db);
registerRoutineRoutes(app, db);
registerBrickRoutes(app, db);

export default app;
