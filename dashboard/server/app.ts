import express, { type Application } from 'express';
import cors from 'cors';
import { db } from './db/index.js';
import { registerTicketRoutes } from './routes/tickets.js';
import { registerChainRoutes } from './routes/chains.js';
import { registerCostRoutes } from './routes/costs.js';
import { registerBudgetRoutes } from './routes/budgets.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerPdcaRoutes } from './routes/pdca.js';

const app: Application = express();

app.use(cors());
app.use(express.json());

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

export default app;
