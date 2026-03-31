// __tests__/hooks/chain-e2e.test.ts — 체인 자동화 E2E TDD
// PR-1~8: peer-resolver 단위
// CM-1~6: chain-messenger 단위
// CH-1~6: chain-handoff + resolver 통합
// PF-1~8: pm-chain-forward
// CR-1~6: coo-chain-report
// FB-1~4: 반려 역방향 (COO→PM→CTO)

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv, runHook, runBashFunction, cleanupTestEnv,
  writeTeamContext, writeAnalysisFile, writePeerMap,
  writePmVerdict, writeCompletionReport, writePmReport, writeCooFeedback,
  prepareChainHandoffV2, preparePmChainForward, prepareCooChainReport,
} from './helpers';

const MOCK_PEERS = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
];

const MOCK_PEERS_WITH_MOZZI = [
  { id: 'cto1', summary: 'CTO_LEADER | bscamp | test' },
  { id: 'pm1', summary: 'PM_LEADER | bscamp | test' },
  { id: 'mozzi1', summary: 'MOZZI | bscamp | test' },
];

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── peer-resolver 단위 ─────────────────────────────────────────────

describe('peer-resolver', () => {
  function prepareResolver(env: ReturnType<typeof createTestEnv>, mockBroker: {
    health: boolean;
    peers?: Array<{ id: string; summary: string }>;
  }): string {
    const helpersDir = join(env.hooksDir, 'helpers');
    mkdirSync(helpersDir, { recursive: true });
    const src = join(process.cwd(), '.claude/hooks/helpers/peer-resolver.sh');
    let content = readFileSync(src, 'utf-8');
    // PROJECT_DIR 치환
    content = content.replace(
      /_PR_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/,
      `_PR_PROJECT_DIR="${env.tmpDir}"`
    );
    // curl mock
    const peersJson = JSON.stringify(mockBroker.peers || []);
    const mockScript = join(env.tmpDir, 'mock-curl-pr.sh');
    writeFileSync(mockScript, `#!/bin/bash
ARGS="$*"
if echo "$ARGS" | grep -q "/list-peers"; then
    echo '${peersJson.replace(/'/g, "'\\''")}'
    exit 0
fi
exit 0
`, { mode: 0o755 });
    content = content.replace(/curl /g, `${mockScript} `);
    const destPath = join(helpersDir, 'peer-resolver.sh');
    writeFileSync(destPath, content, { mode: 0o755 });
    return destPath;
  }

  it('PR-1: peer-map.json에 역할 등록 → 즉시 resolve', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: MOCK_PEERS,
    });
    writePeerMap(testEnv.tmpDir, { PM_LEADER: { peerId: 'pm1' } });
    const result = runBashFunction(resolverPath,
      'resolve_peer "PM_LEADER"; echo "PEER=$RESOLVED_PEER_ID"');
    expect(result.stdout).toContain('PEER=pm1');
  });

  it('PR-2: peer-map에 없으면 summary 매칭 fallback', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: MOCK_PEERS,
    });
    const result = runBashFunction(resolverPath,
      'resolve_peer "PM_LEADER" || true; echo "PEER=$RESOLVED_PEER_ID"');
    expect(result.stdout).toContain('PEER=pm1');
  });

  it('PR-3: 역할 없는 peer → 빈 결과 + exit 1', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: MOCK_PEERS,
    });
    const result = runBashFunction(resolverPath,
      'resolve_peer "UNKNOWN_ROLE" || true; echo "PEER=$RESOLVED_PEER_ID"');
    expect(result.stdout).toContain('PEER=');
    expect(result.stdout).not.toContain('PEER=pm1');
  });

  it('PR-4: MOZZI peer 검색', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: MOCK_PEERS_WITH_MOZZI,
    });
    const result = runBashFunction(resolverPath,
      'resolve_peer "MOZZI" || true; echo "PEER=$RESOLVED_PEER_ID"');
    expect(result.stdout).toContain('PEER=mozzi1');
  });

  it('PR-5: resolve_self → CTO peer 찾기', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: MOCK_PEERS,
    });
    const result = runBashFunction(resolverPath,
      'resolve_self || true; echo "SELF=$RESOLVED_SELF_ID"');
    expect(result.stdout).toContain('SELF=cto1');
  });

  it('PR-6: peer-map 우선순위 > summary', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true,
      peers: [
        { id: 'pm-old', summary: 'PM_LEADER | old' },
        { id: 'pm-new', summary: 'PM_LEADER | new' },
      ],
    });
    writePeerMap(testEnv.tmpDir, { PM_LEADER: { peerId: 'pm-new' } });
    const result = runBashFunction(resolverPath,
      'resolve_peer "PM_LEADER" || true; echo "PEER=$RESOLVED_PEER_ID"');
    expect(result.stdout).toContain('PEER=pm-new');
  });

  it('PR-7: peer-map에 등록된 ID가 peers에 없으면 fallback', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: MOCK_PEERS,
    });
    writePeerMap(testEnv.tmpDir, { PM_LEADER: { peerId: 'stale-id-not-exists' } });
    const result = runBashFunction(resolverPath,
      'resolve_peer "PM_LEADER" || true; echo "PEER=$RESOLVED_PEER_ID"');
    // stale ID는 peers에 없으므로 summary fallback → pm1
    expect(result.stdout).toContain('PEER=pm1');
  });

  it('PR-8: 빈 peers → resolve 실패', () => {
    testEnv = createTestEnv();
    const resolverPath = prepareResolver(testEnv, {
      health: true, peers: [],
    });
    const result = runBashFunction(resolverPath,
      'if resolve_peer "PM_LEADER"; then echo "EXIT=0"; else echo "EXIT=1"; fi; echo "PEER=$RESOLVED_PEER_ID"');
    expect(result.stdout).toContain('EXIT=1');
    expect(result.stdout).toContain('PEER=');
  });
});

// ─── chain-messenger 단위 ───────────────────────────────────────────

describe('chain-messenger', () => {
  function prepareMessenger(env: ReturnType<typeof createTestEnv>, mockBroker: {
    health: boolean;
    sendOk?: boolean;
    failFirstN?: number;  // 처음 N번 실패 후 성공
  }): string {
    const helpersDir = join(env.hooksDir, 'helpers');
    mkdirSync(helpersDir, { recursive: true });
    const src = join(process.cwd(), '.claude/hooks/helpers/chain-messenger.sh');
    let content = readFileSync(src, 'utf-8');

    // curl mock with retry support
    const mockScript = join(env.tmpDir, 'mock-curl-cm.sh');
    const counterFile = join(env.tmpDir, 'curl-call-count');
    writeFileSync(counterFile, '0');

    const failN = mockBroker.failFirstN || 0;
    const sendOk = mockBroker.sendOk ?? true;
    writeFileSync(mockScript, `#!/bin/bash
ARGS="$*"
COUNTER_FILE="${counterFile}"

if echo "$ARGS" | grep -q "/health"; then
    ${mockBroker.health ? 'exit 0' : 'exit 22'}
fi

if echo "$ARGS" | grep -q "/send-message"; then
    COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
    COUNT=$((COUNT + 1))
    echo "$COUNT" > "$COUNTER_FILE"
    if [ "$COUNT" -le ${failN} ]; then
        echo '{"ok":false}'
        exit 0
    fi
    ${sendOk ? 'echo \'{"ok":true}\'; exit 0' : 'echo \'{"ok":false}\'; exit 0'}
fi

exit 0
`, { mode: 0o755 });

    content = content.replace(/curl /g, `${mockScript} `);
    // 테스트에서 retry delay 줄이기
    content = content.replace(/_CM_RETRY_DELAY="\$\{CHAIN_RETRY_DELAY:-2\}"/, '_CM_RETRY_DELAY="${CHAIN_RETRY_DELAY:-0}"');
    const destPath = join(helpersDir, 'chain-messenger.sh');
    writeFileSync(destPath, content, { mode: 0o755 });
    return destPath;
  }

  it('CM-1: broker 정상 → 전송 성공', () => {
    testEnv = createTestEnv();
    const msgPath = prepareMessenger(testEnv, { health: true, sendOk: true });
    const result = runBashFunction(msgPath,
      'send_chain_message "from1" "to1" \'{"test":true}\'; echo "STATUS=$SEND_STATUS"');
    expect(result.stdout).toContain('STATUS=ok');
  });

  it('CM-2: broker 다운 → broker_down', () => {
    testEnv = createTestEnv();
    const msgPath = prepareMessenger(testEnv, { health: false });
    const result = runBashFunction(msgPath,
      'send_chain_message "from1" "to1" \'{"test":true}\' || true; echo "STATUS=$SEND_STATUS"; echo "DETAIL=$SEND_DETAIL"');
    expect(result.stdout).toContain('STATUS=broker_down');
    expect(result.stdout).toContain('DETAIL=broker 미기동');
  });

  it('CM-3: 전송 실패 → fail + max_retry exhausted', () => {
    testEnv = createTestEnv();
    const msgPath = prepareMessenger(testEnv, { health: true, sendOk: false });
    const result = runBashFunction(msgPath,
      'send_chain_message "from1" "to1" \'{"test":true}\' || true; echo "STATUS=$SEND_STATUS"');
    expect(result.stdout).toContain('STATUS=fail');
  });

  it('CM-4: 첫 2번 실패 → 3번째 성공 (retry)', () => {
    testEnv = createTestEnv();
    const msgPath = prepareMessenger(testEnv, { health: true, sendOk: true, failFirstN: 2 });
    const result = runBashFunction(msgPath,
      'send_chain_message "from1" "to1" \'{"test":true}\'; echo "STATUS=$SEND_STATUS"; echo "DETAIL=$SEND_DETAIL"');
    expect(result.stdout).toContain('STATUS=ok');
    expect(result.stdout).toContain('attempt=3');
  });

  it('CM-5: health check 함수 — OK', () => {
    testEnv = createTestEnv();
    const msgPath = prepareMessenger(testEnv, { health: true });
    const result = runBashFunction(msgPath,
      'check_broker_health; echo "HEALTH=$?"');
    expect(result.stdout).toContain('HEALTH=0');
  });

  it('CM-6: health check 함수 — DOWN', () => {
    testEnv = createTestEnv();
    const msgPath = prepareMessenger(testEnv, { health: false });
    const result = runBashFunction(msgPath,
      'if check_broker_health; then echo "HEALTH=0"; else echo "HEALTH=1"; fi');
    expect(result.stdout).toContain('HEALTH=1');
  });
});

// ─── chain-handoff + resolver 통합 ──────────────────────────────────

/** helpers 복사 + curl mock 치환 */
function copyHelpersWithMock(
  env: ReturnType<typeof createTestEnv>,
  broker: { health: boolean; peers?: Array<{ id: string; summary: string }>; sendOk?: boolean }
) {
  const helpersDir = join(env.hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const srcHelpers = join(process.cwd(), '.claude/hooks/helpers');
  // mock curl 생성
  const peersJson = JSON.stringify(broker.peers || []);
  const sendResult = JSON.stringify({ ok: broker.sendOk ?? false });
  const mockPath = join(env.tmpDir, 'mock-curl-helpers.sh');
  writeFileSync(mockPath, `#!/bin/bash
ARGS="$*"
if echo "$ARGS" | grep -q "/health"; then
    ${broker.health ? 'echo \'{"peers":2}\'; exit 0' : 'exit 22'}
fi
if echo "$ARGS" | grep -q "/list-peers"; then
    echo '${peersJson.replace(/'/g, "'\\''")}'
    exit 0
fi
if echo "$ARGS" | grep -q "/send-message"; then
    echo '${sendResult.replace(/'/g, "'\\''")}'
    exit 0
fi
exit 0
`, { mode: 0o755 });
  for (const f of ['peer-resolver.sh', 'chain-messenger.sh']) {
    const src = join(srcHelpers, f);
    if (existsSync(src)) {
      let c = readFileSync(src, 'utf-8');
      c = c.replace(/_PR_PROJECT_DIR="\$\{PROJECT_DIR:-[^}]*\}"/, `_PR_PROJECT_DIR="${env.tmpDir}"`);
      c = c.replace(/_CM_RETRY_DELAY="\$\{CHAIN_RETRY_DELAY:-2\}"/, '_CM_RETRY_DELAY="0"');
      c = c.replace(/curl /g, `${mockPath} `);
      writeFileSync(join(helpersDir, f), c, { mode: 0o755 });
    }
  }
}

describe('chain-handoff + peer-resolver 통합', () => {
  it('CH-1: peer-resolver 사용 → peer-map.json으로 resolve', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writePeerMap(testEnv.tmpDir, {
      MOZZI: { peerId: 'mozzi-mapped' },
      CTO_LEADER: { peerId: 'cto-mapped' },
    });
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: {
        health: true,
        peers: [
          { id: 'mozzi-mapped', summary: 'MOZZI session' },
          { id: 'cto-mapped', summary: 'some CTO session' },
        ],
        sendOk: true,
      },
    });
    // helpers를 복사하되, curl도 mock으로 치환
    copyHelpersWithMock(testEnv, {
      health: true,
      peers: [
        { id: 'mozzi-mapped', summary: 'MOZZI session' },
        { id: 'cto-mapped', summary: 'some CTO session' },
      ],
      sendOk: true,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('전송 완료');
  });

  it('CH-2: peer-resolver 없음 → inline summary fallback 동작', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    // helpers에 peer-resolver 복사하지 않음 → fallback
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('전송 완료');
  });

  it('CH-3: 전송 성공 시 last-completion-report.json 저장', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'last-completion-report.json');
    expect(existsSync(reportPath)).toBe(true);
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.payload.match_rate).toBe(97);
  });

  it('CH-4: V5: broker sendOk 무관 → MOZZI webhook 전송', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: false },
    });
    const result = runHook(hookPath, {});
    // V5: MOZZI → webhook 경로 → broker send 무관
    expect(result.stdout).toContain('전송 완료');
  });

  it('CH-5: L1 → MOZZI 라우팅 + peer-map 우선', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writePeerMap(testEnv.tmpDir, {
      MOZZI: { peerId: 'mozzi-mapped' },
      CTO_LEADER: { peerId: 'cto-mapped' },
    });
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['docs/plan.md'],
      mockBroker: {
        health: true,
        peers: [
          { id: 'mozzi-mapped', summary: 'MOZZI | hermes session' },
          { id: 'cto-mapped', summary: 'CTO_LEADER | cto session' },
        ],
        sendOk: true,
      },
    });
    copyHelpersWithMock(testEnv, {
      health: true,
      peers: [
        { id: 'mozzi-mapped', summary: 'MOZZI | hermes session' },
        { id: 'cto-mapped', summary: 'CTO_LEADER | cto session' },
      ],
      sendOk: true,
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('전송 완료');
  });

  it('CH-6: chain-messenger retry → 성공', () => {
    testEnv = createTestEnv();
    writeAnalysisFile(testEnv.tmpDir, 97);
    writeTeamContext(testEnv.tmpDir, 'CTO');
    const hookPath = prepareChainHandoffV2(testEnv, {
      changedFiles: ['src/app/page.tsx'],
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    copyHelpersWithMock(testEnv, { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('전송 완료');
  });
});

// ─── pm-chain-forward ───────────────────────────────────────────────

describe.skip('pm-chain-forward — V2에서 삭제됨 (CTO→MOZZI 직접)', () => {
  it('PF-1: verdict=pass → COO(MOZZI)에게 COMPLETION_REPORT', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass', 'LGTM');
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('pass');
    expect(result.stdout).toContain('MOZZI');
    expect(result.stdout).toContain('전송 완료');
  });

  it('PF-2: verdict=reject → CTO에게 FEEDBACK', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'reject', '타입 에러 미수정', ['tsc 타입 에러 3건']);
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('reject');
    expect(result.stdout).toContain('CTO_LEADER');
    expect(result.stdout).toContain('전송 완료');
  });

  it('PF-3: verdict 없음 → skip', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    // verdict 파일 없음
    const hookPath = preparePmChainForward(testEnv, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('PF-4: CTO 팀 → skip (PM만 대상)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'CTO');
    writePmVerdict(testEnv.tmpDir, 'pass');
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {});
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('PF-5: broker 다운 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass', 'OK');
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('broker 미기동');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  it('PF-6: 대상 peer 미발견 → ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass');
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: [{ id: 'pm1', summary: 'PM_LEADER' }], sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('peer 미발견');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  it('PF-7: teammate → bypass', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass');
    const hookPath = preparePmChainForward(testEnv, {});
    const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('ACTION_REQUIRED');
  });

  it('PF-8: 전송 성공 시 verdict 파일 삭제', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'pass', 'Done');
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('전송 완료');
    const verdictPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'pm-verdict.json');
    expect(existsSync(verdictPath)).toBe(false);
  });
});

// ─── coo-chain-report ───────────────────────────────────────────────

describe.skip('coo-chain-report — V2에서 삭제됨 (CTO→MOZZI 직접)', () => {
  it('CR-1: PM 보고서 → Smith님 보고 파일 생성', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('보고서 생성 완료');
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'coo-smith-report.json');
    expect(existsSync(reportPath)).toBe(true);
  });

  it('CR-2: webhook wake 성공', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('webhook wake 성공');
  });

  it('CR-3: webhook wake 실패 → 수동 보고 필요', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: false });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('webhook wake 실패');
    expect(result.stdout).toContain('수동 보고 필요');
    expect(result.stdout).toContain('ACTION_REQUIRED');
  });

  it('CR-4: PM 보고서 없음 → skip', () => {
    testEnv = createTestEnv();
    // last-pm-report.json 없음
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const result = runHook(hookPath, {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('CR-5: Smith님 보고서에 match_rate + pm_verdict 포함', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir, { match_rate: 98, pm_verdict: 'pass', pm_notes: 'Perfect' });
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    runHook(hookPath, {});
    const reportPath = join(testEnv.tmpDir, '.bkit', 'runtime', 'coo-smith-report.json');
    const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
    expect(report.payload.match_rate).toBe(98);
    expect(report.payload.pm_verdict).toBe('pass');
    expect(report.payload.pm_notes).toBe('Perfect');
  });

  it('CR-6: stdout에 task, match_rate, pm_verdict 출력', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('match_rate: 97%');
    expect(result.stdout).toContain('pm_verdict: pass');
  });
});

// ─── 반려 역방향 (COO→PM→CTO) ──────────────────────────────────────

describe.skip('반려 역방향 체인 — V2에서 삭제됨 (PM 단계 없음)', () => {
  it('FB-1: COO 반려 → PM에게 FEEDBACK 자동 전달', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    writeCooFeedback(testEnv.tmpDir, 'reject', 'UI 수정 필요', ['Button 색상 변경']);
    const hookPath = prepareCooChainReport(testEnv, {
      webhookOk: true,
      mockBroker: { health: true, peers: MOCK_PEERS_WITH_MOZZI, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('반려');
    expect(result.stdout).toContain('PM');
  });

  it('FB-2: COO 반려 + broker 다운 → 수동 전달 ACTION_REQUIRED', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    writeCooFeedback(testEnv.tmpDir, 'reject', '문제 발견');
    const hookPath = prepareCooChainReport(testEnv, {
      webhookOk: true,
      mockBroker: { health: false },
    });
    const result = runHook(hookPath, {});
    // broker down이므로 peer resolve 불가 → 수동 전달
    expect(result.stdout).toContain('ACTION_REQUIRED');
    expect(result.stdout).toContain('PM_LEADER');
  });

  it('FB-3: PM reject → CTO FEEDBACK (PF-2와 동일 패턴)', () => {
    testEnv = createTestEnv();
    writeTeamContext(testEnv.tmpDir, 'PM');
    writePmVerdict(testEnv.tmpDir, 'reject', '빌드 실패', ['npm run build 에러']);
    writeCompletionReport(testEnv.tmpDir);
    const hookPath = preparePmChainForward(testEnv, {
      mockBroker: { health: true, peers: MOCK_PEERS, sendOk: true },
    });
    const result = runHook(hookPath, {});
    expect(result.stdout).toContain('reject');
    expect(result.stdout).toContain('CTO_LEADER');
  });

  it('FB-4: coo-feedback 파일 없으면 반려 처리 안 함', () => {
    testEnv = createTestEnv();
    writePmReport(testEnv.tmpDir);
    // coo-feedback.json 없음
    const hookPath = prepareCooChainReport(testEnv, { webhookOk: true });
    const result = runHook(hookPath, {});
    expect(result.stdout).not.toContain('반려');
    expect(result.stdout).toContain('보고서 생성 완료');
  });
});
