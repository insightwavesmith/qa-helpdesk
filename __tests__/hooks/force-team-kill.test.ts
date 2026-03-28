// __tests__/hooks/force-team-kill.test.ts — force-team-kill.sh 테스트 (설계서 6-3)
// TDD Red: tmux 미사용 환경에서 레지스트리/config JSON 상태 검증
//
// INC-3: kill 후 레지스트리에 terminated + force_kill 기록
// E-4: pane_index=0 → [BLOCK] 출력, kill 안 함 (Red)
// E-6: isActive=false + pane 존재 → tmux kill-pane 시도

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

describe('force-team-kill.sh (설계서 6-3)', () => {
  let env: ReturnType<typeof createTestEnv>;
  let hookPath: string;
  let tmpHome: string;

  beforeEach(() => {
    env = createTestEnv();
    hookPath = prepareHookScript(ORIGINAL_SCRIPT, env.tmpDir, env.hooksDir);
    tmpHome = join(env.tmpDir, 'home');
  });

  afterEach(() => cleanupTestEnv(env.tmpDir));

  /**
   * 임시 teams 디렉토리에 config.json 생성.
   * HOME 오버라이드로 force-team-kill.sh가 이 config을 읽게 함.
   */
  function setupConfig(config: Record<string, unknown>): void {
    const teamName = (config as { name?: string }).name ?? 'CTO';
    const teamsDir = join(tmpHome, '.claude', 'teams', teamName);
    mkdirSync(teamsDir, { recursive: true });
    writeFileSync(join(teamsDir, 'config.json'), JSON.stringify(config));
  }

  it('INC-3: kill 후 레지스트리에 terminated + force_kill 기록', () => {
    // Config: backend-dev + qa-engineer (team-lead 제외는 스크립트가 처리)
    const configFixture = loadFixture<Record<string, unknown>>('team_config_sample.json');
    setupConfig(configFixture);

    // Registry: 매칭되는 멤버들 active 상태
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

    // 레지스트리 검증: 모든 멤버 terminated + force_kill
    const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
    const updated = JSON.parse(readFileSync(registryPath, 'utf-8'));

    expect(updated.members['backend-dev'].state).toBe('terminated');
    expect(updated.members['backend-dev'].terminatedBy).toBe('force_kill');
    expect(updated.members['backend-dev'].terminatedAt).not.toBeNull();

    expect(updated.members['qa-engineer'].state).toBe('terminated');
    expect(updated.members['qa-engineer'].terminatedBy).toBe('force_kill');
  });

  it('E-4: pane_index=0 → [BLOCK] 출력, kill 금지 (Red — tmux 미사용)', () => {
    // Config: 팀원의 paneId가 %0 (리더 pane과 동일)
    setupConfig({
      name: 'CTO',
      members: [
        { name: 'team-lead', isActive: true, tmuxPaneId: '%0' },
        { name: 'backend-dev', isActive: true, tmuxPaneId: '%0', model: 'opus' },
      ],
    });

    // Registry 생성
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

    // tmux 없는 환경: PANE_INDEX="" → [BLOCK] 미출력 → 이 assert 실패 (Red)
    expect(result.stdout).toContain('[BLOCK]');
  });

  it('E-6: isActive=false + pane 존재 → tmux kill-pane 시도 + 레지스트리 갱신', () => {
    // Config: backend-dev isActive=false이지만 paneId 있음
    setupConfig({
      name: 'CTO',
      members: [
        { name: 'team-lead', isActive: true, tmuxPaneId: '%0' },
        { name: 'backend-dev', isActive: false, tmuxPaneId: '%10', model: 'opus' },
      ],
    });

    // Registry: active 상태 (config과 불일치 — 비정상 상황)
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

    // isActive 이미 false → Step 2 스킵 메시지
    expect(result.stdout).toContain('이미 isActive=false');

    // Step 1 (tmux kill) 시도됨 — tmux 없으면 [SKIP]
    expect(result.stdout).toMatch(/\[OK\]|\[SKIP\]/);

    // 레지스트리 갱신: terminated + force_kill
    const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
    const updated = JSON.parse(readFileSync(registryPath, 'utf-8'));
    expect(updated.members['backend-dev'].state).toBe('terminated');
    expect(updated.members['backend-dev'].terminatedBy).toBe('force_kill');
  });
});
