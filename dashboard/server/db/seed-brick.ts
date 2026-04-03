// dashboard/server/db/seed-brick.ts — 내장 블록 타입 10종 + PDCA 팀 3개 + 프리셋 4개 시딩
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { brickBlockTypes, brickTeams, brickPresets } from './schema/brick.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

// ── PDCA 팀 3개 (§9.3) ──
const PDCA_TEAMS = [
  {
    name: 'pm-team',
    displayName: '기획팀',
    adapter: 'claude_agent_teams',
    adapterConfig: { session: 'sdk-pm', role: 'PM_LEADER' },
    allowedTools: ['Read', 'Glob', 'Grep', 'Think', 'WebSearch', 'WebFetch'],
    maxDepth: 1,
    status: 'idle' as const,
  },
  {
    name: 'cto-team',
    displayName: '개발팀',
    adapter: 'claude_agent_teams',
    adapterConfig: { session: 'sdk-cto', role: 'CTO_LEADER' },
    members: [
      { name: 'cto-leader', role: 'leader', model: 'opus' },
      { name: 'frontend-dev', role: 'developer', model: 'opus' },
      { name: 'backend-dev', role: 'developer', model: 'opus' },
    ],
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'Agent', 'Think'],
    maxDepth: 2,
    status: 'idle' as const,
  },
  {
    name: 'coo-team',
    displayName: '운영팀',
    adapter: 'claude_agent_teams',
    adapterConfig: { session: 'mozzi', role: 'COO' },
    allowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Think'],
    maxDepth: 1,
    status: 'idle' as const,
  },
];

// ── PDCA 프리셋 4개 ──
function loadPresetYaml(filename: string): string {
  try {
    const bkitRoot = join(process.cwd(), '.bkit', 'presets');
    return readFileSync(join(bkitRoot, filename), 'utf-8');
  } catch {
    return '';
  }
}

const PDCA_PRESETS = [
  { name: 't-pdca-l0', displayName: 'PDCA L0 응급', labels: { level: 'l0', type: 'emergency', phase: 'pdca' }, isCore: true },
  { name: 't-pdca-l1', displayName: 'PDCA L1 경량', labels: { level: 'l1', type: 'lightweight', phase: 'pdca' }, isCore: true },
  { name: 't-pdca-l2', displayName: 'PDCA L2 표준', labels: { level: 'l2', type: 'standard', phase: 'pdca' }, isCore: true },
  { name: 't-pdca-l3', displayName: 'PDCA L3 풀', labels: { level: 'l3', type: 'full', phase: 'pdca' }, isCore: true },
];

export function seedBrickBlockTypes(db: BetterSQLite3Database) {
  for (const blockType of CORE_BLOCK_TYPES) {
    db.insert(brickBlockTypes).values(blockType).onConflictDoNothing().run();
  }
  console.log('[seed-brick] 내장 블록 타입 10종 시딩 완료');
}

export function seedPdcaTeams(db: BetterSQLite3Database) {
  for (const team of PDCA_TEAMS) {
    db.insert(brickTeams).values(team).onConflictDoNothing().run();
  }
  console.log('[seed-brick] PDCA 팀 3개 시딩 완료');
}

export function seedPdcaPresets(db: BetterSQLite3Database) {
  for (const preset of PDCA_PRESETS) {
    const yaml = loadPresetYaml(`${preset.name}.yaml`);
    db.insert(brickPresets).values({
      name: preset.name,
      displayName: preset.displayName,
      yaml: yaml || `kind: Preset\nname: ${preset.name}`,
      isCore: preset.isCore,
      labels: preset.labels,
    }).onConflictDoNothing().run();
  }
  console.log('[seed-brick] PDCA 프리셋 4개 시딩 완료');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seedAll(db: BetterSQLite3Database<any>) {
  seedBrickBlockTypes(db);
  seedPdcaTeams(db);
  seedPdcaPresets(db);
}
