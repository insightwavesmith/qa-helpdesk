// __tests__/hooks/prevention-tdd-tracker.test.ts
// PT-1~PT-4: prevention-tdd-tracker.sh TDD 존재 확인

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** prevention-tdd-tracker.sh를 래퍼 스크립트로 실행 */
function runTracker(
  env: ReturnType<typeof createTestEnv>
): { exitCode: number; stdout: string; stderr: string; missing: number } {
  const src = join(process.cwd(), '.claude/hooks/helpers/prevention-tdd-tracker.sh');
  let content = readFileSync(src, 'utf-8');
  content = content.replace(
    /PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/,
    `PROJECT_DIR="${env.tmpDir}"`
  );

  // 래�� 스크립트: source 후 변수 출력
  const wrapperContent = `#!/bin/bash
${content}
echo "MISSING=\${TRACKER_MISSING}"
echo "DETAILS=\${TRACKER_DETAILS}"
`;
  const wrapperPath = join(env.hooksDir, 'tracker-wrapper.sh');
  writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });

  try {
    const stdout = execSync(`bash "${wrapperPath}"`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    const missingMatch = stdout.match(/MISSING=(\d+)/);
    return {
      exitCode: 0,
      stdout,
      stderr: '',
      missing: missingMatch ? parseInt(missingMatch[1], 10) : 0,
    };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
      missing: -1,
    };
  }
}

function writeIndex(tmpDir: string, data: object): void {
  const pmDir = join(tmpDir, 'docs', 'postmortem');
  mkdirSync(pmDir, { recursive: true });
  writeFileSync(join(pmDir, 'index.json'), JSON.stringify(data, null, 2));
}

describe('PT-1~4: prevention-tdd-tracker TDD 추적', () => {

  it('PT-1: TDD 파일 존재 → MISSING 0', () => {
    testEnv = createTestEnv();

    // 실제 TDD 파일 생성
    const tddDir = join(testEnv.tmpDir, '__tests__', 'hooks');
    mkdirSync(tddDir, { recursive: true });
    writeFileSync(join(tddDir, 'test-prevention.test.ts'), '// test');

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        slug: 'test',
        status: 'open',
        preventionTdd: ['__tests__/hooks/test-prevention.test.ts'],
      }],
    });

    const r = runTracker(testEnv);
    expect(r.missing).toBe(0);
  });

  it('PT-2: TDD 파일 미존재 ��� MISSING 1', () => {
    testEnv = createTestEnv();

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        slug: 'test',
        status: 'open',
        preventionTdd: ['__tests__/hooks/nonexistent.test.ts'],
      }],
    });

    const r = runTracker(testEnv);
    expect(r.missing).toBe(1);
    expect(r.stdout).toContain('TDD 파일 미존재');
  });

  it('PT-3: prevention_tdd 비어있음 → MISSING 1', () => {
    testEnv = createTestEnv();

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        slug: 'test',
        status: 'open',
        preventionTdd: [],
      }],
    });

    const r = runTracker(testEnv);
    expect(r.missing).toBe(1);
    expect(r.stdout).toContain('prevention_tdd 미지정');
  });

  it('PT-4: resolved는 스킵 �� MISSING 0', () => {
    testEnv = createTestEnv();

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        slug: 'test',
        status: 'resolved',
        preventionTdd: [],
      }],
    });

    const r = runTracker(testEnv);
    expect(r.missing).toBe(0);
  });
});
