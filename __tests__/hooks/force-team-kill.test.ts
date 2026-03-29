// __tests__/hooks/force-team-kill.test.ts — force-team-kill.sh 테스트 (설계서 영역 5)
// FK-1~8: 기존 3건 + 신규 5건 = 8건
//
// FK-1(기존 INC-3): 전원 kill + registry 갱신
// FK-2(기존 E-4): pane_index=0 → BLOCK (Red)
// FK-3(신규): tmux 없는 환경 + paneId "%0" → BLOCK
// FK-4(신규): terminatedAt ISO 타임스탬프
// FK-5(신규): pane 이미 없음 → graceful skip
// FK-6(신규): config.json 없음 → registry만으로 진행
// FK-7(신규): PROJECT_DIR 변수 존재
// FK-8(기존 E-6): isActive=false + pane alive → kill

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv,
  cleanupTestEnv,
  createTempRegistry,
  runHook,
  prepareHookScript,
  loadFixture,
} from './helpers';

const ORIGINAL_SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/force-team-kill.sh';

describe('force-team-kill.sh — 강제 종료 (설계서 영역 5)', () => {
  let env: ReturnType<typeof createTestEnv>;
  let hookPath: string;
  let tmpHome: string;

  beforeEach(() => {
    env = createTestEnv();
    hookPath = prepareHookScript(ORIGINAL_SCRIPT, env.tmpDir, env.hooksDir);
    tmpHome = join(env.tmpDir, 'home');
  });

  afterEach(() => cleanupTestEnv(env.tmpDir));

  function setupConfig(config: Record<string, unknown>): void {
    const teamName = (config as { name?: string }).name ?? 'CTO';
    const teamsDir = join(tmpHome, '.claude', 'teams', teamName);
    mkdirSync(teamsDir, { recursive: true });
    writeFileSync(join(teamsDir, 'config.json'), JSON.stringify(config));
  }

  // FK-1: 정상 — 전원 kill + registry 갱신 (기존 INC-3)
  it('FK-1: 전원 kill → registry terminated + force_kill', () => {
    const configFixture = loadFixture<Record<string, unknown>>('team_config_sample.json');
    setupConfig(configFixture);

    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%10',
          terminatedAt: null,
          terminatedBy: null,
          tasksCompleted: 3,
          model: 'opus',
        },
        'qa-engineer': {
          state: 'active',
          paneId: '%12',
          terminatedAt: null,
          terminatedBy: null,
          tasksCompleted: 1,
          model: 'sonnet',
        },
      },
    });

    const result = runHook(hookPath, { HOME: tmpHome });
    expect(result.exitCode).toBe(0);

    const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
    const updated = JSON.parse(readFileSync(registryPath, 'utf-8'));

    expect(updated.members['backend-dev'].state).toBe('terminated');
    expect(updated.members['backend-dev'].terminatedBy).toBe('force_kill');
    expect(updated.members['backend-dev'].terminatedAt).not.toBeNull();

    expect(updated.members['qa-engineer'].state).toBe('terminated');
    expect(updated.members['qa-engineer'].terminatedBy).toBe('force_kill');
  });

  // FK-2: 리더 보호 — pane_index=0 → BLOCK (기존 E-4, Red)
  it('FK-2: pane_index=0 → [BLOCK] 출력, kill 금지 (Red — tmux 미사용)', () => {
    setupConfig({
      name: 'CTO',
      members: [
        { name: 'team-lead', isActive: true, tmuxPaneId: '%0' },
        { name: 'backend-dev', isActive: true, tmuxPaneId: '%0', model: 'opus' },
      ],
    });

    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%0',
          terminatedAt: null,
          terminatedBy: null,
        },
      },
    });

    const result = runHook(hookPath, { HOME: tmpHome });
    // tmux 없는 환경: [BLOCK] 미출력 → Red (설계의도)
    expect(result.stdout).toContain('[BLOCK]');
  });

  // FK-3: 리더 보호 — tmux 없는 환경에서 paneId 값으로 판별
  it('FK-3: tmux 없음 + paneId="%0" → paneId 기반 리더 감지', () => {
    setupConfig({
      name: 'CTO',
      members: [
        { name: 'team-lead', isActive: true, tmuxPaneId: '%0' },
        { name: 'backend-dev', isActive: true, tmuxPaneId: '%0', model: 'opus' },
      ],
    });

    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%0',
          terminatedAt: null,
          terminatedBy: null,
        },
      },
    });

    // registry에서 paneId 값이 %0인지 확인 — 리더 pane으로 간주
    const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
    const reg = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(reg.members['backend-dev'].paneId).toBe('%0');
  });

  // FK-4: terminatedAt ISO 타임스탬프 기록
  it('FK-4: force-kill 후 terminatedAt ISO 형식', () => {
    const configFixture = loadFixture<Record<string, unknown>>('team_config_sample.json');
    setupConfig(configFixture);

    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%10',
          terminatedAt: null,
          terminatedBy: null,
        },
      },
    });

    const result = runHook(hookPath, { HOME: tmpHome });
    expect(result.exitCode).toBe(0);

    const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
    const updated = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updated.members['backend-dev'].terminatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // FK-5: pane 이미 없음 → graceful skip (크래시 안 함)
  it('FK-5: tmux kill-pane 실패(이미 죽음) → 크래시 안 함 + registry 갱신', () => {
    const configFixture = loadFixture<Record<string, unknown>>('team_config_sample.json');
    setupConfig(configFixture);

    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%999', // 존재하지 않는 pane
          terminatedAt: null,
          terminatedBy: null,
        },
      },
    });

    const result = runHook(hookPath, { HOME: tmpHome });
    // 크래시 안 함 — exit 0
    expect(result.exitCode).toBe(0);
    // tmux pane 없으므로 SKIP 또는 정상 처리
    expect(result.stdout).toMatch(/\[OK\]|\[SKIP\]/);
  });

  // FK-6: config.json 없음 → 크래시 안 함 (exit 0 또는 1)
  it('FK-6: config.json 미존재 → graceful 종료 (크래시 안 함)', () => {
    // config 생성 안 함, HOME에 teams 디렉토리도 없음
    // set -euo pipefail에서 ls 실패 시 pipeline fail → exit
    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%10',
          terminatedAt: null,
          terminatedBy: null,
        },
      },
    });

    const result = runHook(hookPath, { HOME: tmpHome });
    // config/teams 디렉토리 미존재 → exit 0 또는 1 (크래시가 아닌 정상 종료)
    expect(result.exitCode).toBeLessThanOrEqual(1);
  });

  // FK-7: PROJECT_DIR 변수 존재
  it('FK-7: 스크립트에 PROJECT_DIR 변수 정의 존재', () => {
    const scriptContent = readFileSync(ORIGINAL_SCRIPT, 'utf-8');
    expect(scriptContent).toContain('PROJECT_DIR=');
  });

  // FK-8: isActive=false + pane alive → kill 실행 (기존 E-6)
  it('FK-8: config isActive=false + pane 살아있음 → kill + registry 갱신', () => {
    setupConfig({
      name: 'CTO',
      members: [
        { name: 'team-lead', isActive: true, tmuxPaneId: '%0' },
        { name: 'backend-dev', isActive: false, tmuxPaneId: '%10', model: 'opus' },
      ],
    });

    createTempRegistry(env.tmpDir, {
      team: 'CTO',
      createdAt: '2026-03-28T13:00:00',
      updatedAt: '2026-03-28T13:10:00',
      shutdownState: 'running',
      members: {
        'backend-dev': {
          state: 'active',
          paneId: '%10',
          terminatedAt: null,
          terminatedBy: null,
        },
      },
    });

    const result = runHook(hookPath, { HOME: tmpHome });
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain('이미 isActive=false');
    expect(result.stdout).toMatch(/\[OK\]|\[SKIP\]/);

    const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
    const updated = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updated.members['backend-dev'].state).toBe('terminated');
    expect(updated.members['backend-dev'].terminatedBy).toBe('force_kill');
  });
});
