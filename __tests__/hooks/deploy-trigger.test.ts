// __tests__/hooks/deploy-trigger.test.ts — V2 배포 트리거 TDD
// U1: L0 즉시 배포 안내
// U2: L1 배포 스킵
// U3: L2 Gap 통과 → 배포 안내
// U4: L2 Gap 미통과 → 배포 안내 없음

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { createTestEnv, cleanupTestEnv, runHook, writeAnalysisFile } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

function prepareDeployTrigger(
  env: ReturnType<typeof createTestEnv>,
  opts: { lastCommit?: string; changedFiles?: string[] }
): string {
  const originalPath = join(process.cwd(), '.claude/hooks/deploy-trigger.sh');
  let content = readFileSync(originalPath, 'utf-8');

  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // git log mock
  const commit = opts.lastCommit || 'abc1234 test commit';
  content = content.replace(
    /git log --oneline -1 2>\/dev\/null/g,
    `echo "${commit}"`
  );

  // git diff mock
  const files = (opts.changedFiles || []).join('\\n');
  content = content.replace(
    /git diff HEAD~1 --name-only 2>\/dev\/null/g,
    `echo -e "${files}"`
  );

  // is-teammate mock
  writeFileSync(
    join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
    { mode: 0o755 }
  );

  // helpers 복사
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const srcHelpers = join(process.cwd(), '.claude/hooks/helpers');
  const matchRateSrc = join(srcHelpers, 'match-rate-parser.sh');
  if (existsSync(matchRateSrc)) {
    copyFileSync(matchRateSrc, join(helpersDir, 'match-rate-parser.sh'));
  }

  const destPath = join(env.hooksDir, 'deploy-trigger.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

describe('deploy-trigger.sh V2', () => {
  it('U1: L0 fix 커밋 → 즉시 배포 안내 출력', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployTrigger(testEnv, {
      lastCommit: 'abc1234 fix: 긴급 버그 수정',
      changedFiles: ['src/app/page.tsx'],
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('L0 핫픽스');
    expect(result.stdout).toContain('즉시 배포 필요');
  });

  it('U2: L1 src 미수정 → 배포 안내 없음', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployTrigger(testEnv, {
      lastCommit: 'abc1234 docs: 문서 업데이트',
      changedFiles: ['docs/readme.md'],
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('배포');
  });

  it('U3: L2 Gap 95%+ → 배포 안내 출력', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);

    const hookPath = prepareDeployTrigger(testEnv, {
      lastCommit: 'abc1234 feat: 새 기능',
      changedFiles: ['src/app/page.tsx'],
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Gap');
    expect(result.stdout).toContain('통과');
    expect(result.stdout).toContain('배포 진행');
  });

  it('U4: L2 Gap 80% → 배포 안내 없음', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 80);

    const hookPath = prepareDeployTrigger(testEnv, {
      lastCommit: 'abc1234 feat: 새 기능',
      changedFiles: ['src/app/page.tsx'],
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'false' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('배포 진행');
  });

  it('U9: 팀원에서 실행 시 즉시 종료 (스킵)', () => {
    testEnv = createTestEnv();
    const hookPath = prepareDeployTrigger(testEnv, {
      lastCommit: 'abc1234 fix: test',
      changedFiles: ['src/app/page.tsx'],
    });

    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('배포');
  });
});
