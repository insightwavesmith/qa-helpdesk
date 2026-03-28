// __tests__/hooks/helpers.ts — Hook 테스트 공통 헬퍼
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, copyFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { tmpdir } from 'os';

const FIXTURES_DIR = join(__dirname, 'fixtures');

interface HookResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function createTestEnv() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hook-test-'));
  const tasksDir = join(tmpDir, '.claude', 'tasks');
  const runtimeDir = join(tmpDir, '.claude', 'runtime');
  const hooksDir = join(tmpDir, '.claude', 'hooks');
  mkdirSync(tasksDir, { recursive: true });
  mkdirSync(runtimeDir, { recursive: true });
  mkdirSync(hooksDir, { recursive: true });
  return { tmpDir, tasksDir, runtimeDir, hooksDir };
}

export function runHook(scriptPath: string, env: Record<string, string> = {}): HookResult {
  try {
    const stdout = execSync(`bash "${scriptPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

export function cleanupTestEnv(tmpDir: string) {
  rmSync(tmpDir, { recursive: true, force: true });
}

export function prepareHookScript(
  originalPath: string,
  tmpDir: string,
  hooksDir: string
): string {
  const content = readFileSync(originalPath, 'utf-8');
  const patched = content.replace(
    /PROJECT_DIR="[^"]*"/,
    `PROJECT_DIR="${tmpDir}"`
  );
  const destPath = join(hooksDir, basename(originalPath));
  writeFileSync(destPath, patched, { mode: 0o755 });

  // is-teammate.sh도 복사 (source 의존)
  const isTeammateSrc = join(dirname(originalPath), 'is-teammate.sh');
  if (existsSync(isTeammateSrc)) {
    copyFileSync(isTeammateSrc, join(hooksDir, 'is-teammate.sh'));
  }

  return destPath;
}

/**
 * fixtures/ 디렉토리에서 JSON 파일을 로드한다.
 */
export function loadFixture<T = unknown>(name: string): T {
  const filePath = join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
}

/**
 * fixtures/ 디렉토리에서 텍스트 파일(md 등)을 로드한다.
 */
export function loadFixtureText(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8');
}

/**
 * tmpDir/.claude/runtime/teammate-registry.json에 레지스트리를 생성한다.
 */
export function createTempRegistry(tmpDir: string, data: Record<string, unknown>): string {
  const registryPath = join(tmpDir, '.claude', 'runtime', 'teammate-registry.json');
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(data, null, 2));
  return registryPath;
}

/**
 * bash 스크립트를 source 후 특정 함수를 실행하고 결과를 반환한다.
 * 주로 auto-shutdown.sh의 set_member_state 등 유닛 테스트에 사용.
 */
export function runBashFunction(
  scriptPath: string,
  functionCall: string,
  env: Record<string, string> = {}
): HookResult {
  const wrapper = `#!/bin/bash
set -euo pipefail
source "${scriptPath}"
${functionCall}
`
  const wrapperPath = join(dirname(scriptPath), '_test_wrapper.sh');
  writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
  const result = runHook(wrapperPath, env);
  try { rmSync(wrapperPath); } catch {}
  return result;
}

/**
 * prepareHookScript 확장 — helpers/ 디렉토리까지 복사.
 * auto-team-cleanup.sh처럼 helpers/frontmatter-parser.sh를 source하는 스크립트용.
 */
export function prepareHookWithHelpers(
  originalPath: string,
  tmpDir: string,
  hooksDir: string
): string {
  const destPath = prepareHookScript(originalPath, tmpDir, hooksDir);

  // helpers/ 디렉토리 복사
  const helpersDir = join(dirname(originalPath), 'helpers');
  const destHelpersDir = join(hooksDir, 'helpers');
  if (existsSync(helpersDir)) {
    mkdirSync(destHelpersDir, { recursive: true });
    const files = require('fs').readdirSync(helpersDir) as string[];
    for (const f of files) {
      copyFileSync(join(helpersDir, f), join(destHelpersDir, f));
    }
  }

  return destPath;
}
