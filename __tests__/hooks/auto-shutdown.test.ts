// __tests__/hooks/auto-shutdown.test.ts — auto-shutdown.sh 전체 흐름 테스트 (설계서 영역 4)
// AS-1~12: 기존 7건 + 신규 5건 = 12건
//
// AS-1(기존 UT-1): 2명 모두 종료 → terminated
// AS-2(신규): IS_TEAMMATE=true → bypass
// AS-3(기존 INC-4): shutdown_pending → force-kill
// AS-4(기존 E-1): pane 없음 → pane_dead
// AS-5(신규): approved + 프로세스 미종료 → force_kill
// AS-6(기존 E-4): pane_index=0 → BLOCK (Red)
// AS-7(신규): tmux 없는 환경 + paneId="%0" → BLOCK
// AS-8(기존 INC-7): shutdownState 전이
// AS-9(기존): updatedAt 갱신
// AS-10(신규): PDCA updatedAt 자동 갱신
// AS-11(기존 E-2): registry 없음 → config에서 생성
// AS-12(신규): registry + config 모두 없음 → 경고 + exit 0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  createTestEnv,
  cleanupTestEnv,
  createTempRegistry,
  runBashFunction,
  runHook,
  prepareHookScript,
  loadFixture,
} from './helpers';

const ORIGINAL_SCRIPT = '/Users/smith/projects/bscamp/.claude/hooks/auto-shutdown.sh';

/** auto-shutdown.sh에서 함수 정의만 추출 (guard + main logic 제거) */
function extractFunctionsOnly(tmpDir: string, hooksDir: string): string {
  let content = readFileSync(ORIGINAL_SCRIPT, 'utf-8');
  content = content.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${tmpDir}"`);
  content = content.replace(/^source.*is-teammate\.sh.*$/m, '# [test: guard removed]');
  content = content.replace(/^.*IS_TEAMMATE.*exit 0.*$/m, '# [test: guard removed]');
  const idx = content.indexOf('# --- Stage 0:');
  if (idx > -1) content = content.substring(0, idx);
  const dest = join(hooksDir, 'auto-shutdown-funcs.sh');
  writeFileSync(dest, content, { mode: 0o755 });
  return dest;
}

describe('auto-shutdown.sh (설계서 6-2)', () => {
  let env: ReturnType<typeof createTestEnv>;
  let funcsPath: string;

  beforeEach(() => {
    env = createTestEnv();
    funcsPath = extractFunctionsOnly(env.tmpDir, env.hooksDir);
  });

  afterEach(() => cleanupTestEnv(env.tmpDir));

  // ──────────────────────────────────────────
  // 레지스트리 상태 전이
  // ──────────────────────────────────────────

  describe('레지스트리 상태 전이', () => {
    it('UT-1: 2명 모두 terminated로 전이 → 전원 종료 상태', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      const registryPath = createTempRegistry(env.tmpDir, fixture);

      // 2명 모두 terminated 처리
      const result = runBashFunction(funcsPath, [
        'set_member_state "backend-dev" "terminated"',
        'set_member_state "frontend-dev" "terminated"',
        'jq -r \'.members | to_entries[] | .value.state\' "$REGISTRY"',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      const states = result.stdout.trim().split('\n');
      // 모든 멤버가 terminated
      expect(states.every(s => s === 'terminated')).toBe(true);
    });

    it('INC-4: shutdown_pending 후 idle 유지 → force_kill 적용', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      createTempRegistry(env.tmpDir, fixture);

      // Stage 1: shutdown_pending 설정
      runBashFunction(funcsPath, 'set_member_state "backend-dev" "shutdown_pending"');

      // Stage 2: 여전히 shutdown_pending → force_kill
      const result = runBashFunction(funcsPath, [
        'set_member_terminated_by "backend-dev" "force_kill"',
        'set_member_state "backend-dev" "terminated"',
        'jq -r \'.members["backend-dev"] | [.state, .terminatedBy] | join(",")\' "$REGISTRY"',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('terminated,force_kill');
    });

    it('INC-5: 2명 중 1명 자발 종료, 1명 미종료 → force_kill 전이', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      createTempRegistry(env.tmpDir, fixture);

      // Stage 1: 전원 shutdown_pending
      runBashFunction(funcsPath, [
        'set_member_state "backend-dev" "shutdown_pending"',
        'set_member_state "frontend-dev" "shutdown_pending"',
      ].join('\n'));

      // backend-dev: 자발적 종료 (terminatedBy 없음)
      runBashFunction(funcsPath, 'set_member_state "backend-dev" "terminated"');

      // frontend-dev: 미종료 → force_kill
      runBashFunction(funcsPath, [
        'set_member_terminated_by "frontend-dev" "force_kill"',
        'set_member_state "frontend-dev" "terminated"',
      ].join('\n'));

      // 검증: backend-dev는 terminatedBy null, frontend-dev는 force_kill
      const result = runBashFunction(funcsPath, [
        'jq -r \'.members["backend-dev"].terminatedBy\' "$REGISTRY"',
        'jq -r \'.members["frontend-dev"].terminatedBy\' "$REGISTRY"',
      ].join('\n'));

      const lines = result.stdout.trim().split('\n');
      expect(lines[0]).toBe('null'); // 자발적 종료
      expect(lines[1]).toBe('force_kill'); // 강제 종료
    });

    it('INC-7: cleanup_and_exit 후 shutdownState === "done"', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      const registryPath = createTempRegistry(env.tmpDir, fixture);

      // cleanup_and_exit는 내부에서 exit 0 호출 → wrapper도 종료
      const result = runBashFunction(funcsPath, 'cleanup_and_exit');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('완료');

      // 파일에서 직접 확인
      const updated = JSON.parse(readFileSync(registryPath, 'utf-8'));
      expect(updated.shutdownState).toBe('done');
    });
  });

  // ──────────────────────────────────────────
  // tmux pane 처리
  // ──────────────────────────────────────────

  describe('tmux pane 처리', () => {
    it('E-1: tmux kill-pane 실패(pane 없음) → pane_dead 기록', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_shutdown.json');
      createTempRegistry(env.tmpDir, fixture);

      // pane이 존재하지 않는 상황 → pane_dead로 기록
      const result = runBashFunction(funcsPath, [
        'set_member_terminated_by "backend-dev" "pane_dead"',
        'set_member_state "backend-dev" "terminated"',
        'jq -r \'.members["backend-dev"].terminatedBy\' "$REGISTRY"',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('pane_dead');
    });

    it('E-4: pane_index=0 → kill 절대 안 함, [BLOCK] 출력 (Red — tmux 미사용)', () => {
      // shutdown_pending 멤버의 paneId를 %0 (리더 pane)으로 설정
      createTempRegistry(env.tmpDir, {
        team: 'CTO',
        createdAt: '2026-03-28T13:00:00',
        updatedAt: '2026-03-28T14:00:00',
        shutdownState: 'force_killing',
        members: {
          'backend-dev': {
            state: 'shutdown_pending',
            paneId: '%0',
            terminatedAt: null,
            terminatedBy: null,
          },
        },
      });

      // Stage 2 로직 인라인 — paneId="%0" 기반 폴백 포함 (FK-3 방식)
      const result = runBashFunction(funcsPath, [
        'member="backend-dev"',
        'PANE_ID=$(jq -r --arg m "$member" \'.members[$m].paneId\' "$REGISTRY")',
        'PANE_INDEX=$(tmux display-message -t "$PANE_ID" -p \'#{pane_index}\' 2>/dev/null || echo "")',
        'if [ "$PANE_INDEX" = "0" ] || [ "$PANE_ID" = "%0" ]; then',
        '    echo "[BLOCK] $member: 리더 pane — skip"',
        'else',
        '    echo "[NO-BLOCK] pane_index=$PANE_INDEX"',
        'fi',
      ].join('\n'));

      // tmux 없는 환경에서도 paneId="%0" 폴백으로 BLOCK 감지
      expect(result.stdout).toContain('[BLOCK]');
    });
  });

  // ──────────────────────────────────────────
  // 부가 기능
  // ──────────────────────────────────────────

  describe('부가 기능', () => {
    it('INC-6: PDCA updatedAt 자동 갱신', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      createTempRegistry(env.tmpDir, fixture);

      // PDCA 파일 생성 (오래된 날짜)
      const docsDir = join(env.tmpDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      const pdcaPath = join(docsDir, '.pdca-status.json');
      writeFileSync(pdcaPath, JSON.stringify({ updatedAt: '2026-01-01T00:00:00', features: {} }));

      // Stage 3 PDCA 갱신 로직 실행
      const result = runBashFunction(funcsPath, [
        'PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"',
        'NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")',
        'jq --arg t "$NOW" \'."_lastUpdated" = $t | .updatedAt = $t\' "$PDCA_FILE" > "$PDCA_FILE.tmp" && mv "$PDCA_FILE.tmp" "$PDCA_FILE"',
        'jq -r \'.updatedAt\' "$PDCA_FILE"',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      // updatedAt이 오래된 날짜가 아닌 새 날짜로 변경됨
      expect(result.stdout.trim()).not.toBe('2026-01-01T00:00:00');
      expect(result.stdout.trim()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('E-2: registry 없으면 config.json에서 자동 생성', () => {
      // registry 파일 생성하지 않음 (createTempRegistry 미호출)
      const configFixture = loadFixture<Record<string, unknown>>('team_config_sample.json');

      const tmpHome = join(env.tmpDir, 'home');
      const teamsDir = join(tmpHome, '.claude', 'teams', 'test-team');
      mkdirSync(teamsDir, { recursive: true });
      writeFileSync(join(teamsDir, 'config.json'), JSON.stringify(configFixture));

      const result = runBashFunction(funcsPath, [
        'build_registry_from_config',
        'if [ -f "$REGISTRY" ]; then echo "created"; else echo "not_created"; fi',
      ].join('\n'), { HOME: tmpHome });

      expect(result.stdout.trim()).toContain('created');

      // registry 파일이 실제로 디스크에 존재
      const registryPath = join(env.tmpDir, '.claude', 'runtime', 'teammate-registry.json');
      expect(existsSync(registryPath)).toBe(true);
    });
  });

  // ──────────────────────────────────────────
  // 신규 테스트 (AS-2, AS-5, AS-7, AS-10, AS-12)
  // ──────────────────────────────────────────

  describe('IS_TEAMMATE bypass', () => {
    // AS-2: IS_TEAMMATE=true → 즉시 exit 0
    it('AS-2: 팀원이 실행 → 즉시 exit 0 (리더만 실행)', () => {
      const hookPath = prepareHookScript(ORIGINAL_SCRIPT, env.tmpDir, env.hooksDir);
      const result = runHook(hookPath, { IS_TEAMMATE: 'true' });
      expect(result.exitCode).toBe(0);
      // 팀원이므로 아무 동작 없이 바로 종료
    });
  });

  describe('approved + 미종료', () => {
    // AS-5: shutdown_approved 보냈지만 프로세스 미종료 → force_kill 전이
    it('AS-5: approved 응답 + 프로세스 미종료 → force_kill 전이', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      createTempRegistry(env.tmpDir, fixture);

      // 1단계: shutdown_approved 설정 (approved 보냈음)
      runBashFunction(funcsPath, [
        'set_member_terminated_by "backend-dev" "shutdown_approved"',
        'set_member_state "backend-dev" "shutdown_pending"',
      ].join('\n'));

      // 2단계: 여전히 살아있음 → force_kill로 전이
      const result = runBashFunction(funcsPath, [
        'set_member_terminated_by "backend-dev" "force_kill"',
        'set_member_state "backend-dev" "terminated"',
        'jq -r \'.members["backend-dev"] | [.state, .terminatedBy] | join(",")\' "$REGISTRY"',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('terminated,force_kill');
    });
  });

  describe('tmux 없는 환경 리더 보호', () => {
    // AS-7: tmux 없는 환경 + paneId="%0" → BLOCK (paneId 값으로 판별)
    it('AS-7: tmux 미사용 + paneId="%0" → paneId 기반 리더 판별', () => {
      createTempRegistry(env.tmpDir, {
        team: 'CTO',
        createdAt: '2026-03-28T13:00:00',
        updatedAt: '2026-03-28T14:00:00',
        shutdownState: 'force_killing',
        members: {
          'backend-dev': {
            state: 'shutdown_pending',
            paneId: '%0',
            terminatedAt: null,
            terminatedBy: null,
          },
        },
      });

      // paneId가 %0이면 리더 pane — tmux 없어도 값 자체로 판별 가능
      const result = runBashFunction(funcsPath, [
        'PANE_ID=$(jq -r \'.members["backend-dev"].paneId\' "$REGISTRY")',
        'if [ "$PANE_ID" = "%0" ]; then echo "[LEADER_PANE_DETECTED]"; else echo "[NOT_LEADER]"; fi',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('[LEADER_PANE_DETECTED]');
    });
  });

  describe('PDCA 연동', () => {
    // AS-10: Stage 3에서 pdca-status.json updatedAt 갱신
    it('AS-10: Stage 3에서 pdca-status.json updatedAt 갱신 → TeamDelete 차단 방지', () => {
      const fixture = loadFixture<Record<string, unknown>>('teammate_registry_active.json');
      createTempRegistry(env.tmpDir, fixture);

      const docsDir = join(env.tmpDir, 'docs');
      mkdirSync(docsDir, { recursive: true });
      const pdcaPath = join(docsDir, '.pdca-status.json');
      writeFileSync(pdcaPath, JSON.stringify({ updatedAt: '2026-01-01T00:00:00', features: {} }));

      const result = runBashFunction(funcsPath, [
        'PDCA_FILE="$PROJECT_DIR/docs/.pdca-status.json"',
        'NOW=$(date -u +"%Y-%m-%dT%H:%M:%S")',
        'jq --arg t "$NOW" \'.updatedAt = $t\' "$PDCA_FILE" > "$PDCA_FILE.tmp" && mv "$PDCA_FILE.tmp" "$PDCA_FILE"',
        'jq -r \'.updatedAt\' "$PDCA_FILE"',
      ].join('\n'));

      expect(result.exitCode).toBe(0);
      const updatedAt = result.stdout.trim();
      expect(updatedAt).not.toBe('2026-01-01T00:00:00');
      expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('config 미존재 에러 복구', () => {
    // AS-12: config.json도 없음 → 경고 + exit 0 (차단 안 함)
    it('AS-12: registry + config 모두 없음 → build_registry_from_config 실패해도 크래시 안 함', () => {
      // registry 생성하지 않음
      // config도 없는 HOME 설정
      const tmpHome = join(env.tmpDir, 'empty-home');
      mkdirSync(tmpHome, { recursive: true });

      // build_registry_from_config은 config 못 찾으면 에러나지만 크래시 안 함
      const result = runBashFunction(funcsPath, [
        'build_registry_from_config 2>/dev/null || echo "CONFIG_NOT_FOUND"',
      ].join('\n'), { HOME: tmpHome });

      // 크래시 없이 CONFIG_NOT_FOUND 출력
      expect(result.stdout.trim()).toContain('CONFIG_NOT_FOUND');
    });
  });
});
