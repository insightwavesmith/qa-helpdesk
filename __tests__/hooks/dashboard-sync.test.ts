// __tests__/hooks/dashboard-sync.test.ts
// P4-1~P4-5: dashboard-sync.sh GCS 업로드 TDD

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv, runHook } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** dashboard-sync.sh를 테스트용으로 준비 */
function prepareDashboardSync(
  env: ReturnType<typeof createTestEnv>,
  opts?: { gcloudFail?: boolean }
): { scriptPath: string; gcloudLog: string } {
  const src = join(process.cwd(), '.claude/hooks/dashboard-sync.sh');
  let content = readFileSync(src, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // gcloud mock
  const gcloudLog = join(env.tmpDir, 'gcloud-calls.log');
  const mockGcloud = join(env.tmpDir, 'mock-gcloud.sh');
  const exitCode = opts?.gcloudFail ? 1 : 0;
  writeFileSync(mockGcloud, `#!/bin/bash
echo "$*" >> "${gcloudLog}"
exit ${exitCode}
`, { mode: 0o755 });

  content = content.replace(/gcloud storage cp/g, `"${mockGcloud}" storage cp`);

  const destPath = join(env.hooksDir, 'dashboard-sync.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return { scriptPath: destPath, gcloudLog };
}

describe('P4-1~5: dashboard-sync GCS 업로드', () => {

  it('P4-1: state.json 변경 시 업로드 호출 + hash 갱신', () => {
    testEnv = createTestEnv();
    const { scriptPath, gcloudLog } = prepareDashboardSync(testEnv);

    // state.json 생성
    const runtimeDir = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, 'state.json'), JSON.stringify({ status: 'test' }));

    const r = runHook(scriptPath);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('업로드 완료');

    // gcloud 호출 확인
    expect(existsSync(gcloudLog)).toBe(true);
    const calls = readFileSync(gcloudLog, 'utf-8');
    expect(calls).toContain('storage cp');

    // hash 파일 갱신 확인
    const hashFile = join(runtimeDir, '.state-hash');
    expect(existsSync(hashFile)).toBe(true);
    expect(readFileSync(hashFile, 'utf-8').trim()).not.toBe('');
  });

  it('P4-2: state.json 미변경 시 스킵', () => {
    testEnv = createTestEnv();
    const { scriptPath, gcloudLog } = prepareDashboardSync(testEnv);

    // state.json + hash 생성 (동일 hash)
    const runtimeDir = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    const stateContent = JSON.stringify({ status: 'test' });
    writeFileSync(join(runtimeDir, 'state.json'), stateContent);

    // md5 hash 계산 후 hash 파일에 기록
    const hash = execSync(`md5 -q "${join(runtimeDir, 'state.json')}" 2>/dev/null || md5sum "${join(runtimeDir, 'state.json')}" | awk '{print $1}'`, {
      encoding: 'utf-8',
    }).trim();
    writeFileSync(join(runtimeDir, '.state-hash'), hash);

    const r = runHook(scriptPath);
    expect(r.exitCode).toBe(0);

    // gcloud 미호출 확인
    expect(existsSync(gcloudLog)).toBe(false);
  });

  it('P4-3: state.json 미존재 → exit 0', () => {
    testEnv = createTestEnv();
    const { scriptPath } = prepareDashboardSync(testEnv);

    // state.json 미생성
    const r = runHook(scriptPath);
    expect(r.exitCode).toBe(0);
  });

  it('P4-4: gcloud 실패 → exit 1 + hash 미갱신', () => {
    testEnv = createTestEnv();
    const { scriptPath } = prepareDashboardSync(testEnv, { gcloudFail: true });

    // state.json 생성
    const runtimeDir = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(join(runtimeDir, 'state.json'), JSON.stringify({ status: 'test' }));

    const r = runHook(scriptPath);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('업로드 실패');

    // hash 파일 미갱신 확인
    const hashFile = join(runtimeDir, '.state-hash');
    expect(existsSync(hashFile)).toBe(false);
  });

  it('P4-5: 스크립트 문법 검증 (bash -n)', () => {
    const src = join(process.cwd(), '.claude/hooks/dashboard-sync.sh');
    const r = execSync(`bash -n "${src}" 2>&1`, { encoding: 'utf-8' });
    // bash -n이 성공하면 빈 출력
    expect(r.trim()).toBe('');
  });
});
