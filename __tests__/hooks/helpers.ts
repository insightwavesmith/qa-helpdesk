// __tests__/hooks/helpers.ts — Hook 테스트 공통 헬퍼
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, copyFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { tmpdir } from 'os';

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
