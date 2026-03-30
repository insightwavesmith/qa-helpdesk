// __tests__/hooks/v3-pid-register.test.ts
// V3 TDD: PID 역추적 + auto_register_peer 테스트 (P1~P6)
//
// 설계: docs/02-design/features/agent-process-v3.design.md §2, §7.2-A
// 대상: .claude/hooks/helpers/hook-self-register.sh (TDD — 아직 미구현 가능)

import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  writeFileSync, mkdirSync, readFileSync, existsSync,
} from 'fs';
import { join } from 'path';
import { createTestEnv, cleanupTestEnv } from './helpers';

// 구현 파일 경로
const HOOK_SELF_REGISTER = join(process.cwd(), '.claude/hooks/helpers/hook-self-register.sh');
const HOOK_EXISTS = existsSync(HOOK_SELF_REGISTER);

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── 헬퍼 ───────────────────────────────────────────────────────────

/** V3 런타임 디렉토리 (.bkit/runtime/) 생성 */
function createBkitRuntime(tmpDir: string): string {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** V3 team-context 파일 생성 (.bkit/runtime/) */
function writeV3TeamContext(tmpDir: string, team: string): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'team-context.json'), JSON.stringify({
    team, session: 'test', created: new Date().toISOString(),
    taskFiles: ['TASK-TEST.md'], teammates: [],
  }));
}

/**
 * PID 매칭용 mock curl 생성.
 * EXPECTED_PID 환경변수를 peer PID로 반환 → find_my_peer_id에서 $$ 매칭.
 */
function createPidMockCurl(tmpDir: string, peerId: string = 'test-peer-abc'): string {
  const mockBinDir = join(tmpDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });
  const lines = [
    '#!/bin/bash',
    'if echo "$*" | grep -q "/list-peers"; then',
    `    printf '[{"id":"${peerId}","pid":%s,"summary":""}]\\n' "$EXPECTED_PID"`,
    '    exit 0',
    'fi',
    'exit 22',
  ];
  writeFileSync(join(mockBinDir, 'curl'), lines.join('\n') + '\n', { mode: 0o755 });
  return mockBinDir;
}

/** broker 미기동 mock curl (항상 실패) */
function createFailMockCurl(tmpDir: string): string {
  const mockBinDir = join(tmpDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });
  writeFileSync(join(mockBinDir, 'curl'), '#!/bin/bash\nexit 22\n', { mode: 0o755 });
  return mockBinDir;
}

/** PID 매칭 없는 mock curl (빈 peers 반환) */
function createEmptyPeersMockCurl(tmpDir: string): string {
  const mockBinDir = join(tmpDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });
  const lines = [
    '#!/bin/bash',
    'if echo "$*" | grep -q "/list-peers"; then',
    '    echo "[]"',
    '    exit 0',
    'fi',
    'exit 22',
  ];
  writeFileSync(join(mockBinDir, 'curl'), lines.join('\n') + '\n', { mode: 0o755 });
  return mockBinDir;
}

/**
 * find_my_peer_id 실행.
 * wrapper script가 EXPECTED_PID=$$ 설정 → mock curl이 해당 PID를 peer로 반환
 * → find_my_peer_id가 $$부터 PID 트리를 순회하며 매칭.
 */
function runFindMyPeerId(
  tmpDir: string,
  mockBinDir: string,
): { exitCode: number; stdout: string; peerId: string } {
  const wrapper = [
    '#!/bin/bash',
    `export PROJECT_DIR="${tmpDir}"`,
    'export EXPECTED_PID=$$',
    `export PATH="${mockBinDir}:$PATH"`,
    `source "${HOOK_SELF_REGISTER}"`,
    'RESULT=$(find_my_peer_id)',
    'RC=$?',
    'echo "PEER_ID=$RESULT"',
    'exit $RC',
  ].join('\n');

  const wrapperPath = join(tmpDir, 'test-find-peer.sh');
  writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execSync(`bash "${wrapperPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, PROJECT_DIR: tmpDir },
      timeout: 10000,
    });
  } catch (err: any) {
    exitCode = err.status ?? 1;
    stdout = err.stdout?.toString() ?? '';
  }

  const match = stdout.match(/PEER_ID=(.+)/);
  return { exitCode, stdout, peerId: match ? match[1].trim() : '' };
}

/**
 * auto_register_peer 실행.
 * team-context에서 역할 추출 → find_my_peer_id로 peer ID 매칭 → peer-map.json에 등록.
 */
function runAutoRegister(
  tmpDir: string,
  mockBinDir: string,
): { exitCode: number; stdout: string } {
  const wrapper = [
    '#!/bin/bash',
    `export PROJECT_DIR="${tmpDir}"`,
    'export EXPECTED_PID=$$',
    `export PATH="${mockBinDir}:$PATH"`,
    `source "${HOOK_SELF_REGISTER}"`,
    'auto_register_peer',
    'exit $?',
  ].join('\n');

  const wrapperPath = join(tmpDir, 'test-auto-register.sh');
  writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execSync(`bash "${wrapperPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, PROJECT_DIR: tmpDir },
      timeout: 10000,
    });
  } catch (err: any) {
    exitCode = err.status ?? 1;
    stdout = err.stdout?.toString() ?? '';
  }

  return { exitCode, stdout };
}

// ─── P1~P6: PID 역추적 + auto_register_peer ────────────────────────

describe.skipIf(!HOOK_EXISTS)('P1~P6: PID 역추적 + auto_register_peer', () => {

  it('P1: find_my_peer_id — mock broker에 현재 PID 등록 → peer ID 반환', () => {
    testEnv = createTestEnv();
    createBkitRuntime(testEnv.tmpDir);
    const mockBinDir = createPidMockCurl(testEnv.tmpDir);

    const r = runFindMyPeerId(testEnv.tmpDir, mockBinDir);

    expect(r.exitCode).toBe(0);
    expect(r.peerId).toBe('test-peer-abc');
  });

  it('P2: find_my_peer_id — broker 미기동 (curl 실패) → return 1, 크래시 없음', () => {
    testEnv = createTestEnv();
    createBkitRuntime(testEnv.tmpDir);
    const mockBinDir = createFailMockCurl(testEnv.tmpDir);

    const r = runFindMyPeerId(testEnv.tmpDir, mockBinDir);

    // broker 실패 → PEERS="[]" → 매칭 불가 → return 1
    expect(r.exitCode).toBe(1);
  });

  it('P3: find_my_peer_id — PID 트리에 매칭 없음 (10단계 후 종료) → return 1', () => {
    testEnv = createTestEnv();
    createBkitRuntime(testEnv.tmpDir);
    // 빈 peers → PID 순회 시 어떤 PID도 매칭 안 됨
    const mockBinDir = createEmptyPeersMockCurl(testEnv.tmpDir);

    const r = runFindMyPeerId(testEnv.tmpDir, mockBinDir);

    expect(r.exitCode).toBe(1);
  });

  it('P4: auto_register_peer — 첫 실행 → peer-map.json 생성 + 역할 매핑', () => {
    testEnv = createTestEnv();
    createBkitRuntime(testEnv.tmpDir);
    writeV3TeamContext(testEnv.tmpDir, 'CTO');
    const mockBinDir = createPidMockCurl(testEnv.tmpDir);

    const r = runAutoRegister(testEnv.tmpDir, mockBinDir);

    expect(r.exitCode).toBe(0);

    const peerMapPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'peer-map.json');
    expect(existsSync(peerMapPath)).toBe(true);

    const peerMap = JSON.parse(readFileSync(peerMapPath, 'utf-8'));
    expect(peerMap.CTO_LEADER).toBeDefined();
    expect(peerMap.CTO_LEADER.peerId).toBe('test-peer-abc');
    expect(peerMap.CTO_LEADER.registeredAt).toBeDefined();
    expect(typeof peerMap.CTO_LEADER.ccPid).toBe('number');
  });

  it('P5: auto_register_peer — 중복 실행 (같은 peerId) → 스킵 (멱등)', () => {
    testEnv = createTestEnv();
    createBkitRuntime(testEnv.tmpDir);
    writeV3TeamContext(testEnv.tmpDir, 'CTO');
    const mockBinDir = createPidMockCurl(testEnv.tmpDir);

    // 첫 실행 → peer-map.json 생성
    runAutoRegister(testEnv.tmpDir, mockBinDir);

    const peerMapPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'peer-map.json');
    const contentBefore = readFileSync(peerMapPath, 'utf-8');

    // 두 번째 실행 — mock curl 동일 peerId("test-peer-abc") 반환
    // 함수 내부: EXISTING peerId == 현재 peerId → 스킵 (return 0, 쓰기 없음)
    runAutoRegister(testEnv.tmpDir, mockBinDir);

    const contentAfter = readFileSync(peerMapPath, 'utf-8');
    expect(contentAfter).toBe(contentBefore);
  });

  it('P6: auto_register_peer — 다른 역할 추가 → 기존 항목 유지', () => {
    testEnv = createTestEnv();
    createBkitRuntime(testEnv.tmpDir);

    // 1) CTO 등록
    writeV3TeamContext(testEnv.tmpDir, 'CTO');
    const ctoBinDir = createPidMockCurl(testEnv.tmpDir, 'cto-peer-abc');
    runAutoRegister(testEnv.tmpDir, ctoBinDir);

    // 2) PM 등록 — 다른 peerId + 다른 team-context
    writeV3TeamContext(testEnv.tmpDir, 'PM');
    // 다른 mock curl (다른 peerId) — 별도 디렉토리
    const pmBinDir = join(testEnv.tmpDir, 'mock-bin-pm');
    mkdirSync(pmBinDir, { recursive: true });
    const pmMockLines = [
      '#!/bin/bash',
      'if echo "$*" | grep -q "/list-peers"; then',
      '    printf \'[{"id":"pm-peer-xyz","pid":%s,"summary":""}]\\n\' "$EXPECTED_PID"',
      '    exit 0',
      'fi',
      'exit 22',
    ];
    writeFileSync(join(pmBinDir, 'curl'), pmMockLines.join('\n') + '\n', { mode: 0o755 });
    runAutoRegister(testEnv.tmpDir, pmBinDir);

    // 검증: 두 역할 모두 존재
    const peerMapPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'peer-map.json');
    const peerMap = JSON.parse(readFileSync(peerMapPath, 'utf-8'));

    expect(peerMap.CTO_LEADER).toBeDefined();
    expect(peerMap.PM_LEADER).toBeDefined();
    expect(peerMap.CTO_LEADER.peerId).toBe('cto-peer-abc');
    expect(peerMap.PM_LEADER.peerId).toBe('pm-peer-xyz');
  });
});
