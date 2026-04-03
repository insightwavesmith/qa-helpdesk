// dashboard/server/db/seed-brick.ts — 내장 블록 타입 10종 시딩
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { brickBlockTypes } from './schema/brick.js';

const CORE_BLOCK_TYPES = [
  { name: 'plan', displayName: '계획', icon: '📋', color: '#DBEAFE', category: 'planning', isCore: true, thinkLogRequired: true },
  { name: 'design', displayName: '설계', icon: '📐', color: '#DBEAFE', category: 'planning', isCore: true, thinkLogRequired: true },
  { name: 'implement', displayName: '구현', icon: '🔨', color: '#DCFCE7', category: 'execution', isCore: true, thinkLogRequired: false },
  { name: 'test', displayName: '테스트', icon: '🧪', color: '#DCFCE7', category: 'execution', isCore: true, thinkLogRequired: false },
  { name: 'review', displayName: '리뷰', icon: '👀', color: '#FEF9C3', category: 'verification', isCore: true, thinkLogRequired: false },
  { name: 'deploy', displayName: '배포', icon: '🚀', color: '#DCFCE7', category: 'execution', isCore: true, thinkLogRequired: false },
  { name: 'monitor', displayName: '모니터', icon: '📊', color: '#FEF9C3', category: 'verification', isCore: true, thinkLogRequired: false },
  { name: 'rollback', displayName: '롤백', icon: '⏪', color: '#F3E8FF', category: 'recovery', isCore: true, thinkLogRequired: false },
  { name: 'custom', displayName: '커스텀', icon: '🧩', color: '#F3E8FF', category: 'custom', isCore: false, thinkLogRequired: false },
  { name: 'notify', displayName: '알림', icon: '🔔', color: '#E0F2FE', category: 'notification', isCore: true, thinkLogRequired: false },
];

export function seedBrickBlockTypes(db: BetterSQLite3Database) {
  for (const blockType of CORE_BLOCK_TYPES) {
    db.insert(brickBlockTypes).values(blockType).onConflictDoNothing().run();
  }
  console.log('[seed-brick] 내장 블록 타입 10종 시딩 완료');
}
