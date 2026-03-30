// __tests__/hooks/postmortem-validator.test.ts
// PV-1~PV-4: postmortem-validator.sh 완성도 검증 TDD

import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/** postmortem-validator.sh를 테스트용으로 준비 */
function prepareValidator(env: ReturnType<typeof createTestEnv>): string {
  const src = join(process.cwd(), '.claude/hooks/helpers/postmortem-validator.sh');
  let content = readFileSync(src, 'utf-8');
  content = content.replace(
    /PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/,
    `PROJECT_DIR="${env.tmpDir}"`
  );
  const destPath = join(env.hooksDir, 'postmortem-validator.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

function writePostmortem(tmpDir: string, filename: string, content: string): string {
  const pmDir = join(tmpDir, 'docs', 'postmortem');
  mkdirSync(pmDir, { recursive: true });
  const filepath = join(pmDir, filename);
  writeFileSync(filepath, content);
  return filepath;
}

function runValidator(
  hookPath: string,
  filePath?: string
): { exitCode: number; stdout: string; stderr: string } {
  const cmd = filePath
    ? `bash "${hookPath}" "${filePath}"`
    : `bash "${hookPath}"`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('PV-1~4: postmortem-validator 완성도 검증', () => {

  it('PV-1: 미완성 postmortem 감지 — {수동 필수} 포함', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidator(testEnv);
    const pmFile = writePostmortem(testEnv.tmpDir, 'test-incomplete.md', `---
id: PM-099
date: 2026-03-30
severity: warning
category: process
status: open
prevention_tdd: []
---

# 테스트 미완성

## 4. 근본 원인 (5 Whys)
1. Why: {수동 필수}
2. Why: {수동 필수}

**근본 원인 한 줄**: {수동 필수}

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | {수동 필수} | hook | - | pending |

## 7. 교훈
- {수동 필수}
`);

    const r = runValidator(hookPath, pmFile);
    expect(r.stdout).toContain('미작성 필수 항목');
    expect(r.stdout).toContain('미완성');
  });

  it('PV-2: 완성된 postmortem → OK', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidator(testEnv);
    const pmFile = writePostmortem(testEnv.tmpDir, 'test-complete.md', `---
id: PM-100
date: 2026-03-30
severity: warning
category: process
status: open
prevention_tdd: [__tests__/hooks/test.test.ts]
---

# 완성된 테스트

## 4. 근본 원��� (5 Whys)
1. Why: 설계 결함으로 인한 파일 충���
2. Why: 병렬 실행 미고려

**근본 원인 한 줄**: 병렬 설계 결함

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | 파일 분리 | hook | test:TC-1 | resolved |

## 7. 교훈
- 병렬 실행 시 파일 분리 필수
`);

    const r = runValidator(hookPath, pmFile);
    expect(r.stdout).toContain('완성도 OK');
  });

  it('PV-3: resolved 상태 스킵', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidator(testEnv);
    writePostmortem(testEnv.tmpDir, 'test-resolved.md', `---
id: PM-101
date: 2026-03-30
severity: critical
category: migration
status: resolved
prevention_tdd: []
---

# resolved 테스트

## 4. 근본 원인 (5 Whys)
1. Why: {수동 필수}

## 7. 교훈
- {수동 필수}
`);

    const r = runValidator(hookPath);
    // resolved 상태는 스킵 → 에러 없음
    expect(r.stdout).toContain('완성도 OK');
  });

  it('PV-4: Why 1개만 작성 → 최소 2개 미달 경고', () => {
    testEnv = createTestEnv();
    const hookPath = prepareValidator(testEnv);
    const pmFile = writePostmortem(testEnv.tmpDir, 'test-why-short.md', `---
id: PM-102
date: 2026-03-30
severity: warning
category: process
status: open
prevention_tdd: [__tests__/hooks/test.test.ts]
---

# Why 부족 테스트

## 4. 근본 원인 (5 Whys)
1. Why: 하나만 작성
2. Why:
3. Why:

**근본 원인 한 줄**: 원인 하나

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | 방지책 작성 | hook | test:TC-1 | pending |

## 7. 교훈
- 교훈 작성됨
`);

    const r = runValidator(hookPath, pmFile);
    expect(r.stdout).toContain('근본 원인');
    expect(r.stdout).toContain('최소 2개');
  });
});
