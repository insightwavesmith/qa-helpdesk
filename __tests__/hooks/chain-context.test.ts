// __tests__/hooks/chain-context.test.ts
// CC-1~CC-12: team-context 병렬 팀 분리 + 아카이빙 TDD
//
// 장애 근본 수정: TeamDelete→context 삭제→체인 끊김
// 해결: 팀별 파일 분리 + 삭제→아카이빙 + resolver 통일

import { describe, it, expect, afterEach } from 'vitest';
import {
  writeFileSync, mkdirSync, readFileSync, existsSync,
  unlinkSync, readdirSync, utimesSync,
} from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  createTestEnv,
  cleanupTestEnv,
  writeTeamContext,
  prepareHookWithHelpers,
  runHook,
} from './helpers';

let testEnv: ReturnType<typeof createTestEnv>;

afterEach(() => {
  if (testEnv) cleanupTestEnv(testEnv.tmpDir);
});

// ─── 헬퍼 ───

/** 세션별 team-context 파일 작성 */
function writeSessionTeamContext(
  tmpDir: string,
  sessionName: string,
  team: string,
  opts?: { taskFiles?: string[]; teammates?: string[] }
): string {
  const dir = join(tmpDir, '.bkit', 'runtime');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, `team-context-${sessionName}.json`);
  writeFileSync(filePath, JSON.stringify({
    team,
    session: sessionName,
    created: new Date().toISOString(),
    taskFiles: opts?.taskFiles ?? ['TASK-TEST.md'],
    teammates: opts?.teammates ?? [],
  }));
  return filePath;
}

/** resolver 스크립트를 source 후 함수 실행하고 TEAM_CONTEXT_FILE 반환 */
function runResolver(
  hooksDir: string,
  tmpDir: string,
  env: Record<string, string> = {}
): { exitCode: number; stdout: string; stderr: string; contextFile: string } {
  const resolverPath = join(hooksDir, 'helpers', 'team-context-resolver.sh');
  const wrapper = `#!/bin/bash
set -uo pipefail
PROJECT_DIR="${tmpDir}"
source "${resolverPath}" 2>/dev/null
resolve_team_context
echo "RESOLVED_FILE=\$TEAM_CONTEXT_FILE"
`;
  const wrapperPath = join(hooksDir, '_test_resolver.sh');
  writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    stdout = execSync(`bash "${wrapperPath}"`, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ...env,
        TMUX: env.TMUX ?? '',  // tmux 격리
      },
      timeout: 5000,
    });
  } catch (err: any) {
    exitCode = err.status ?? 1;
    stdout = err.stdout?.toString() ?? '';
    stderr = err.stderr?.toString() ?? '';
  }

  // RESOLVED_FILE 추출
  const match = stdout.match(/RESOLVED_FILE=(.+)/);
  const contextFile = match ? match[1].trim() : '';

  try { unlinkSync(wrapperPath); } catch {}
  return { exitCode, stdout, stderr, contextFile };
}

/** helpers/ 디렉토리에 team-context-resolver.sh 복사 */
function copyResolver(hooksDir: string): void {
  const helpersDir = join(hooksDir, 'helpers');
  mkdirSync(helpersDir, { recursive: true });
  const src = join(process.cwd(), '.claude/hooks/helpers/team-context-resolver.sh');
  if (existsSync(src)) {
    const content = readFileSync(src, 'utf-8');
    writeFileSync(join(helpersDir, 'team-context-resolver.sh'), content, { mode: 0o755 });
  }
}

/** validate-pdca-before-teamdelete.sh 준비 (PROJECT_DIR 치환 + helpers 복사) */
function prepareTeamDeleteHook(env: ReturnType<typeof createTestEnv>): string {
  // pdca-status.json 생성 (PDCA 게이트 통과용 — 최근 갱신)
  const pdcaDir = join(env.tmpDir, 'docs');
  mkdirSync(pdcaDir, { recursive: true });
  writeFileSync(join(pdcaDir, '.pdca-status.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
  }));

  return prepareHookWithHelpers(
    join(process.cwd(), '.claude/hooks/validate-pdca-before-teamdelete.sh'),
    env.tmpDir,
    env.hooksDir
  );
}

// ─── CC-1: resolve_team_context tmux 세션 ───

describe('CC-1~12: team-context 병렬 팀 지원', () => {

  it('CC-1: resolve tmux 세션명 → team-context-{session}.json', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // team-context-sdk-cto.json 생성
    writeSessionTeamContext(testEnv.tmpDir, 'sdk-cto', 'CTO');

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'sdk-cto',
    });

    expect(r.exitCode).toBe(0);
    expect(r.contextFile).toContain('team-context-sdk-cto.json');
  });

  it('CC-2: resolve tmux 없음 → team-context-local.json', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // team-context-local.json 생성
    writeSessionTeamContext(testEnv.tmpDir, 'local', 'CTO');

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: '',
      TMUX: '',
    });

    expect(r.exitCode).toBe(0);
    expect(r.contextFile).toContain('team-context-local.json');
  });

  it('CC-3: resolve 레거시 fallback → team-context.json', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // 레거시 파일만 존재
    writeTeamContext(testEnv.tmpDir, 'CTO');

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'sdk-cto',
    });

    expect(r.exitCode).toBe(0);
    expect(r.contextFile).toContain('team-context.json');
    expect(r.contextFile).not.toContain('team-context-sdk-cto.json');
  });

  it('CC-4: resolve 환경변수 override → TEAM_CONTEXT_FILE 그대로', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // 커스텀 경로에 파일 생성
    const customPath = join(testEnv.runtimeDir, 'custom-context.json');
    writeFileSync(customPath, JSON.stringify({ team: 'CUSTOM' }));

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      TEAM_CONTEXT_FILE: customPath,
    });

    expect(r.exitCode).toBe(0);
    expect(r.contextFile).toBe(customPath);
  });

  it('CC-5: 병렬 팀 독립 context — CTO+PM 각각 별도 파일', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // CTO, PM 별도 context
    const ctoPath = writeSessionTeamContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    const pmPath = writeSessionTeamContext(testEnv.tmpDir, 'sdk-pm', 'PM');

    // CTO resolve
    const rCto = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'sdk-cto',
    });
    expect(rCto.contextFile).toContain('team-context-sdk-cto.json');

    // PM resolve
    const rPm = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'sdk-pm',
    });
    expect(rPm.contextFile).toContain('team-context-sdk-pm.json');

    // 파일이 독립적으로 존재
    const ctoData = JSON.parse(readFileSync(ctoPath, 'utf-8'));
    const pmData = JSON.parse(readFileSync(pmPath, 'utf-8'));
    expect(ctoData.team).toBe('CTO');
    expect(pmData.team).toBe('PM');
  });

  it('CC-6: TeamDelete → rm 아닌 mv .archived.json', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTeamDeleteHook(testEnv);

    // 세션별 context 생성
    const ctxPath = writeSessionTeamContext(testEnv.tmpDir, 'sdk-cto', 'CTO');

    // hook 실행 (IS_TEAMMATE=false → 리더)
    const r = runHook(hookPath, {
      IS_TEAMMATE: 'false',
      TMUX: '',
      TEAM_CONTEXT_FILE: ctxPath,
    });

    expect(r.exitCode).toBe(0);

    // 원본 삭제 확인
    expect(existsSync(ctxPath)).toBe(false);

    // 아카이브 존재 확인
    const archivedPath = ctxPath.replace('.json', '.archived.json');
    expect(existsSync(archivedPath)).toBe(true);

    // 아카이브 내용 보존
    const data = JSON.parse(readFileSync(archivedPath, 'utf-8'));
    expect(data.team).toBe('CTO');
  });

  it('CC-7: 아카이브 후 resolve → 아카이브 파일 반환 (체인 참조)', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // 아카이브 파일만 존재 (활성 파일 없음)
    const archivedPath = join(testEnv.runtimeDir, 'team-context-sdk-cto.archived.json');
    writeFileSync(archivedPath, JSON.stringify({ team: 'CTO', session: 'sdk-cto' }));

    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'sdk-cto',
    });

    expect(r.exitCode).toBe(0);
    expect(r.contextFile).toContain('.archived.json');
  });

  it('CC-8: PM TeamDelete 후 CTO context 영향 없음', () => {
    testEnv = createTestEnv();
    const hookPath = prepareTeamDeleteHook(testEnv);

    // CTO + PM 각각 context
    const ctoPath = writeSessionTeamContext(testEnv.tmpDir, 'sdk-cto', 'CTO');
    const pmPath = writeSessionTeamContext(testEnv.tmpDir, 'sdk-pm', 'PM');

    // PM TeamDelete (PM context만 아카이빙)
    runHook(hookPath, {
      IS_TEAMMATE: 'false',
      TMUX: '',
      TEAM_CONTEXT_FILE: pmPath,
    });

    // CTO context 여전히 존재
    expect(existsSync(ctoPath)).toBe(true);
    const ctoData = JSON.parse(readFileSync(ctoPath, 'utf-8'));
    expect(ctoData.team).toBe('CTO');

    // PM은 아카이빙됨
    expect(existsSync(pmPath)).toBe(false);
    expect(existsSync(pmPath.replace('.json', '.archived.json'))).toBe(true);
  });

  it('CC-9: 아카이브 자동 정리 (62분 전 파일 삭제)', () => {
    testEnv = createTestEnv();

    // 62분 전 아카이브 파일 생성
    const archivedPath = join(testEnv.runtimeDir, 'team-context-old.archived.json');
    writeFileSync(archivedPath, JSON.stringify({ team: 'OLD' }));
    // 62분 전 타임스탬프 설정
    const sixtyTwoMinAgo = new Date(Date.now() - 62 * 60 * 1000);
    utimesSync(archivedPath, sixtyTwoMinAgo, sixtyTwoMinAgo);

    // 5분 전 아카이브 (삭제되면 안 됨)
    const recentPath = join(testEnv.runtimeDir, 'team-context-recent.archived.json');
    writeFileSync(recentPath, JSON.stringify({ team: 'RECENT' }));

    // session-resume-check.sh 준비 + 실행
    const hookPath = prepareHookWithHelpers(
      join(process.cwd(), '.claude/hooks/session-resume-check.sh'),
      testEnv.tmpDir,
      testEnv.hooksDir
    );

    runHook(hookPath, { TMUX: '' });

    // 62분 전 아카이브는 삭제
    expect(existsSync(archivedPath)).toBe(false);
    // 5분 전 아카이브는 유지
    expect(existsSync(recentPath)).toBe(true);
  });

  it('CC-10: task-completed 병렬 — CTO+PM 각각 BOARD.json 독립 갱신', () => {
    testEnv = createTestEnv();

    // BOARD.json 준비
    const boardDir = join(testEnv.tmpDir, '.claude', 'tasks');
    mkdirSync(boardDir, { recursive: true });
    writeFileSync(join(boardDir, 'BOARD.json'), JSON.stringify({
      teams: {
        CTO: { completedCount: 0, totalCount: 0 },
        PM: { completedCount: 0, totalCount: 0 },
      },
      updatedAt: new Date().toISOString(),
    }));

    // CTO TASK 파일 (1 checked, 1 unchecked)
    writeFileSync(join(boardDir, 'TASK-CTO.md'), `---
team: CTO
status: in-progress
---
# CTO Task
- [x] done item
- [ ] pending item
`);

    // PM TASK 파일 (2 checked)
    writeFileSync(join(boardDir, 'TASK-PM.md'), `---
team: PM
status: in-progress
---
# PM Task
- [x] done 1
- [x] done 2
`);

    // CTO context
    writeSessionTeamContext(testEnv.tmpDir, 'sdk-cto', 'CTO', {
      taskFiles: ['TASK-CTO.md'],
    });

    // PM context
    writeSessionTeamContext(testEnv.tmpDir, 'sdk-pm', 'PM', {
      taskFiles: ['TASK-PM.md'],
    });

    // task-completed.sh 준비 (CTO context로)
    const ctoCtxPath = join(testEnv.runtimeDir, 'team-context-sdk-cto.json');
    const hookPath = prepareHookWithHelpers(
      join(process.cwd(), '.claude/hooks/task-completed.sh'),
      testEnv.tmpDir,
      testEnv.hooksDir
    );

    // CTO 완료
    runHook(hookPath, {
      TMUX: '',
      TEAM_CONTEXT_FILE: ctoCtxPath,
    });

    // BOARD.json 확인
    const board = JSON.parse(readFileSync(join(boardDir, 'BOARD.json'), 'utf-8'));
    expect(board.teams.CTO.completedCount).toBe(1);
    expect(board.teams.CTO.totalCount).toBe(2);
    // PM은 아직 미갱신
    expect(board.teams.PM.completedCount).toBe(0);
  });

  it('CC-11: context 없는 세션 → silent exit 0', () => {
    testEnv = createTestEnv();
    copyResolver(testEnv.hooksDir);

    // 아무 context 파일도 없음
    const r = runResolver(testEnv.hooksDir, testEnv.tmpDir, {
      _MOCK_SESSION_NAME: 'nonexistent',
    });

    expect(r.exitCode).toBe(0);
    // TEAM_CONTEXT_FILE은 설정되지만 파일이 없음 (호출자가 -f 체크)
    expect(r.contextFile).toContain('team-context-nonexistent.json');
  });

  it('CC-12: load_team_context() → resolver 경유 → 팀별 파일 읽기', () => {
    testEnv = createTestEnv();

    // helpers에 frontmatter-parser.sh + resolver 복사
    const helpersDir = join(testEnv.hooksDir, 'helpers');
    mkdirSync(helpersDir, { recursive: true });

    const fpSrc = join(process.cwd(), '.claude/hooks/helpers/frontmatter-parser.sh');
    let fpContent = readFileSync(fpSrc, 'utf-8');
    fpContent = fpContent.replace(/PROJECT_DIR="[^"]*"/, `PROJECT_DIR="${testEnv.tmpDir}"`);
    writeFileSync(join(helpersDir, 'frontmatter-parser.sh'), fpContent, { mode: 0o755 });

    copyResolver(testEnv.hooksDir);

    // 세션별 context 생성
    writeSessionTeamContext(testEnv.tmpDir, 'sdk-cto', 'CTO', {
      taskFiles: ['TASK-CHAIN.md'],
    });

    // wrapper: frontmatter-parser를 source → load_team_context → 결과 출력
    const wrapper = `#!/bin/bash
set -uo pipefail
PROJECT_DIR="${testEnv.tmpDir}"
source "${join(helpersDir, 'frontmatter-parser.sh')}" 2>/dev/null
load_team_context
echo "TEAM=$TEAM_NAME"
echo "TASKS=$TASK_FILES"
`;
    const wrapperPath = join(testEnv.hooksDir, '_test_fp.sh');
    writeFileSync(wrapperPath, wrapper, { mode: 0o755 });

    let stdout = '';
    try {
      stdout = execSync(`bash "${wrapperPath}"`, {
        encoding: 'utf-8',
        env: {
          ...process.env,
          TMUX: '',
          _MOCK_SESSION_NAME: 'sdk-cto',
          TEAM_CONTEXT_FILE: join(testEnv.runtimeDir, 'team-context-sdk-cto.json'),
        },
        timeout: 5000,
      });
    } catch (err: any) {
      stdout = err.stdout?.toString() ?? '';
    }

    expect(stdout).toContain('TEAM=CTO');
    expect(stdout).toContain('TASKS=TASK-CHAIN.md');
  });
});
