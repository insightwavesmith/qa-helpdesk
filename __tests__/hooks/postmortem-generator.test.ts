// __tests__/hooks/postmortem-generator.test.ts
// PG-1~PG-5: postmortem-generator.sh 자동 생성 TDD

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** postmortem-generator.sh를 테스트용으로 준비 */
function prepareGenerator(env: ReturnType<typeof createTestEnv>): string {
  const src = join(process.cwd(), '.claude/hooks/postmortem-generator.sh');
  let content = readFileSync(src, 'utf-8');

  // PROJECT_DIR 치환
  content = content.replace(
    /PROJECT_DIR="[^"]*"/,
    `PROJECT_DIR="${env.tmpDir}"`
  );

  // git diff mock (테스트 환경에 .git 없으므로)
  content = content.replace(
    /git -C "\$PROJECT_DIR" diff --name-only HEAD~3\.\.HEAD 2>\/dev\/null/,
    'echo "src/test-file.ts"'
  );

  const destPath = join(env.hooksDir, 'postmortem-generator.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

function runGenerator(
  hookPath: string,
  args: string
): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`bash "${hookPath}" ${args}`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('PG-1~5: postmortem-generator 자동 생성', () => {

  it('PG-1: generator 실행 시 파일 생성', () => {
    testEnv = createTestEnv();
    const hookPath = prepareGenerator(testEnv);

    const r = runGenerator(hookPath, '"테스트 이슈" process warning');
    expect(r.exitCode).toBe(0);

    // docs/postmortem/ 디렉토리에 .md 파일 생성 확인
    const pmDir = join(testEnv.tmpDir, 'docs', 'postmortem');
    expect(existsSync(pmDir)).toBe(true);

    const files = require('fs').readdirSync(pmDir).filter((f: string) => f.endsWith('.md'));
    expect(files.length).toBeGreaterThanOrEqual(1);

    // 파일 내용에 템플릿 구조 확인
    const content = readFileSync(join(pmDir, files[0]), 'utf-8');
    expect(content).toContain('id: PM-001');
    expect(content).toContain('테스트 이슈');
    expect(content).toContain('## 1. 사고 요약');
    expect(content).toContain('## 6. 재발 방지책');
  });

  it('PG-2: generator 실행 시 index.json 갱신', () => {
    testEnv = createTestEnv();
    const hookPath = prepareGenerator(testEnv);

    runGenerator(hookPath, '"인덱스 테스트" chain critical');

    const indexPath = join(testEnv.tmpDir, 'docs', 'postmortem', 'index.json');
    expect(existsSync(indexPath)).toBe(true);

    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index.postmortems).toHaveLength(1);
    expect(index.postmortems[0].id).toBe('PM-001');
    expect(index.postmortems[0].category).toBe('chain');
    expect(index.postmortems[0].severity).toBe('critical');
    expect(index.stats.total).toBe(1);
    expect(index.stats.open).toBe(1);
  });

  it('PG-3: PM ID 자동 증가', () => {
    testEnv = createTestEnv();
    const hookPath = prepareGenerator(testEnv);

    // 첫 번째 생성
    runGenerator(hookPath, '"첫번째 이슈" process warning');
    // 두 번째 생성
    runGenerator(hookPath, '"두번째 이슈" chain critical');

    const indexPath = join(testEnv.tmpDir, 'docs', 'postmortem', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));

    expect(index.postmortems).toHaveLength(2);
    expect(index.postmortems[0].id).toBe('PM-001');
    expect(index.postmortems[1].id).toBe('PM-002');
  });

  it('PG-4: 중복 슬러그 — 같은 날 같은 이름', () => {
    testEnv = createTestEnv();
    const hookPath = prepareGenerator(testEnv);

    // 같은 이름으로 두 번 생성 → 파일 덮어쓰기
    runGenerator(hookPath, '"동일 이슈" process warning');
    const r = runGenerator(hookPath, '"동��� 이슈" process warning');

    expect(r.exitCode).toBe(0);

    // index에 2건 (각각 PM-001, PM-002)
    const indexPath = join(testEnv.tmpDir, 'docs', 'postmortem', 'index.json');
    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    expect(index.postmortems.length).toBeGreaterThanOrEqual(2);
  });

  it('PG-5: 인자 없이 실행 → 에러 메시지 + exit 1', () => {
    testEnv = createTestEnv();
    const hookPath = prepareGenerator(testEnv);

    const r = runGenerator(hookPath, '');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('사용법');
  });
});
