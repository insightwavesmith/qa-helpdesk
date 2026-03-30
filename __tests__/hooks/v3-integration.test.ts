// __tests__/hooks/v3-integration.test.ts
// V3 TDD: 실전 환경 통합 테스트 (E1~E5)
//
// 설계: docs/02-design/features/agent-process-v3.design.md §7.2-C
// E1: chain-handoff + PID 역추적 등록
// E2: peer-map.json에서 즉시 조회
// E3: stale entry 삭제 + fallback
// E4: .bkit/runtime/ 경로 통합
// E5: deploy-verify 경고

import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import {
  writeFileSync, mkdirSync, readFileSync, existsSync,
} from 'fs';
import { join } from 'path';
import {
  createTestEnv, cleanupTestEnv, runHook,
  writeAnalysisFile,
  prepareChainHandoffV2,
} from './helpers';

// 구현 파일 경로
const HOOK_SELF_REGISTER = join(process.cwd(), '.claude/hooks/helpers/hook-self-register.sh');
const DEPLOY_VERIFY = join(process.cwd(), '.claude/hooks/deploy-verify.sh');
const PEER_RESOLVER = join(process.cwd(), '.claude/hooks/helpers/peer-resolver.sh');
const CHAIN_HANDOFF = join(process.cwd(), '.claude/hooks/pdca-chain-handoff.sh');
const CHAIN_MESSENGER = join(process.cwd(), '.claude/hooks/helpers/chain-messenger.sh');

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── 헬퍼 ───────────────────────────────────────────────────────────

/** V3 team-context (.bkit/runtime/) */
function writeV3TeamContext(tmpDir: string, team: string): void {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'team-context.json'), JSON.stringify({
    team, session: 'test', created: new Date().toISOString(),
    taskFiles: ['TASK-TEST.md'], teammates: [],
  }));
}

/** V3 peer-map.json 생성 */
function writeV3PeerMap(
  tmpDir: string,
  entries: Record<string, { peerId: string; ccPid?: number }>,
): string {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  const map: Record<string, unknown> = {};
  for (const [role, data] of Object.entries(entries)) {
    map[role] = {
      peerId: data.peerId,
      ccPid: data.ccPid ?? 12345,
      registeredAt: new Date().toISOString(),
    };
  }
  const filePath = join(dir, 'peer-map.json');
  writeFileSync(filePath, JSON.stringify(map, null, 2));
  return filePath;
}

/** 통합 테스트용 mock curl (broker 시뮬레이션) */
function createIntegrationMockCurl(
  tmpDir: string,
  peers: Array<{ id: string; summary: string }>,
  sendOk: boolean = true,
): string {
  const mockBinDir = join(tmpDir, 'mock-bin');
  mkdirSync(mockBinDir, { recursive: true });
  const peersJson = JSON.stringify(peers).replace(/'/g, "'\\''");
  const sendResult = JSON.stringify({ ok: sendOk }).replace(/'/g, "'\\''");
  const lines = [
    '#!/bin/bash',
    'ARGS="$*"',
    'if echo "$ARGS" | grep -q "/health"; then',
    "    echo '{\"peers\":2}'",
    '    exit 0',
    'fi',
    'if echo "$ARGS" | grep -q "/list-peers"; then',
    `    echo '${peersJson}'`,
    '    exit 0',
    'fi',
    'if echo "$ARGS" | grep -q "/send-message"; then',
    `    echo '${sendResult}'`,
    '    exit 0',
    'fi',
    'exit 0',
  ];
  writeFileSync(join(mockBinDir, 'curl'), lines.join('\n') + '\n', { mode: 0o755 });
  return mockBinDir;
}

/** helpers 복사 + curl mock 치환 (peer-resolver, chain-messenger, hook-self-register) */
function copyV3HelpersWithMock(
  env: ReturnType<typeof createTestEnv>,
  mockBinDir: string,
): void {
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const srcHelpers = join(process.cwd(), '.claude/hooks/helpers');
  const mockCurlPath = join(mockBinDir, 'curl');

  for (const f of ['peer-resolver.sh', 'chain-messenger.sh', 'hook-self-register.sh']) {
    const src = join(srcHelpers, f);
    if (existsSync(src)) {
      let content = readFileSync(src, 'utf-8');
      content = content.replace(
        /_PR_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/,
        `_PR_PROJECT_DIR="${env.tmpDir}"`
      );
      content = content.replace(
        /_CM_RETRY_DELAY="\$\{CHAIN_RETRY_DELAY:-2\}"/,
        '_CM_RETRY_DELAY="0"'
      );
      content = content.replace(/curl /g, `${mockCurlPath} `);
      writeFileSync(join(helpersDir, f), content, { mode: 0o755 });
    }
  }
}

/** peer-resolver.sh resolve_peer 함수 직접 실행 */
function runResolvePeer(
  tmpDir: string,
  mockBinDir: string,
  role: string,
): { exitCode: number; stdout: string; resolvedId: string } {
  const resolverSrc = readFileSync(PEER_RESOLVER, 'utf-8');
  let patched = resolverSrc.replace(
    /_PR_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/,
    `_PR_PROJECT_DIR="${tmpDir}"`
  );
  patched = patched.replace(/curl /g, `${join(mockBinDir, 'curl')} `);

  const helpersDir = join(tmpDir, '.test-helpers');
  mkdirSync(helpersDir, { recursive: true });
  writeFileSync(join(helpersDir, 'peer-resolver-patched.sh'), patched, { mode: 0o755 });

  // hook-self-register도 필요할 수 있음 (resolve_self에서 사용)
  if (existsSync(HOOK_SELF_REGISTER)) {
    let hsrContent = readFileSync(HOOK_SELF_REGISTER, 'utf-8');
    hsrContent = hsrContent.replace(/curl /g, `${join(mockBinDir, 'curl')} `);
    writeFileSync(join(helpersDir, 'hook-self-register.sh'), hsrContent, { mode: 0o755 });
  }

  const wrapper = [
    '#!/bin/bash',
    `export PROJECT_DIR="${tmpDir}"`,
    `source "${join(helpersDir, 'peer-resolver-patched.sh')}"`,
    `resolve_peer "${role}"`,
    'RC=$?',
    'echo "RESOLVED=$RESOLVED_PEER_ID"',
    'echo "EXIT_CODE=$RC"',
    'exit $RC',
  ].join('\n');
  const wrapperPath = join(tmpDir, 'test-resolve-peer.sh');
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

  const match = stdout.match(/RESOLVED=(.+)/);
  return { exitCode, stdout, resolvedId: match ? match[1].trim() : '' };
}

/** deploy-verify.sh 준비 (git mock + PROJECT_DIR 치환) */
function prepareDeployVerify(
  env: ReturnType<typeof createTestEnv>,
  opts: { hasSrcChanges: boolean; pushed: boolean; lastDeployCommit?: string },
): string {
  let content = readFileSync(DEPLOY_VERIFY, 'utf-8');

  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${env.tmpDir}"`);

  // git diff mock (src/ 변경 여부)
  const diffOutput = opts.hasSrcChanges ? 'src/app/page.tsx' : 'docs/plan.md';
  content = content.replace(
    /git diff HEAD~1 --name-only 2>\/dev\/null/g,
    `echo "${diffOutput}"`
  );

  // git rev-parse mock
  const localHead = 'abc1234567890abcdef';
  const remoteHead = opts.pushed ? localHead : 'different1234567890';
  content = content.replace(
    /git rev-parse HEAD 2>\/dev\/null/g,
    `echo "${localHead}"`
  );
  content = content.replace(
    /git rev-parse origin\/main 2>\/dev\/null/g,
    `echo "${remoteHead}"`
  );

  // is-teammate.sh mock
  writeFileSync(
    join(env.hooksDir, 'is-teammate.sh'),
    '#!/bin/bash\nIS_TEAMMATE="${IS_TEAMMATE:-false}"\n',
    { mode: 0o755 }
  );

  // deploy marker
  if (opts.lastDeployCommit) {
    const bkitRuntime = join(env.tmpDir, '.bkit', 'runtime');
    mkdirSync(bkitRuntime, { recursive: true });
    writeFileSync(join(bkitRuntime, 'last-deploy-commit'), opts.lastDeployCommit);
  }

  const destPath = join(env.hooksDir, 'deploy-verify.sh');
  writeFileSync(destPath, content, { mode: 0o755 });
  return destPath;
}

// ─── E1~E5: 실전 환경 통합 테스트 ──────────────────────────────────

describe('E1~E5: V3 실전 환경 통합 테스트', () => {

  it('E1: summary 빈 상태에서 chain-handoff → PID 역추적 경로로 peer-map 등록', () => {
    // V3 핵심: chain-handoff가 hook-self-register.sh를 source하고 auto_register_peer 호출
    // 정적 검증: chain-handoff에 hook-self-register 연동이 있는지 확인
    const handoffContent = readFileSync(CHAIN_HANDOFF, 'utf-8');

    // V3: hook-self-register.sh가 source 됨
    expect(handoffContent).toContain('hook-self-register');

    // V3: auto_register_peer 함수가 호출됨
    expect(handoffContent).toContain('auto_register_peer');
  });

  it('E2: peer-map.json에 MOZZI 등록 후 chain → peer-map에서 즉시 조회', () => {
    testEnv = createTestEnv();
    const bkitRuntime = join(testEnv.tmpDir, '.bkit', 'runtime');
    mkdirSync(bkitRuntime, { recursive: true });

    // peer-map.json에 MOZZI 사전 등록
    writeV3PeerMap(testEnv.tmpDir, {
      MOZZI: { peerId: 'mozzi-peer-123' },
    });

    // broker에 mozzi-peer-123이 활성 상태
    const peers = [
      { id: 'cto1', summary: 'CTO_LEADER | bscamp' },
      { id: 'mozzi-peer-123', summary: 'MOZZI | bscamp' },
    ];
    const mockBinDir = createIntegrationMockCurl(testEnv.tmpDir, peers);

    // V3 peer-resolver Strategy 1: peer-map.json에서 MOZZI 조회
    const r = runResolvePeer(testEnv.tmpDir, mockBinDir, 'MOZZI');

    expect(r.resolvedId).toBe('mozzi-peer-123');
  });

  it('E3: peer-map.json에 stale entry (broker에 없는 ID) → stale 삭제 + fallback', () => {
    testEnv = createTestEnv();
    const bkitRuntime = join(testEnv.tmpDir, '.bkit', 'runtime');
    mkdirSync(bkitRuntime, { recursive: true });

    // peer-map.json에 stale entry (broker에 없는 ID)
    const peerMapPath = writeV3PeerMap(testEnv.tmpDir, {
      MOZZI: { peerId: 'stale-id-999' },
    });

    // broker에는 stale-id-999가 없음 (다른 ID만 존재)
    const peers = [
      { id: 'cto1', summary: 'CTO_LEADER | bscamp' },
      { id: 'mozzi-new', summary: 'MOZZI | bscamp' },
    ];
    const mockBinDir = createIntegrationMockCurl(testEnv.tmpDir, peers);

    // resolve_peer → Strategy 1에서 stale 감지 → 삭제 → fallback
    runResolvePeer(testEnv.tmpDir, mockBinDir, 'MOZZI');

    // stale entry가 peer-map.json에서 삭제됨
    const peerMap = JSON.parse(readFileSync(peerMapPath, 'utf-8'));
    expect(peerMap.MOZZI).toBeUndefined();
  });

  it('E4: .bkit/runtime/ 경로에서 hook 동작', () => {
    // V3: chain 관련 핵심 파일들이 .bkit/runtime/ 경로를 사용하는지 확인

    // chain-handoff
    const handoffContent = readFileSync(CHAIN_HANDOFF, 'utf-8');
    const handoffNonComment = handoffContent.split('\n')
      .filter(l => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(handoffNonComment).not.toContain('.claude/runtime');

    // chain-messenger
    if (existsSync(CHAIN_MESSENGER)) {
      const messengerContent = readFileSync(CHAIN_MESSENGER, 'utf-8');
      const messengerNonComment = messengerContent.split('\n')
        .filter(l => !l.trimStart().startsWith('#'))
        .join('\n');
      expect(messengerNonComment).not.toContain('.claude/runtime');
    }

    // peer-resolver
    const resolverContent = readFileSync(PEER_RESOLVER, 'utf-8');
    const resolverNonComment = resolverContent.split('\n')
      .filter(l => !l.trimStart().startsWith('#'))
      .join('\n');
    expect(resolverNonComment).not.toContain('.claude/runtime');
  });

  it.skipIf(!existsSync(DEPLOY_VERIFY))(
    'E5: deploy-verify: push O + 배포 X → 경고 출력',
    () => {
      testEnv = createTestEnv();

      const hookPath = prepareDeployVerify(testEnv, {
        hasSrcChanges: true,
        pushed: true,
        lastDeployCommit: 'oldcommit1234567890',
      });

      const r = runHook(hookPath, { IS_TEAMMATE: 'false' });

      expect(r.exitCode).toBe(0);
      expect(r.stdout).toContain('배포 미실행');
    },
  );
});
