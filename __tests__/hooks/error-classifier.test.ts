// __tests__/hooks/error-classifier.test.ts
// EC-1~EC-12: 에러 분류 룰북 TDD
//
// 7개 에러 패턴 자동 분류 + 미분류 + 심각도 검증

import { describe, it, expect, afterEach } from 'vitest';
import { createTestEnv, runBashFunction, cleanupTestEnv } from './helpers';
import { join } from 'path';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

const PROJECT_DIR = '/Users/smith/projects/bscamp';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

/**
 * error-classifier.sh를 source해서 classify_error 함수 실행
 * 반환: CLASSIFIED_CODE, CLASSIFIED_SEVERITY, CLASSIFIED_ACTION
 */
function classifyError(errorText: string): { code: string; severity: string; action: string; exitCode: number } {
  testEnv = createTestEnv();
  const classifierPath = join(PROJECT_DIR, '.claude/hooks/helpers/error-classifier.sh');

  // classify_error 호출 + 결과를 JSON 형태로 출력하는 래퍼
  const result = runBashFunction(classifierPath, 'classify_error', [errorText], {
    PROJECT_DIR: testEnv.tmpDir,
  });

  // runBashFunction은 함수 호출 후 stdout에 출력하도록 wrapper를 만들어야 함
  // 직접 bash 스크립트 실행
  const { execSync } = require('child_process');
  const script = `
    source "${classifierPath}"
    classify_error "${errorText.replace(/"/g, '\\"')}"
    EC=$?
    echo "CODE=\${CLASSIFIED_CODE}"
    echo "SEVERITY=\${CLASSIFIED_SEVERITY}"
    echo "ACTION=\${CLASSIFIED_ACTION}"
    echo "EXIT=\${EC}"
  `;

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execSync(`bash -c '${script.replace(/'/g, "'\\''")}'`, {
      encoding: 'utf-8',
      env: { ...process.env, PROJECT_DIR: testEnv.tmpDir },
    });
  } catch (e: unknown) {
    const err = e as { stdout?: string; status?: number };
    stdout = err.stdout || '';
    exitCode = err.status || 1;
  }

  const code = stdout.match(/CODE=(.+)/)?.[1]?.trim() || 'UNKNOWN';
  const severity = stdout.match(/SEVERITY=(.+)/)?.[1]?.trim() || 'info';
  const action = stdout.match(/ACTION=(.+)/)?.[1]?.trim() || '';
  const exit = parseInt(stdout.match(/EXIT=(\d+)/)?.[1] || '1', 10);

  return { code, severity, action, exitCode: exit };
}

// ─── R1: HTTP 에러 ──────────────────────────────────────────

describe('EC-1~4: HTTP 에러 분류', () => {
  it('EC-1: "HTTP 429 Too Many Requests" → RATE_LIMIT', () => {
    const r = classifyError('HTTP 429 Too Many Requests');
    expect(r.code).toBe('RATE_LIMIT');
    expect(r.exitCode).toBe(0);
  });

  it('EC-2: "HTTP 401 Unauthorized" → AUTH_EXPIRED', () => {
    const r = classifyError('HTTP 401 Unauthorized');
    expect(r.code).toBe('AUTH_EXPIRED');
    expect(r.severity).toBe('critical');
  });

  it('EC-3: "HTTP 403 Forbidden" → PERMISSION', () => {
    const r = classifyError('HTTP 403 Forbidden');
    expect(r.code).toBe('PERMISSION');
    expect(r.severity).toBe('critical');
  });

  it('EC-4: "HTTP 400 Bad Request" → HTTP_CLIENT_ERROR', () => {
    const r = classifyError('HTTP 400 Bad Request');
    expect(r.code).toBe('HTTP_CLIENT_ERROR');
  });
});

// ─── R2~R7: 기타 패턴 ──────────────────────────────────────

describe('EC-5~10: 비HTTP 에러 분류', () => {
  it('EC-5: "ENOENT lock file" → LOCK_CONFLICT', () => {
    const r = classifyError('Error: ENOENT lock file not found');
    expect(r.code).toBe('LOCK_CONFLICT');
  });

  it('EC-6: "Permission denied" → PERMISSION', () => {
    const r = classifyError('bash: /usr/local/bin/foo: Permission denied');
    expect(r.code).toBe('PERMISSION');
  });

  it('EC-7: "ECONNREFUSED" → NETWORK', () => {
    const r = classifyError('Error: connect ECONNREFUSED 127.0.0.1:7899');
    expect(r.code).toBe('NETWORK');
  });

  it('EC-8: "Cannot find module" → DEPENDENCY', () => {
    const r = classifyError("Error: Cannot find module 'lodash'");
    expect(r.code).toBe('DEPENDENCY');
  });

  it('EC-9: "exit code 2" → HOOK_GATE', () => {
    const r = classifyError('Hook failed with exit code 2');
    expect(r.code).toBe('HOOK_GATE');
  });

  it('EC-10: "context auto-compact" → CONTEXT_OVERFLOW', () => {
    const r = classifyError('context auto-compact triggered at 90%');
    expect(r.code).toBe('CONTEXT_OVERFLOW');
  });
});

// ─── 미분류 + 심각도 ───────────────────────────────────────

describe('EC-11~12: 미분류 + 심각도', () => {
  it('EC-11: 미매칭 텍스트 → UNKNOWN + return 1', () => {
    const r = classifyError('something completely random happened');
    expect(r.code).toBe('UNKNOWN');
    expect(r.exitCode).toBe(1);
  });

  it('EC-12: 심각도 검증 — critical/warning/info 정확 분류', () => {
    const auth = classifyError('HTTP 401 Unauthorized');
    expect(auth.severity).toBe('critical');

    const rate = classifyError('HTTP 429 rate limit');
    expect(rate.severity).toBe('warning');

    const gate = classifyError('BLOCKED: quality gate');
    expect(gate.severity).toBe('info');
  });
});
