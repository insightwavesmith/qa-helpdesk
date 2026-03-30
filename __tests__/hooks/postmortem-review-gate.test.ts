// __tests__/hooks/postmortem-review-gate.test.ts
// PR-1~PR-5: postmortem-review-gate.sh TASK 시작 전 리뷰 TDD

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createTestEnv, cleanupTestEnv } from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

// 마커 파일 경로 (테스트마다 고유)
let markerPath: string;

beforeEach(() => {
  // 테스트 전 마커 삭제 (오늘 날짜 기준)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  markerPath = `/tmp/.claude-postmortem-reviewed-${dateStr}`;
  if (existsSync(markerPath)) rmSync(markerPath);
});

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
  // 마커 정리
  if (existsSync(markerPath)) rmSync(markerPath);
});

/** postmortem-review-gate.sh를 테스트용으로 준비 */
function prepareReviewGate(env: ReturnType<typeof createTestEnv>): string {
  const src = join(process.cwd(), '.claude/hooks/postmortem-review-gate.sh');
  let content = readFileSync(src, 'utf-8');
  content = content.replace(
    /PROJECT_DIR="[^"]*"/,
    `PROJECT_DIR="${env.tmpDir}"`
  );
  // helpers source 경로도 치환
  content = content.replace(
    /source "\$PROJECT_DIR\/.claude\/hooks\/helpers\/prevention-tdd-tracker\.sh"/,
    `PROJECT_DIR="${env.tmpDir}" source "${join(process.cwd(), '.claude/hooks/helpers/prevention-tdd-tracker.sh')}"`
  );
  const destPath = join(env.hooksDir, 'postmortem-review-gate.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

function writeIndex(tmpDir: string, data: object): void {
  const pmDir = join(tmpDir, 'docs', 'postmortem');
  mkdirSync(pmDir, { recursive: true });
  writeFileSync(join(pmDir, 'index.json'), JSON.stringify(data, null, 2));
}

function runReviewGate(
  hookPath: string,
  command: string
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_input: { command } });
  try {
    // stderr→stdout 리다이렉트 (exit 0에서도 stderr 캡처)
    const stdout = execSync(`echo '${input.replace(/'/g, "'\\''")}' | bash "${hookPath}" 2>&1`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: stdout };
  } catch (err: any) {
    const out = err.stdout?.toString() ?? '';
    return {
      exitCode: err.status ?? 1,
      stdout: out,
      stderr: out,
    };
  }
}

describe('PR-1~5: postmortem-review-gate 리뷰 강제', () => {

  it('PR-1: open postmortem 있을 때 경고 메시지 출력 + exit 0', () => {
    testEnv = createTestEnv();
    const hookPath = prepareReviewGate(testEnv);

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        date: '2026-03-30',
        slug: 'test-issue',
        title: '테스트 이슈',
        severity: 'warning',
        category: 'process',
        status: 'open',
        preventionTdd: [],
        tags: [],
      }],
      stats: { total: 1, resolved: 0, open: 1 },
    });

    const r = runReviewGate(hookPath, 'npm run build');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('Postmortem 리뷰 필요');
    expect(r.stderr).toContain('1건 미해결');
  });

  it('PR-2: open postmortem 없을 때 → 메시지 없음 + exit 0', () => {
    testEnv = createTestEnv();
    const hookPath = prepareReviewGate(testEnv);

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        slug: 'resolved-issue',
        title: '해결됨',
        status: 'resolved',
        preventionTdd: [],
        tags: [],
      }],
      stats: { total: 1, resolved: 1, open: 0 },
    });

    const r = runReviewGate(hookPath, 'npm run build');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('Postmortem 리뷰 필요');
  });

  it('PR-3: TASK 키워드 매칭 — TASK에 "chain" → 관련 PM 표시', () => {
    testEnv = createTestEnv();
    const hookPath = prepareReviewGate(testEnv);

    // TASK 파일 생성
    writeFileSync(
      join(testEnv.tmpDir, '.claude', 'tasks', 'TASK-CHAIN-TEST.md'),
      '---\nteam: CTO\nstatus: in-progress\n---\n# chain 관련 작업\nchain handoff 수정'
    );

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-002',
        date: '2026-03-30',
        slug: 'chain-issue',
        title: '체인 이슈',
        status: 'open',
        preventionTdd: [],
        tags: ['chain', 'context'],
      }],
      stats: { total: 1, resolved: 0, open: 1 },
    });

    const r = runReviewGate(hookPath, 'npm run build');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('PM-002');
  });

  it('PR-4: 세션 중복 실행 방지 — 마커 파일 있으면 스킵', () => {
    testEnv = createTestEnv();
    const hookPath = prepareReviewGate(testEnv);

    writeIndex(testEnv.tmpDir, {
      postmortems: [{
        id: 'PM-001',
        date: '2026-03-30',
        slug: 'test',
        title: '테스트',
        status: 'open',
        preventionTdd: [],
        tags: [],
      }],
      stats: { total: 1, resolved: 0, open: 1 },
    });

    // 첫 실행 — 경고 출력 + 마커 생성
    const r1 = runReviewGate(hookPath, 'npm run build');
    expect(r1.exitCode).toBe(0);
    expect(r1.stderr).toContain('Postmortem 리뷰 필요');

    // 두 번째 실행 — 마커 있으므로 스킵
    const r2 = runReviewGate(hookPath, 'npm run build');
    expect(r2.exitCode).toBe(0);
    expect(r2.stderr).not.toContain('Postmortem 리뷰 ���요');
  });

  it('PR-5: index.json 미존재 → 마커 생성 + exit 0', () => {
    testEnv = createTestEnv();
    const hookPath = prepareReviewGate(testEnv);

    // index.json 없이 실행
    const r = runReviewGate(hookPath, 'npm run build');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).not.toContain('Postmortem 리뷰 필요');
    // 마커 생성 확인
    expect(existsSync(markerPath)).toBe(true);
  });
});
