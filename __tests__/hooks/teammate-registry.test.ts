// __tests__/hooks/teammate-registry.test.ts — auto-shutdown.sh 함수 단위 테스트 (설계서 6-4)
// TDD Red: 구문 오류 없이 실패 가능한 테스트
//
// UT-3: TASK 완료 후 state active 유지
// set_member_state: active → shutdown_pending 전이
// set_member_terminated_by: force_kill 기록
// build_registry_from_config: config → registry 변환 (team-lead 제외)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv,
  cleanupTestEnv,
  createTempRegistry,
  runBashFunction,
  loadFixture,
} from './helpers';

const ORIGINAL_SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/auto-shutdown.sh';

/**
 * auto-shutdown.sh에서 함수 정의만 추출.
 * is-teammate guard + Stage 0~3 메인 로직 제거 → source 시 함수만 로드.
 */
function extractFunctionsOnly(tmpDir: string, hooksDir: string): string {
  let content = readFileSync(ORIGINAL_SCRIPT, 'utf-8');
  // PROJECT_DIR 패치
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${tmpDir}"`);
  // is-teammate guard 제거
  content = content.replace(/^source.*is-teammate\.sh.*$/m, '# [test: guard removed]');
  content = content.replace(/^.*IS_TEAMMATE.*exit 0.*$/m, '# [test: guard removed]');
  // Stage 0 이후 메인 로직 전부 제거
  const idx = content.indexOf('# --- Stage 0:');
  if (idx > -1) content = content.substring(0, idx);

  const dest = join(hooksDir, 'auto-shutdown-funcs.sh');
  writeFileSync(dest, content, { mode: 0o755 });
  return dest;
}

describe('teammate-registry 함수 단위 테스트 (설계서 6-4)', () => {
  let env: ReturnType<typeof createTestEnv>;
  let funcsPath: string;

  beforeEach(() => {
    env = createTestEnv();
    funcsPath = extractFunctionsOnly(env.tmpDir, env.hooksDir);
  });

  afterEach(() => cleanupTestEnv(env.tmpDir));

  // UT-3: TASK 완료(tasksCompleted 증가)해도 state는 active 유지
  it('UT-3: tasksCompleted 증가 후 state는 active 유지 (terminated 아님)', () => {
    const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
    createTempRegistry(env.tmpDir, fixture);

    const result = runBashFunction(funcsPath, [
      // tasksCompleted만 증가 — set_member_state 호출 없음
      'jq \'.members["backend-dev"].tasksCompleted += 1\' "$REGISTRY" > "$REGISTRY.tmp" && mv "$REGISTRY.tmp" "$REGISTRY"',
      'jq -r \'.members["backend-dev"].state\' "$REGISTRY"',
    ].join('\n'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('active');
  });

  // set_member_state: active → shutdown_pending 상태 전이
  it('set_member_state: active → shutdown_pending 전이', () => {
    const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
    createTempRegistry(env.tmpDir, fixture);

    const result = runBashFunction(funcsPath, [
      'set_member_state "backend-dev" "shutdown_pending"',
      'jq -r \'.members["backend-dev"].state\' "$REGISTRY"',
    ].join('\n'));

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('shutdown_pending');
  });

  // set_member_terminated_by: force_kill 기록 (terminatedBy + terminatedAt 필드)
  it('set_member_terminated_by: force_kill 기록 (terminatedBy + terminatedAt)', () => {
    const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
    createTempRegistry(env.tmpDir, fixture);

    const result = runBashFunction(funcsPath, [
      'set_member_terminated_by "backend-dev" "force_kill"',
      'jq -r \'.members["backend-dev"].terminatedBy\' "$REGISTRY"',
      'jq -r \'.members["backend-dev"].terminatedAt\' "$REGISTRY"',
    ].join('\n'));

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines[0]).toBe('force_kill');
    // terminatedAt은 null이 아닌 ISO 날짜여야 함
    expect(lines[1]).not.toBe('null');
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // build_registry_from_config: config.json → registry 변환, team-lead 제외
  it('build_registry_from_config: team-lead 제외, 나머지 멤버만 registry 생성', () => {
    const configFixture = loadFixture<Record<string, unknown>>('team_config_sample.json');

    // HOME을 임시 디렉토리로 오버라이드 → ~/.claude/teams/에서 config 읽기
    const tmpHome = join(env.tmpDir, 'home');
    const teamsDir = join(tmpHome, '.claude', 'teams', 'test-team');
    mkdirSync(teamsDir, { recursive: true });
    writeFileSync(join(teamsDir, 'config.json'), JSON.stringify(configFixture));

    const result = runBashFunction(funcsPath, [
      'build_registry_from_config',
      'jq -r \'.members | keys[]\' "$REGISTRY"',
    ].join('\n'), { HOME: tmpHome });

    expect(result.exitCode).toBe(0);
    // team-lead는 제외되어야 함
    expect(result.stdout).not.toContain('team-lead');
    // config에 있는 backend-dev, qa-engineer는 포함
    expect(result.stdout).toContain('backend-dev');
    expect(result.stdout).toContain('qa-engineer');
  });
});
