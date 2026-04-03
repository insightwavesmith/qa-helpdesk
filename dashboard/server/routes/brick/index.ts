// dashboard/server/routes/brick/index.ts — 모든 Brick 라우트 등록
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import { registerBlockTypeRoutes } from './block-types.js';
import { registerTeamRoutes } from './teams.js';
import { registerLinkRoutes } from './links.js';
import { registerPresetRoutes } from './presets.js';
import { registerExecutionRoutes } from './executions.js';
import { registerWorkflowRoutes } from './workflows.js';
import { registerGateRoutes } from './gates.js';
import { registerLearningRoutes } from './learning.js';
import { registerSystemRoutes } from './system.js';
import { registerReviewRoutes } from './review.js';
import { registerNotifyRoutes } from './notify.js';
import { registerApprovalRoutes } from './approvals.js';

export function registerBrickRoutes(app: Application, db: BetterSQLite3Database) {
  registerBlockTypeRoutes(app, db);
  registerTeamRoutes(app, db);
  registerLinkRoutes(app, db);
  registerPresetRoutes(app, db);
  registerExecutionRoutes(app, db);
  registerWorkflowRoutes(app, db);
  registerGateRoutes(app, db);
  registerLearningRoutes(app, db);
  registerSystemRoutes(app, db);
  registerReviewRoutes(app, db);
  registerNotifyRoutes(app, db);
  registerApprovalRoutes(app, db);
}
