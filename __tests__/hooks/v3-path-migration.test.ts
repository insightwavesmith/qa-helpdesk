// __tests__/hooks/v3-path-migration.test.ts
// V3 TDD: 경로 분리 테스트 (M1~M3)
//
// 설계: docs/02-design/features/agent-process-v3.design.md §3, §7.2-B
// M1~M2: migrate-runtime.sh (TDD — 아직 미구현 가능)
// M3: 전 hook .claude/runtime 참조 0건 (정적 분석)

import { describe, it, expect, afterEach } from 'vitest';
import {
  writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync,
} from 'fs';
import { join } from 'path';
import { createTestEnv, cleanupTestEnv, runHook } from './helpers';

// 구현 파일 경로
const MIGRATE_RUNTIME = join(process.cwd(), '.claude/hooks/helpers/migrate-runtime.sh');
const MIGRATE_EXISTS = existsSync(MIGRATE_RUNTIME);

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── 헬퍼 ───────────────────────────────────────────────────────────

/** migrate-runtime.sh 준비 (PROJECT_DIR 치환) */
function prepareMigrateRuntime(tmpDir: string, hooksDir: string): string {
  const content = readFileSync(MIGRATE_RUNTIME, 'utf-8');
  const patched = content.replace(
    /PROJECT_DIR="[^"]*"/,
    `PROJECT_DIR="${tmpDir}"`
  );
  const helpersDir = join(hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const destPath = join(helpersDir, 'migrate-runtime.sh');
  writeFileSync(destPath, patched, { mode: 0o755 });
  return destPath;
}

// ─── M1~M2: migrate-runtime.sh 마이그레이션 ────────────────────────

describe.skipIf(!MIGRATE_EXISTS)('M1~M2: migrate-runtime.sh 마이그레이션', () => {

  it('M1: migrate-runtime.sh — .claude/runtime/ 파일들이 .bkit/runtime/에 복사됨', () => {
    testEnv = createTestEnv();

    // .claude/runtime/에 기존 파일 배치
    const oldRuntime = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(oldRuntime, { recursive: true });
    writeFileSync(join(oldRuntime, 'team-context-sdk-cto.json'), JSON.stringify({ team: 'CTO' }));
    writeFileSync(join(oldRuntime, 'peer-roles.json'), JSON.stringify({ CTO: 'cto1' }));
    writeFileSync(join(oldRuntime, 'teammate-registry.json'), JSON.stringify({ members: {} }));
    writeFileSync(join(oldRuntime, 'chain-sent.log'), 'test-log-entry\n');
    writeFileSync(join(oldRuntime, 'SESSION-STATE.md'), '# Session State');
    writeFileSync(join(oldRuntime, 'last-completion-report.json'), '{}');

    // 마이그레이션 실행
    const scriptPath = prepareMigrateRuntime(testEnv.tmpDir, testEnv.hooksDir);
    const r = runHook(scriptPath, {});

    expect(r.exitCode).toBe(0);

    // .bkit/runtime/에 모든 대상 파일 존재 확인
    const newRuntime = join(testEnv.tmpDir, '.bkit', 'runtime');
    expect(existsSync(join(newRuntime, 'team-context-sdk-cto.json'))).toBe(true);
    expect(existsSync(join(newRuntime, 'peer-roles.json'))).toBe(true);
    expect(existsSync(join(newRuntime, 'teammate-registry.json'))).toBe(true);
    expect(existsSync(join(newRuntime, 'chain-sent.log'))).toBe(true);
    expect(existsSync(join(newRuntime, 'SESSION-STATE.md'))).toBe(true);
    expect(existsSync(join(newRuntime, 'last-completion-report.json'))).toBe(true);

    // .migrated 마커 생성 확인
    expect(existsSync(join(newRuntime, '.migrated'))).toBe(true);

    // 내용 보존 확인
    const ctx = JSON.parse(readFileSync(join(newRuntime, 'team-context-sdk-cto.json'), 'utf-8'));
    expect(ctx.team).toBe('CTO');
  });

  it('M2: migrate-runtime.sh — .migrated 마커 존재 시 스킵', () => {
    testEnv = createTestEnv();

    // .claude/runtime/에 파일 (덮어쓰기 테스트용)
    const oldRuntime = join(testEnv.tmpDir, '.claude', 'runtime');
    mkdirSync(oldRuntime, { recursive: true });
    writeFileSync(join(oldRuntime, 'team-context.json'), JSON.stringify({ team: 'OLD' }));

    // .bkit/runtime/ 사전 생성 + .migrated 마커 + 기존 내용
    const newRuntime = join(testEnv.tmpDir, '.bkit', 'runtime');
    mkdirSync(newRuntime, { recursive: true });
    writeFileSync(join(newRuntime, '.migrated'), '2026-03-30T00:00:00Z');
    writeFileSync(join(newRuntime, 'team-context.json'), JSON.stringify({ team: 'NEW' }));

    // 마이그레이션 실행 → .migrated 있으므로 스킵
    const scriptPath = prepareMigrateRuntime(testEnv.tmpDir, testEnv.hooksDir);
    runHook(scriptPath, {});

    // .bkit/runtime/ 파일이 덮어쓰기 되지 않음 (NEW 유지)
    const ctx = JSON.parse(readFileSync(join(newRuntime, 'team-context.json'), 'utf-8'));
    expect(ctx.team).toBe('NEW');
  });
});

// ─── M3: 전 hook .bkit/runtime/ 참조 확인 ──────────────────────────

describe('M3: 모든 hook에서 RUNTIME_DIR이 .bkit/runtime/ 참조', () => {

  it('M3: hook 파일에 .claude/runtime 비-주석 참조 0건', () => {
    const hooksDir = join(process.cwd(), '.claude/hooks');
    const helpersDir = join(hooksDir, 'helpers');

    const violations: string[] = [];

    // hooks/*.sh 검사
    const hookFiles = readdirSync(hooksDir).filter(f => f.endsWith('.sh'));
    for (const f of hookFiles) {
      // migrate-runtime.sh는 의도적으로 OLD 경로 참조 (마이그레이션 소스)
      if (f === 'migrate-runtime.sh') continue;
      const content = readFileSync(join(hooksDir, f), 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('#')) continue;
        if (line.includes('.claude/runtime')) {
          violations.push(`${f}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    // helpers/*.sh 검사
    if (existsSync(helpersDir)) {
      const helperFiles = readdirSync(helpersDir).filter(f => f.endsWith('.sh'));
      for (const f of helperFiles) {
        // migrate-runtime.sh는 의도적으로 OLD 경로 참조 (마이그레이션 소스)
        if (f === 'migrate-runtime.sh') continue;
        const content = readFileSync(join(helpersDir, f), 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.trimStart().startsWith('#')) continue;
          if (line.includes('.claude/runtime')) {
            violations.push(`helpers/${f}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
